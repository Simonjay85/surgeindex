import { execFileSync } from "node:child_process";
import type { ExecFileSyncOptionsWithStringEncoding } from "node:child_process";
import {
  account,
  adminAuditLog,
  assertFanwardFixtureOutputSafe,
  buildFanwardFixtureEvidence,
  buildFanwardFixtureRateLimitKeys,
  category,
  closeDb,
  creatorProfile,
  creatorProfileRevision,
  FANWARD_FIXTURE_ALLOWED_DIRECT_FK_CONSTRAINTS,
  FANWARD_FIXTURE_DATABASE,
  FANWARD_FIXTURE_MIGRATION_COUNT,
  FANWARD_FIXTURE_SCHEMA_15_DIRECT_REFERENCES,
  FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES,
  findFanwardFixtureForeignKeyGraphDrift,
  findFanwardFixtureMutationDrift,
  findFanwardFixtureRateLimitPhaseDrift,
  findFanwardFixtureDrift,
  getPostgresDb,
  isFanwardFixtureInternalPostgresEndpoint,
  moderationAction,
  rateLimitBucket,
  readFanwardFixtureIds,
  readFanwardFixtureRateLimitPhase,
  readFanwardFixtureSecrets,
  session,
  site,
  siteOwner,
  siteVerification,
  subtractFanwardFixtureMutationCounters,
  user,
  validateFanwardStagingFixtureEnvironment,
  verificationToken,
  waitlistEntry,
  assertFanwardFixtureSessionRevokeConfirmation,
  type FanwardFixtureCommand,
  type FanwardFixtureContext,
  type FanwardFixtureIds,
  type FanwardFixtureMutationInventory,
  type FanwardFixturePrincipalSnapshot,
  type FanwardFixtureRateLimitPhase,
  type FanwardFixtureSecrets,
  type FanwardFixtureSnapshot,
  type PostgresDatabase,
} from "@surge/db";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import {
  hashFanwardFixturePassword,
  verifyFanwardFixturePassword,
} from "../apps/web/lib/server/fanward-staging-fixture-crypto";

type FixtureTransaction = Parameters<Parameters<PostgresDatabase["transaction"]>[0]>[0];

class FixtureOperationError extends Error {}

function parseCommand(): FanwardFixtureCommand {
  const command = process.argv.slice(2).find((argument) => argument !== "--");
  if (command === "create" || command === "status" || command === "cleanup" || command === "revoke-sessions") return command;
  throw new Error("Usage: pnpm fanward:fixture -- <create|status|cleanup|revoke-sessions>");
}

function checkoutSha(): string {
  try {
    const options: ExecFileSyncOptionsWithStringEncoding = {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    };
    const sha = execFileSync("git", ["rev-parse", "HEAD"], options).trim();
    const trackedStatus = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], options).trim();
    if (trackedStatus) throw new Error("dirty");
    return sha;
  } catch {
    throw new Error("The fixture command must run from an exact clean Git release checkout.");
  }
}

function numberValue(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function assertConnectedStagingDatabase(db: PostgresDatabase): Promise<void> {
  const result = await db.execute(sql`
    select
      current_database() as database_name,
      inet_server_addr()::text as server_address,
      inet_server_port()::int as server_port,
      (select count(*)::int from drizzle.__drizzle_migrations) as migration_count,
      to_regclass('public.creator_profile') is not null as has_creator_profile
  `);
  const row = result.rows[0] as Record<string, unknown> | undefined;
  if (
    row?.database_name !== FANWARD_FIXTURE_DATABASE
    || typeof row?.server_address !== "string"
    || !isFanwardFixtureInternalPostgresEndpoint(row.server_address, numberValue(row.server_port))
    || numberValue(row?.migration_count) !== FANWARD_FIXTURE_MIGRATION_COUNT
    || row?.has_creator_profile !== true
  ) {
    throw new FixtureOperationError("Connected database is not the exact migration-15 Fanward staging database.");
  }
}

async function lockFixture(tx: FixtureTransaction, context: FanwardFixtureContext, shared = false): Promise<void> {
  const lockKey = `fanward-staging-fixture:${context.runId}:${context.releaseSha}`;
  if (shared) {
    await tx.execute(sql`select pg_advisory_xact_lock_shared(hashtextextended(${lockKey}, 0))`);
  } else {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))`);
  }
}

function fixtureAffectedTables(): string[] {
  const tables = new Set(["public.site", "public.user"]);
  for (const signature of FANWARD_FIXTURE_SCHEMA_15_FK_SIGNATURES) {
    const match = /^[^|]+\|([^>(]+)\([^)]*\)>([^>(]+)\([^)]*\)\|/.exec(signature);
    if (!match) throw new FixtureOperationError("The reviewed fixture FK signature set is malformed.");
    tables.add(match[1]);
    tables.add(match[2]);
  }
  return [...tables].sort();
}

function quoteQualifiedTable(value: string): string {
  const match = /^([a-z_][a-z0-9_]*)\.([a-z_][a-z0-9_]*)$/.exec(value);
  if (!match) throw new FixtureOperationError("Fixture schema inspection returned an unsafe relation name.");
  return `"${match[1]}"."${match[2]}"`;
}

function quoteColumn(value: string): string {
  if (!/^[a-z_][a-z0-9_]*$/.test(value)) {
    throw new FixtureOperationError("The reviewed fixture FK graph contains an unsafe column name.");
  }
  return `"${value}"`;
}

async function readFixtureForeignKeySignatures(tx: FixtureTransaction): Promise<string[]> {
  const result = await tx.execute(sql`
    with recursive cascade_reachable(table_oid) as (
      select relation.oid
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname in ('site', 'user')
      union
      select foreign_key.conrelid
      from cascade_reachable parent
      join pg_constraint foreign_key
        on foreign_key.contype = 'f'
       and foreign_key.confrelid = parent.table_oid
       and foreign_key.confdeltype = 'c'
    )
    select
      foreign_key.conname as constraint_name,
      child_namespace.nspname as child_schema,
      child.relname as child_table,
      parent_namespace.nspname as parent_schema,
      parent.relname as parent_table,
      (
        select string_agg(attribute.attname, ',' order by key_column.ordinality)
        from unnest(foreign_key.conkey) with ordinality as key_column(attnum, ordinality)
        join pg_attribute attribute
          on attribute.attrelid = foreign_key.conrelid
         and attribute.attnum = key_column.attnum
      ) as child_columns,
      (
        select string_agg(attribute.attname, ',' order by key_column.ordinality)
        from unnest(foreign_key.confkey) with ordinality as key_column(attnum, ordinality)
        join pg_attribute attribute
          on attribute.attrelid = foreign_key.confrelid
         and attribute.attnum = key_column.attnum
      ) as parent_columns,
      foreign_key.confdeltype as delete_action,
      foreign_key.confupdtype as update_action,
      foreign_key.convalidated as validated,
      foreign_key.condeferrable as deferrable,
      foreign_key.condeferred as deferred
    from pg_constraint foreign_key
    join cascade_reachable parent_reachable on parent_reachable.table_oid = foreign_key.confrelid
    join pg_class child on child.oid = foreign_key.conrelid
    join pg_namespace child_namespace on child_namespace.oid = child.relnamespace
    join pg_class parent on parent.oid = foreign_key.confrelid
    join pg_namespace parent_namespace on parent_namespace.oid = parent.relnamespace
    where foreign_key.contype = 'f'
    order by foreign_key.conname, child_namespace.nspname, child.relname
  `);
  return result.rows.map((rawRow) => {
    const row = rawRow as Record<string, unknown>;
    return `${String(row.constraint_name)}|${String(row.child_schema)}.${String(row.child_table)}(${String(row.child_columns)})>${String(row.parent_schema)}.${String(row.parent_table)}(${String(row.parent_columns)})|d=${String(row.delete_action)}|u=${String(row.update_action)}|v=${row.validated === true ? 1 : 0}|f=${row.deferrable === true ? 1 : 0}|i=${row.deferred === true ? 1 : 0}`;
  }).sort();
}

async function assertFixtureSchemaSafe(tx: FixtureTransaction): Promise<void> {
  const signatures = await readFixtureForeignKeySignatures(tx);
  const graphDrift = findFanwardFixtureForeignKeyGraphDrift(signatures);
  if (graphDrift.length) {
    throw new FixtureOperationError(`Cleanup refused because the migration-15 FK graph drifted: ${graphDrift.join(",")}.`);
  }
  if (signatures.some((signature) => signature.includes("|d=d|"))) {
    throw new FixtureOperationError("Cleanup refused because a reachable FK uses SET DEFAULT.");
  }

  const security = await tx.execute(sql`
    select
      namespace.nspname as schema_name,
      relation.relname as table_name,
      relation.relkind,
      relation.relrowsecurity as row_security,
      relation.relforcerowsecurity as force_row_security,
      exists (
        select 1 from pg_trigger user_trigger
        where user_trigger.tgrelid = relation.oid and not user_trigger.tgisinternal
      ) as has_user_trigger,
      exists (
        select 1 from pg_rewrite rewrite_rule
        where rewrite_rule.ev_class = relation.oid and rewrite_rule.rulename <> '_RETURN'
      ) as has_rewrite_rule,
      exists (
        select 1 from pg_policy policy
        where policy.polrelid = relation.oid
      ) as has_policy
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
  `);
  const expectedTables = new Set([
    ...fixtureAffectedTables(),
    "public.rate_limit_bucket",
    "public.verification_token",
    "public.waitlist_entry",
  ]);
  const inspectedTables = new Set<string>();
  for (const rawRow of security.rows) {
    const row = rawRow as Record<string, unknown>;
    const table = `${String(row.schema_name)}.${String(row.table_name)}`;
    if (!expectedTables.has(table)) continue;
    inspectedTables.add(table);
    if (
      (row.relkind !== "r" && row.relkind !== "p")
      || row.row_security === true
      || row.force_row_security === true
      || row.has_user_trigger === true
      || row.has_rewrite_rule === true
      || row.has_policy === true
    ) throw new FixtureOperationError(`Cleanup refused unsafe relation semantics for ${table}.`);
  }
  if (inspectedTables.size !== expectedTables.size) {
    throw new FixtureOperationError("Cleanup refused because an expected mutation relation is missing.");
  }
}

async function lockFixtureMutationTables(tx: FixtureTransaction): Promise<void> {
  const tables = [
    ...fixtureAffectedTables(),
    "public.rate_limit_bucket",
    "public.verification_token",
    "public.waitlist_entry",
  ];
  const quoted = [...new Set(tables)].sort().map(quoteQualifiedTable).join(", ");
  await tx.execute(sql.raw(`lock table ${quoted} in share row exclusive mode nowait`));
}

interface FixtureNonForeignKeyInventory {
  rateLimitKeys: string[];
  rateLimitPresentKeys: string[];
  rateLimitRowCount: number;
  verificationTokenCount: number;
  waitlistEntryCount: number;
}

async function collectNonForeignKeyInventory(
  tx: FixtureTransaction,
  context: FanwardFixtureContext,
  ids: Pick<FanwardFixtureIds, "ownerUserId" | "adminUserId">,
  authSecret: string,
): Promise<FixtureNonForeignKeyInventory> {
  const rateKeys = buildFanwardFixtureRateLimitKeys(context, ids, authSecret);
  const rateRows = await tx
    .select({ key: rateLimitBucket.key })
    .from(rateLimitBucket)
    .where(inArray(rateLimitBucket.key, rateKeys));
  const verificationRows = await tx
    .select({ id: verificationToken.id })
    .from(verificationToken)
    .where(or(
      inArray(verificationToken.identifier, [context.identity.ownerEmail, context.identity.adminEmail]),
      inArray(verificationToken.value, [ids.ownerUserId, ids.adminUserId]),
    ));
  const waitlistRows = await tx
    .select({ id: waitlistEntry.id })
    .from(waitlistEntry)
    .where(inArray(waitlistEntry.email, [context.identity.ownerEmail, context.identity.adminEmail]));
  return {
    rateLimitKeys: rateKeys,
    rateLimitPresentKeys: rateRows.map((row) => row.key).sort(),
    rateLimitRowCount: rateRows.length,
    verificationTokenCount: verificationRows.length,
    waitlistEntryCount: waitlistRows.length,
  };
}

function safeMutationCounter(value: unknown, label: string): number {
  const raw = typeof value === "bigint" ? value.toString() : String(value ?? "");
  if (!/^\d+$/.test(raw)) throw new FixtureOperationError(`Invalid PostgreSQL mutation counter for ${label}.`);
  const parsed = BigInt(raw);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new FixtureOperationError(`PostgreSQL mutation counter exceeded the safe integer range for ${label}.`);
  }
  return Number(parsed);
}

async function readMutationCounters(tx: FixtureTransaction): Promise<FanwardFixtureMutationInventory> {
  const trackCounts = await tx.execute(sql`select current_setting('track_counts') = 'on' as enabled`);
  if ((trackCounts.rows[0] as Record<string, unknown> | undefined)?.enabled !== true) {
    throw new FixtureOperationError("Cleanup requires PostgreSQL track_counts=on.");
  }
  const result = await tx.execute(sql`
    select schemaname, relname, n_tup_ins, n_tup_upd, n_tup_del
    from pg_stat_xact_user_tables
    order by schemaname, relname
  `);
  const inventory: FanwardFixtureMutationInventory = {};
  for (const rawRow of result.rows) {
    const row = rawRow as Record<string, unknown>;
    const table = `${String(row.schemaname)}.${String(row.relname)}`;
    const mutation = {
      inserted: safeMutationCounter(row.n_tup_ins, `${table}.inserted`),
      updated: safeMutationCounter(row.n_tup_upd, `${table}.updated`),
      deleted: safeMutationCounter(row.n_tup_del, `${table}.deleted`),
    };
    if (mutation.inserted || mutation.updated || mutation.deleted) inventory[table] = mutation;
  }
  return inventory;
}

async function collectPrincipal(
  tx: FixtureTransaction,
  userId: string,
  expectedAccountId: string,
  password: string,
): Promise<FanwardFixturePrincipalSnapshot | null> {
  const [principal] = await tx
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image,
      role: user.role,
      isDemo: user.isDemo,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (!principal) return null;

  const accountRows = await tx
    .select({
      id: account.id,
      accountId: account.accountId,
      providerId: account.providerId,
      issuer: account.issuer,
      password: account.password,
      accessToken: account.accessToken,
      refreshToken: account.refreshToken,
      idToken: account.idToken,
      accessTokenExpiresAt: account.accessTokenExpiresAt,
      refreshTokenExpiresAt: account.refreshTokenExpiresAt,
      scope: account.scope,
    })
    .from(account)
    .where(eq(account.userId, userId));
  const credential = accountRows.find((row) => row.id === expectedAccountId) ?? null;
  const [sessionCountResult] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(session)
    .where(eq(session.userId, userId));
  const passwordMatches = credential?.password
    ? await verifyFanwardFixturePassword(password, credential.password).catch(() => false)
    : false;

  return {
    ...principal,
    sessionCount: numberValue(sessionCountResult?.count),
    accountCount: accountRows.length,
    account: credential
      ? {
          id: credential.id,
          accountId: credential.accountId,
          providerId: credential.providerId,
          issuer: credential.issuer,
          hasPassword: Boolean(credential.password),
          passwordMatches,
          hasOAuthMaterial: Boolean(
            credential.accessToken
            || credential.refreshToken
            || credential.idToken
            || credential.accessTokenExpiresAt
            || credential.refreshTokenExpiresAt
            || credential.scope
          ),
        }
      : null,
  };
}

interface FixtureAuditEvidenceRow {
  table: "public.moderation_action" | "public.admin_audit_log";
  id: string;
  actorUserId: string | null;
  immutableRecord: string;
}

function canonicalJson(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

async function collectAuditEvidence(
  tx: FixtureTransaction,
  ids: FanwardFixtureIds,
  profileIds: string[],
): Promise<FixtureAuditEvidenceRow[]> {
  const actorIds = [ids.ownerUserId, ids.adminUserId];
  const moderationCondition = profileIds.length
    ? or(
        and(eq(moderationAction.targetType, "creator_profile"), inArray(moderationAction.targetId, profileIds)),
        inArray(moderationAction.actorUserId, actorIds),
      )
    : inArray(moderationAction.actorUserId, actorIds);
  const adminCondition = profileIds.length
    ? or(
        and(eq(adminAuditLog.targetType, "creator_profile"), inArray(adminAuditLog.targetId, profileIds)),
        inArray(adminAuditLog.actorUserId, actorIds),
      )
    : inArray(adminAuditLog.actorUserId, actorIds);
  const moderationRows = await tx
    .select({
      id: moderationAction.id,
      actorUserId: moderationAction.actorUserId,
      action: moderationAction.action,
      targetType: moderationAction.targetType,
      targetId: moderationAction.targetId,
      previousState: moderationAction.previousState,
      newState: moderationAction.newState,
      reason: moderationAction.reason,
      requestId: moderationAction.requestId,
      createdAt: moderationAction.createdAt,
    })
    .from(moderationAction)
    .where(moderationCondition)
    .for("update");
  const adminRows = await tx
    .select({
      id: adminAuditLog.id,
      actorUserId: adminAuditLog.actorUserId,
      action: adminAuditLog.action,
      targetType: adminAuditLog.targetType,
      targetId: adminAuditLog.targetId,
      previousState: adminAuditLog.previousState,
      newState: adminAuditLog.newState,
      details: adminAuditLog.details,
      reason: adminAuditLog.reason,
      requestId: adminAuditLog.requestId,
      actorIpHash: adminAuditLog.actorIpHash,
      createdAt: adminAuditLog.createdAt,
    })
    .from(adminAuditLog)
    .where(adminCondition)
    .for("update");
  return [
    ...moderationRows.map(({ id, actorUserId, ...immutable }) => ({
      table: "public.moderation_action" as const,
      id,
      actorUserId,
      immutableRecord: canonicalJson(immutable),
    })),
    ...adminRows.map(({ id, actorUserId, ...immutable }) => ({
      table: "public.admin_audit_log" as const,
      id,
      actorUserId,
      immutableRecord: canonicalJson(immutable),
    })),
  ].sort((left, right) => `${left.table}:${left.id}`.localeCompare(`${right.table}:${right.id}`));
}

function assertAuditEvidenceTransition(
  before: FixtureAuditEvidenceRow[],
  after: FixtureAuditEvidenceRow[],
  expectedActor: "nulled" | "restored",
): void {
  if (before.length !== after.length) throw new FixtureOperationError("Cleanup changed the retained audit row set.");
  const afterById = new Map(after.map((row) => [`${row.table}:${row.id}`, row]));
  for (const original of before) {
    const current = afterById.get(`${original.table}:${original.id}`);
    if (!current || current.immutableRecord !== original.immutableRecord) {
      throw new FixtureOperationError("Cleanup changed retained audit evidence content.");
    }
    if (expectedActor === "nulled" ? current.actorUserId !== null : current.actorUserId !== original.actorUserId) {
      throw new FixtureOperationError("Cleanup changed retained audit actor state unexpectedly.");
    }
  }
}

async function lockFixtureRoots(
  tx: FixtureTransaction,
  context: FanwardFixtureContext,
  ids: FanwardFixtureIds,
): Promise<string[]> {
  await tx.select({ id: site.id }).from(site).where(eq(site.id, ids.siteId)).for("update");
  await tx.select({ id: user.id }).from(user).where(inArray(user.id, [ids.ownerUserId, ids.adminUserId])).for("update");
  await tx.select({ id: account.id }).from(account).where(inArray(account.id, [ids.ownerAccountId, ids.adminAccountId])).for("update");
  await tx.select({ id: siteOwner.id }).from(siteOwner).where(eq(siteOwner.siteId, ids.siteId)).for("update");
  await tx.select({ siteId: siteVerification.siteId }).from(siteVerification).where(eq(siteVerification.siteId, ids.siteId)).for("update");
  await tx.select({ id: session.id }).from(session).where(inArray(session.userId, [ids.ownerUserId, ids.adminUserId])).for("update");
  const profileRows = await tx
    .select({ id: creatorProfile.id })
    .from(creatorProfile)
    .where(or(
      eq(creatorProfile.primarySiteId, ids.siteId),
      inArray(creatorProfile.ownerUserId, [ids.ownerUserId, ids.adminUserId]),
    ))
    .for("update");
  const profileIds = profileRows.map((profile) => profile.id);
  if (profileIds.length) {
    await tx
      .select({ id: creatorProfileRevision.id })
      .from(creatorProfileRevision)
      .where(inArray(creatorProfileRevision.creatorProfileId, profileIds))
      .for("update");
  }
  await collectAuditEvidence(tx, ids, profileIds);
  const collisions = await tx
    .select({ id: site.id })
    .from(site)
    .where(or(eq(site.slug, context.identity.siteSlug), eq(site.domain, context.identity.siteDomain)))
    .for("update");
  if (collisions.some((row) => row.id !== ids.siteId)) {
    throw new FixtureOperationError("Fixture identity collision appeared while cleanup roots were locked.");
  }
  return profileIds;
}

async function forbiddenCounts(
  tx: FixtureTransaction,
  ids: FanwardFixtureIds,
  profileIds: string[],
): Promise<Record<string, number>> {
  const allowedConstraints = new Set<string>(FANWARD_FIXTURE_ALLOWED_DIRECT_FK_CONSTRAINTS);
  const tableReferences = new Map<string, { siteColumns: Set<string>; userColumns: Set<string> }>();
  for (const reference of FANWARD_FIXTURE_SCHEMA_15_DIRECT_REFERENCES) {
    if (allowedConstraints.has(reference.constraint)) continue;
    if (reference.childColumns.length !== 1 || reference.parentColumns.join(",") !== "id") {
      throw new FixtureOperationError("The reviewed direct fixture FK inventory is not single-column exact-ID scoped.");
    }
    const references = tableReferences.get(reference.childTable) ?? {
      siteColumns: new Set<string>(),
      userColumns: new Set<string>(),
    };
    (reference.parentTable === "public.site" ? references.siteColumns : references.userColumns)
      .add(reference.childColumns[0]!);
    tableReferences.set(reference.childTable, references);
  }
  const queries = [...tableReferences.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([table, references]) => {
    const predicates = [
      ...[...references.siteColumns].sort().map((column) => (
        sql`${sql.raw(quoteColumn(column))} = ${ids.siteId}`
      )),
      ...[...references.userColumns].sort().map((column) => (
        sql`${sql.raw(quoteColumn(column))} in (${ids.ownerUserId}, ${ids.adminUserId})`
      )),
    ];
    if (!predicates.length) throw new FixtureOperationError("The reviewed direct fixture FK inventory has no predicate.");
    return sql`select ${table}::text as fixture_table, count(*)::int as fixture_count
      from ${sql.raw(quoteQualifiedTable(table))}
      where ${sql.join(predicates, sql.raw(" or "))}`;
  });
  const revisionScope = profileIds.length
    ? sql`and creator_profile_id not in (${sql.join(profileIds.map((id) => sql`${id}`), sql.raw(", "))})`
    : sql``;
  queries.push(sql`
    select 'public.creator_profile_revision_external_actor_reference'::text as fixture_table,
      count(*)::int as fixture_count
    from public.creator_profile_revision
    where (
      created_by_user_id in (${ids.ownerUserId}, ${ids.adminUserId})
      or reviewed_by_user_id in (${ids.ownerUserId}, ${ids.adminUserId})
    ) ${revisionScope}
  `);
  const result = await tx.execute(sql.join(queries, sql.raw(" union all ")));
  return Object.fromEntries(result.rows.map((row) => [String(row.fixture_table), numberValue(row.fixture_count)]));
}

async function collectSnapshot(
  tx: FixtureTransaction,
  context: FanwardFixtureContext,
  ids: FanwardFixtureIds,
  secrets: FanwardFixtureSecrets,
): Promise<FanwardFixtureSnapshot> {
  const [siteRecord] = await tx
    .select({
      id: site.id,
      slug: site.slug,
      domain: site.domain,
      name: site.name,
      description: site.description,
      categoryId: site.categoryId,
      status: site.status,
      verification: site.verification,
      ownership: site.ownership,
      submittedByUserId: site.submittedByUserId,
      logoUrl: site.logoUrl,
      faviconUrl: site.faviconUrl,
      ogImageUrl: site.ogImageUrl,
      permittedAliases: site.permittedAliases,
      featured: site.featured,
      isDemo: site.isDemo,
      publicRevenueVisible: site.publicRevenueVisible,
      publicPageMetricsVisible: site.publicPageMetricsVisible,
      deletedAt: site.deletedAt,
    })
    .from(site)
    .where(eq(site.id, ids.siteId))
    .limit(1);
  const collisions = await tx
    .select({ id: site.id })
    .from(site)
    .where(or(eq(site.slug, context.identity.siteSlug), eq(site.domain, context.identity.siteDomain)));
  const [categoryRecord] = await tx
    .select({ id: category.id, slug: category.slug })
    .from(category)
    .where(eq(category.id, ids.categoryId))
    .limit(1);
  const owner = await collectPrincipal(tx, ids.ownerUserId, ids.ownerAccountId, secrets.ownerPassword);
  const admin = await collectPrincipal(tx, ids.adminUserId, ids.adminAccountId, secrets.adminPassword);
  const memberships = await tx
    .select({ id: siteOwner.id, siteId: siteOwner.siteId, userId: siteOwner.userId, role: siteOwner.role })
    .from(siteOwner)
    .where(eq(siteOwner.siteId, ids.siteId));
  const [otherMemberships] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(siteOwner)
    .where(and(inArray(siteOwner.userId, [ids.ownerUserId, ids.adminUserId]), ne(siteOwner.siteId, ids.siteId)));
  const [otherSubmissions] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(site)
    .where(and(inArray(site.submittedByUserId, [ids.ownerUserId, ids.adminUserId]), ne(site.id, ids.siteId)));
  const [verificationRecord] = await tx
    .select({
      siteId: siteVerification.siteId,
      source: siteVerification.source,
      method: siteVerification.method,
      status: siteVerification.status,
      verifiedAt: siteVerification.verifiedAt,
      lastSyncAt: siteVerification.lastSyncAt,
      lastError: siteVerification.lastError,
      evidence: siteVerification.evidence,
    })
    .from(siteVerification)
    .where(eq(siteVerification.siteId, ids.siteId))
    .limit(1);
  const profiles = await tx
    .select({ id: creatorProfile.id, ownerUserId: creatorProfile.ownerUserId, primarySiteId: creatorProfile.primarySiteId })
    .from(creatorProfile)
    .where(or(
      eq(creatorProfile.primarySiteId, ids.siteId),
      inArray(creatorProfile.ownerUserId, [ids.ownerUserId, ids.adminUserId]),
    ));
  const profileIds = profiles.map((profile) => profile.id);
  const revisions = profileIds.length
    ? await tx
        .select({ id: creatorProfileRevision.id })
        .from(creatorProfileRevision)
        .where(inArray(creatorProfileRevision.creatorProfileId, profileIds))
    : [];
  const moderationTargetRows = profileIds.length
    ? await tx
        .select({ actorUserId: moderationAction.actorUserId, targetType: moderationAction.targetType, targetId: moderationAction.targetId })
        .from(moderationAction)
        .where(and(eq(moderationAction.targetType, "creator_profile"), inArray(moderationAction.targetId, profileIds)))
    : [];
  const adminAuditTargetRows = profileIds.length
    ? await tx
        .select({ actorUserId: adminAuditLog.actorUserId, targetType: adminAuditLog.targetType, targetId: adminAuditLog.targetId })
        .from(adminAuditLog)
        .where(and(eq(adminAuditLog.targetType, "creator_profile"), inArray(adminAuditLog.targetId, profileIds)))
    : [];
  const fixtureActorModerationRows = await tx
    .select({ actorUserId: moderationAction.actorUserId, targetType: moderationAction.targetType, targetId: moderationAction.targetId })
    .from(moderationAction)
    .where(inArray(moderationAction.actorUserId, [ids.ownerUserId, ids.adminUserId]));
  const fixtureActorAdminAuditRows = await tx
    .select({ actorUserId: adminAuditLog.actorUserId, targetType: adminAuditLog.targetType, targetId: adminAuditLog.targetId })
    .from(adminAuditLog)
    .where(inArray(adminAuditLog.actorUserId, [ids.ownerUserId, ids.adminUserId]));
  const profileSet = new Set(profileIds);
  const expectedFixtureAudit = (row: { actorUserId: string | null; targetType: string; targetId: string | null }) => (
    row.actorUserId === ids.adminUserId
    && row.targetType === "creator_profile"
    && Boolean(row.targetId && profileSet.has(row.targetId))
  );
  const unexpectedFixtureAuditCount = [
    ...moderationTargetRows,
    ...adminAuditTargetRows,
    ...fixtureActorModerationRows,
    ...fixtureActorAdminAuditRows,
  ].filter((row) => !expectedFixtureAudit(row)).length;

  return {
    site: siteRecord ?? null,
    identityCollisionIds: collisions.map((row) => row.id),
    category: categoryRecord ?? null,
    owner,
    admin,
    memberships,
    otherFixtureUserMembershipCount: numberValue(otherMemberships?.count),
    otherFixtureUserSubmittedSiteCount: numberValue(otherSubmissions?.count),
    verification: verificationRecord
      ? { ...verificationRecord, evidence: verificationRecord.evidence as Record<string, unknown> | null }
      : null,
    profiles,
    revisionIds: revisions.map((revision) => revision.id),
    forbiddenCounts: await forbiddenCounts(tx, ids, profileIds),
    unexpectedFixtureAuditCount,
    retainedAuditCounts: {
      moderationActions: moderationTargetRows.length,
      adminAuditLogs: adminAuditTargetRows.length,
    },
  };
}

function resultIdentity(context: FanwardFixtureContext, ids: FanwardFixtureIds) {
  return {
    mode: "synthetic_staging_fixture",
    origin: context.origin,
    httpsClientIp: context.httpsClientIp,
    runId: context.runId,
    releaseSha: context.releaseSha,
    marker: context.identity.marker,
    ids,
    loginPrincipals: {
      ownerEmail: context.identity.ownerEmail,
      adminEmail: context.identity.adminEmail,
    },
    secretsEmitted: false,
    sessionsCreated: 0,
    metricsCreated: 0,
    limitations: [
      "Synthetic staging prerequisite only; it does not prove signup, email delivery, domain claim, or tracker installation.",
      "No traffic, score, snapshot, audience, follower, revenue, conversion, payment, or production record is created.",
      "Owner and admin sessions must be created through the real HTTPS sign-in endpoint and signed out before cleanup.",
    ],
  };
}

async function createFixture(
  db: PostgresDatabase,
  context: FanwardFixtureContext,
  secrets: FanwardFixtureSecrets,
) {
  const [ownerPasswordHash, adminPasswordHash] = await Promise.all([
    hashFanwardFixturePassword(secrets.ownerPassword),
    hashFanwardFixturePassword(secrets.adminPassword),
  ]);
  return db.transaction(async (tx) => {
    await lockFixture(tx, context);
    await assertFixtureSchemaSafe(tx);
    await tx.execute(sql.raw(
      "lock table public.rate_limit_bucket, public.verification_token, public.waitlist_entry in share row exclusive mode nowait",
    ));
    const preflightNonForeignKeys = await collectNonForeignKeyInventory(tx, context, {
      ownerUserId: context.identity.ownerUserId,
      adminUserId: context.identity.adminUserId,
    }, secrets.authSecret);
    const preflightRateDrift = findFanwardFixtureRateLimitPhaseDrift(
      preflightNonForeignKeys.rateLimitKeys,
      preflightNonForeignKeys.rateLimitPresentKeys,
      "preflight",
    );
    if (
      preflightRateDrift.length
      || preflightNonForeignKeys.verificationTokenCount !== 0
      || preflightNonForeignKeys.waitlistEntryCount !== 0
    ) {
      throw new FixtureOperationError("Fixture create refused pre-existing release-scoped authentication residue.");
    }
    const collisionRows = await tx
      .select({ id: site.id, categoryId: site.categoryId })
      .from(site)
      .where(or(eq(site.slug, context.identity.siteSlug), eq(site.domain, context.identity.siteDomain)))
      .for("update");
    if (collisionRows.length > 1) throw new FixtureOperationError("Fixture identity maps to more than one site.");

    const [categoryRecord] = await tx
      .select({ id: category.id })
      .from(category)
      .where(eq(category.slug, context.categorySlug))
      .limit(1);
    if (!categoryRecord) throw new FixtureOperationError("The exact fixture category does not exist; run the idempotent category seed first.");

    if (collisionRows[0]) {
      const [membership] = await tx
        .select({ id: siteOwner.id })
        .from(siteOwner)
        .where(and(eq(siteOwner.siteId, collisionRows[0].id), eq(siteOwner.userId, context.identity.ownerUserId)))
        .limit(1);
      if (!membership) throw new FixtureOperationError("Existing fixture site has no exact owner membership.");
      const ids: FanwardFixtureIds = {
        siteId: collisionRows[0].id,
        siteOwnerId: membership.id,
        categoryId: categoryRecord.id,
        ownerUserId: context.identity.ownerUserId,
        adminUserId: context.identity.adminUserId,
        ownerAccountId: context.identity.ownerAccountId,
        adminAccountId: context.identity.adminAccountId,
      };
      const snapshot = await collectSnapshot(tx, context, ids, secrets);
      const drift = findFanwardFixtureDrift(context, ids, snapshot);
      if (drift.length) throw new FixtureOperationError(`Existing fixture drift: ${drift.join(",")}.`);
      const result = { ...resultIdentity(context, ids), action: "create", status: "ready", created: false };
      assertFanwardFixtureOutputSafe(result, [
        secrets.ownerPassword,
        secrets.adminPassword,
        secrets.authSecret,
        ownerPasswordHash,
        adminPasswordHash,
      ]);
      return result;
    }

    const identityCollisions = await tx
      .select({ id: user.id })
      .from(user)
      .where(or(
        inArray(user.id, [context.identity.ownerUserId, context.identity.adminUserId]),
        inArray(user.email, [context.identity.ownerEmail, context.identity.adminEmail]),
      ));
    if (identityCollisions.length) throw new FixtureOperationError("Fixture principal identity already exists without the exact fixture site.");
    const accountCollisions = await tx
      .select({ id: account.id })
      .from(account)
      .where(inArray(account.id, [context.identity.ownerAccountId, context.identity.adminAccountId]));
    if (accountCollisions.length) throw new FixtureOperationError("Fixture credential identity already exists without the exact fixture site.");

    await tx.insert(user).values([
      {
        id: context.identity.ownerUserId,
        name: context.identity.ownerName,
        email: context.identity.ownerEmail,
        emailVerified: true,
        role: "user",
        isDemo: true,
      },
      {
        id: context.identity.adminUserId,
        name: context.identity.adminName,
        email: context.identity.adminEmail,
        emailVerified: true,
        role: "admin",
        isDemo: true,
      },
    ]);
    await tx.insert(account).values([
      {
        id: context.identity.ownerAccountId,
        accountId: context.identity.ownerUserId,
        providerId: "credential",
        issuer: "credential",
        userId: context.identity.ownerUserId,
        password: ownerPasswordHash,
      },
      {
        id: context.identity.adminAccountId,
        accountId: context.identity.adminUserId,
        providerId: "credential",
        issuer: "credential",
        userId: context.identity.adminUserId,
        password: adminPasswordHash,
      },
    ]);
    const [createdSite] = await tx
      .insert(site)
      .values({
        slug: context.identity.siteSlug,
        domain: context.identity.siteDomain,
        name: context.identity.siteName,
        description: context.identity.siteDescription,
        categoryId: categoryRecord.id,
        status: "active",
        verification: "tracker",
        ownership: "claimed",
        submittedByUserId: context.identity.ownerUserId,
        featured: false,
        isDemo: false,
        publicRevenueVisible: false,
        publicPageMetricsVisible: false,
      })
      .returning({ id: site.id });
    const [membership] = await tx
      .insert(siteOwner)
      .values({ siteId: createdSite.id, userId: context.identity.ownerUserId, role: "owner" })
      .returning({ id: siteOwner.id });
    const ids: FanwardFixtureIds = {
      siteId: createdSite.id,
      siteOwnerId: membership.id,
      categoryId: categoryRecord.id,
      ownerUserId: context.identity.ownerUserId,
      adminUserId: context.identity.adminUserId,
      ownerAccountId: context.identity.ownerAccountId,
      adminAccountId: context.identity.adminAccountId,
    };
    await tx.insert(siteVerification).values({
      siteId: ids.siteId,
      source: "tracker",
      method: "tracker",
      status: "active",
      verifiedAt: new Date(),
      evidence: buildFanwardFixtureEvidence(context, ids),
    });
    const snapshot = await collectSnapshot(tx, context, ids, secrets);
    const drift = findFanwardFixtureDrift(context, ids, snapshot);
    if (drift.length) throw new FixtureOperationError(`Created fixture failed read-back: ${drift.join(",")}.`);
    const result = { ...resultIdentity(context, ids), action: "create", status: "ready", created: true };
    assertFanwardFixtureOutputSafe(result, [
      secrets.ownerPassword,
      secrets.adminPassword,
      secrets.authSecret,
      ownerPasswordHash,
      adminPasswordHash,
    ]);
    return result;
  });
}

async function fixtureStatus(
  db: PostgresDatabase,
  context: FanwardFixtureContext,
  ids: FanwardFixtureIds,
  secrets: FanwardFixtureSecrets,
  rateLimitPhase: FanwardFixtureRateLimitPhase,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level repeatable read read only`);
    await lockFixture(tx, context, true);
    await assertFixtureSchemaSafe(tx);
    const snapshot = await collectSnapshot(tx, context, ids, secrets);
    const nonForeignKeys = await collectNonForeignKeyInventory(tx, context, ids, secrets.authSecret);
    snapshot.forbiddenCounts = {
      ...snapshot.forbiddenCounts,
      "public.verification_token": nonForeignKeys.verificationTokenCount,
      "public.waitlist_entry": nonForeignKeys.waitlistEntryCount,
    };
    const drift = [
      ...findFanwardFixtureDrift(context, ids, snapshot),
      ...findFanwardFixtureRateLimitPhaseDrift(
        nonForeignKeys.rateLimitKeys,
        nonForeignKeys.rateLimitPresentKeys,
        rateLimitPhase,
      ),
    ];
    return {
      ...resultIdentity(context, ids),
      action: "status",
      status: snapshot.site ? (drift.length ? "drift" : "ready") : (drift.length ? "drift" : "absent"),
      drift,
      sessions: {
        owner: snapshot.owner?.sessionCount ?? 0,
        admin: snapshot.admin?.sessionCount ?? 0,
      },
      creatorProfileIds: snapshot.profiles.map((profile) => profile.id),
      creatorRevisionIds: snapshot.revisionIds,
      forbiddenCounts: snapshot.forbiddenCounts,
      rateLimitInventory: {
        phase: rateLimitPhase,
        expectedKeyCount: nonForeignKeys.rateLimitKeys.length,
        presentKeyCount: nonForeignKeys.rateLimitRowCount,
      },
      retainedAuditCounts: snapshot.retainedAuditCounts,
    };
  });
}

function expectedCleanupMutations(
  snapshot: FanwardFixtureSnapshot,
  nonForeignKeys: FixtureNonForeignKeyInventory,
): FanwardFixtureMutationInventory {
  const mutation = (inserted: number, updated: number, deleted: number) => ({ inserted, updated, deleted });
  return {
    "public.site": mutation(0, 0, 1),
    "public.user": mutation(0, 0, 2),
    "public.account": mutation(0, 0, 2),
    "public.session": mutation(0, 0, 0),
    "public.site_owner": mutation(0, 0, 1),
    "public.site_verification": mutation(0, 0, 1),
    "public.creator_profile": mutation(0, 0, snapshot.profiles.length),
    "public.creator_profile_revision": mutation(0, 0, snapshot.revisionIds.length),
    "public.moderation_action": mutation(0, snapshot.retainedAuditCounts.moderationActions, 0),
    "public.admin_audit_log": mutation(0, snapshot.retainedAuditCounts.adminAuditLogs, 0),
    "public.rate_limit_bucket": mutation(0, 0, nonForeignKeys.rateLimitRowCount),
  };
}

async function performExactCleanupDeletes(
  tx: FixtureTransaction,
  ids: FanwardFixtureIds,
  nonForeignKeys: FixtureNonForeignKeyInventory,
): Promise<void> {
  const deletedRateRows = await tx
    .delete(rateLimitBucket)
    .where(inArray(rateLimitBucket.key, nonForeignKeys.rateLimitKeys))
    .returning({ key: rateLimitBucket.key });
  if (deletedRateRows.length !== nonForeignKeys.rateLimitRowCount) {
    throw new FixtureOperationError("Cleanup failed to delete the exact fixture rate-limit rows.");
  }
  const deletedSites = await tx.delete(site).where(eq(site.id, ids.siteId)).returning({ id: site.id });
  if (deletedSites.length !== 1) throw new FixtureOperationError("Cleanup failed to delete the exact fixture site.");
  const deletedUsers = await tx
    .delete(user)
    .where(inArray(user.id, [ids.ownerUserId, ids.adminUserId]))
    .returning({ id: user.id });
  const deletedUserIds = deletedUsers.map((row) => row.id).sort();
  if (
    deletedUserIds.length !== 2
    || deletedUserIds[0] !== [ids.adminUserId, ids.ownerUserId].sort()[0]
    || deletedUserIds[1] !== [ids.adminUserId, ids.ownerUserId].sort()[1]
  ) throw new FixtureOperationError("Cleanup failed to delete both exact fixture principals.");
}

async function revokeFixtureSessions(
  db: PostgresDatabase,
  context: FanwardFixtureContext,
  ids: FanwardFixtureIds,
) {
  return db.transaction(async (tx) => {
    await lockFixture(tx, context);
    await tx.execute(sql.raw(
      "lock table public.session in exclusive mode nowait",
    ));
    await tx.execute(sql.raw(
      "lock table public.account, public.site, public.site_owner, public.\"user\" in share row exclusive mode nowait",
    ));
    const inboundSessionForeignKeys = await tx.execute(sql`
      select foreign_key.conname
      from pg_constraint foreign_key
      where foreign_key.contype = 'f'
        and foreign_key.confrelid = 'public.session'::regclass
      order by foreign_key.conname
    `);
    if (inboundSessionForeignKeys.rows.length !== 0) {
      throw new FixtureOperationError("Session revoke refused because public.session gained an incoming foreign key.");
    }
    const sessionRelation = await tx.execute(sql`
      select
        relation.relkind,
        relation.relrowsecurity as row_security,
        relation.relforcerowsecurity as force_row_security,
        exists (
          select 1 from pg_trigger user_trigger
          where user_trigger.tgrelid = relation.oid and not user_trigger.tgisinternal
        ) as has_user_trigger,
        exists (
          select 1 from pg_rewrite rewrite_rule
          where rewrite_rule.ev_class = relation.oid and rewrite_rule.rulename <> '_RETURN'
        ) as has_rewrite_rule,
        exists (
          select 1 from pg_policy policy
          where policy.polrelid = relation.oid
        ) as has_policy
      from pg_class relation
      join pg_namespace namespace on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public' and relation.relname = 'session'
    `);
    const sessionSemantics = sessionRelation.rows[0] as Record<string, unknown> | undefined;
    if (
      sessionRelation.rows.length !== 1
      || sessionSemantics?.relkind !== "r"
      || sessionSemantics.row_security === true
      || sessionSemantics.force_row_security === true
      || sessionSemantics.has_user_trigger === true
      || sessionSemantics.has_rewrite_rule === true
      || sessionSemantics.has_policy === true
    ) throw new FixtureOperationError("Session revoke refused unsafe session-table semantics.");
    const [siteRecord] = await tx
      .select({
        id: site.id,
        slug: site.slug,
        domain: site.domain,
        name: site.name,
        description: site.description,
        categoryId: site.categoryId,
        submittedByUserId: site.submittedByUserId,
        isDemo: site.isDemo,
      })
      .from(site)
      .where(eq(site.id, ids.siteId))
      .for("update")
      .limit(1);
    const collisionRows = await tx
      .select({ id: site.id })
      .from(site)
      .where(or(eq(site.slug, context.identity.siteSlug), eq(site.domain, context.identity.siteDomain)))
      .for("update");
    const principalRows = await tx
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image,
        role: user.role,
        isDemo: user.isDemo,
      })
      .from(user)
      .where(inArray(user.id, [ids.ownerUserId, ids.adminUserId]))
      .for("update");
    const accountRows = await tx
      .select({
        id: account.id,
        accountId: account.accountId,
        providerId: account.providerId,
        issuer: account.issuer,
        userId: account.userId,
        password: account.password,
        accessToken: account.accessToken,
        refreshToken: account.refreshToken,
        idToken: account.idToken,
        accessTokenExpiresAt: account.accessTokenExpiresAt,
        refreshTokenExpiresAt: account.refreshTokenExpiresAt,
        scope: account.scope,
      })
      .from(account)
      .where(or(
        inArray(account.id, [ids.ownerAccountId, ids.adminAccountId]),
        inArray(account.userId, [ids.ownerUserId, ids.adminUserId]),
      ))
      .for("update");
    const membershipRows = await tx
      .select({ id: siteOwner.id, siteId: siteOwner.siteId, userId: siteOwner.userId, role: siteOwner.role })
      .from(siteOwner)
      .where(or(
        eq(siteOwner.id, ids.siteOwnerId),
        eq(siteOwner.siteId, ids.siteId),
        inArray(siteOwner.userId, [ids.ownerUserId, ids.adminUserId]),
      ))
      .for("update");

    const drift: string[] = [];
    if (
      !siteRecord
      || siteRecord.id !== ids.siteId
      || siteRecord.slug !== context.identity.siteSlug
      || siteRecord.domain !== context.identity.siteDomain
      || siteRecord.name !== context.identity.siteName
      || siteRecord.description !== context.identity.siteDescription
      || siteRecord.categoryId !== ids.categoryId
      || siteRecord.submittedByUserId !== ids.ownerUserId
      || siteRecord.isDemo
      || collisionRows.length !== 1
      || collisionRows[0]?.id !== ids.siteId
    ) drift.push("fixture_site_identity");
    const expectedPrincipals = new Map([
      [ids.ownerUserId, { name: context.identity.ownerName, email: context.identity.ownerEmail, role: "user" }],
      [ids.adminUserId, { name: context.identity.adminName, email: context.identity.adminEmail, role: "admin" }],
    ]);
    if (principalRows.length !== 2 || principalRows.some((principal) => {
      const expected = expectedPrincipals.get(principal.id);
      return !expected
        || principal.name !== expected.name
        || principal.email !== expected.email
        || !principal.emailVerified
        || principal.image !== null
        || principal.role !== expected.role
        || !principal.isDemo;
    })) drift.push("fixture_principal_identity");
    const expectedAccounts = new Map([
      [ids.ownerAccountId, ids.ownerUserId],
      [ids.adminAccountId, ids.adminUserId],
    ]);
    if (accountRows.length !== 2 || accountRows.some((credential) => {
      const expectedUserId = expectedAccounts.get(credential.id);
      return !expectedUserId
        || credential.userId !== expectedUserId
        || credential.accountId !== expectedUserId
        || credential.providerId !== "credential"
        || credential.issuer !== "credential"
        || !credential.password
        || credential.accessToken !== null
        || credential.refreshToken !== null
        || credential.idToken !== null
        || credential.accessTokenExpiresAt !== null
        || credential.refreshTokenExpiresAt !== null
        || credential.scope !== null;
    })) drift.push("fixture_credential_identity");
    if (
      membershipRows.length !== 1
      || membershipRows[0]?.id !== ids.siteOwnerId
      || membershipRows[0]?.siteId !== ids.siteId
      || membershipRows[0]?.userId !== ids.ownerUserId
      || membershipRows[0]?.role !== "owner"
    ) drift.push("fixture_membership_identity");
    if (drift.length) {
      throw new FixtureOperationError(`Session revoke refused because fixture identity drifted: ${drift.join(",")}.`);
    }

    const deletedSessions = await tx
      .delete(session)
      .where(inArray(session.userId, [ids.ownerUserId, ids.adminUserId]))
      .returning({ userId: session.userId });
    const remainingSessions = await tx
      .select({ userId: session.userId })
      .from(session)
      .where(inArray(session.userId, [ids.ownerUserId, ids.adminUserId]));
    if (remainingSessions.length) throw new FixtureOperationError("Session revoke read-back found fixture sessions.");
    return {
      ...resultIdentity(context, ids),
      action: "revoke-sessions" as const,
      status: "ready" as const,
      drift: [] as string[],
      sessions: { owner: 0, admin: 0 },
      revokedSessions: {
        owner: deletedSessions.filter((row) => row.userId === ids.ownerUserId).length,
        admin: deletedSessions.filter((row) => row.userId === ids.adminUserId).length,
      },
    };
  });
}

async function cleanupFixture(
  db: PostgresDatabase,
  context: FanwardFixtureContext,
  ids: FanwardFixtureIds,
  secrets: FanwardFixtureSecrets,
) {
  return db.transaction(async (tx) => {
    await lockFixture(tx, context);
    await assertFixtureSchemaSafe(tx);
    await lockFixtureMutationTables(tx);
    await assertFixtureSchemaSafe(tx);
    const lockedProfileIds = await lockFixtureRoots(tx, context, ids);
    const snapshot = await collectSnapshot(tx, context, ids, secrets);
    const nonForeignKeys = await collectNonForeignKeyInventory(tx, context, ids, secrets.authSecret);
    snapshot.forbiddenCounts = {
      ...snapshot.forbiddenCounts,
      "public.verification_token": nonForeignKeys.verificationTokenCount,
      "public.waitlist_entry": nonForeignKeys.waitlistEntryCount,
    };
    const drift = findFanwardFixtureDrift(context, ids, snapshot);
    if (
      !snapshot.site && nonForeignKeys.rateLimitRowCount !== 0
    ) drift.push("non_foreign_key_fixture_residue");
    if (lockedProfileIds.slice().sort().join(",") !== snapshot.profiles.map((profile) => profile.id).sort().join(",")) {
      drift.push("locked_profile_scope");
    }
    if (drift.length) throw new FixtureOperationError(`Cleanup refused because fixture drifted: ${drift.join(",")}.`);
    if (!snapshot.site) {
      return { ...resultIdentity(context, ids), action: "cleanup", status: "already_absent", deleted: false };
    }
    if ((snapshot.owner?.sessionCount ?? 0) !== 0 || (snapshot.admin?.sessionCount ?? 0) !== 0) {
      throw new FixtureOperationError("Cleanup refused while fixture Better Auth sessions still exist; sign out every fixture session first.");
    }

    const profileIds = snapshot.profiles.map((profile) => profile.id);
    const auditBefore = await collectAuditEvidence(tx, ids, profileIds);
    const auditCounts = {
      moderationActions: auditBefore.filter((row) => row.table === "public.moderation_action").length,
      adminAuditLogs: auditBefore.filter((row) => row.table === "public.admin_audit_log").length,
    };
    if (
      auditCounts.moderationActions !== snapshot.retainedAuditCounts.moderationActions
      || auditCounts.adminAuditLogs !== snapshot.retainedAuditCounts.adminAuditLogs
      || auditBefore.some((row) => row.actorUserId !== ids.adminUserId)
    ) throw new FixtureOperationError("Cleanup refused because retained audit evidence drifted under lock.");

    const expectedMutations = expectedCleanupMutations(snapshot, nonForeignKeys);
    const countersBefore = await readMutationCounters(tx);
    await tx.execute(sql.raw("savepoint fanward_fixture_cleanup_dry_run"));
    await performExactCleanupDeletes(tx, ids, nonForeignKeys);
    const auditAfterDryRun = await collectAuditEvidence(tx, ids, profileIds);
    assertAuditEvidenceTransition(auditBefore, auditAfterDryRun, "nulled");
    const countersAfterDryRun = await readMutationCounters(tx);
    await tx.execute(sql.raw("rollback to savepoint fanward_fixture_cleanup_dry_run"));
    await tx.execute(sql.raw("release savepoint fanward_fixture_cleanup_dry_run"));
    const countersAfterRollback = await readMutationCounters(tx);
    const rollbackCounterDrift = findFanwardFixtureMutationDrift(countersAfterDryRun, countersAfterRollback);
    if (rollbackCounterDrift.length) {
      throw new FixtureOperationError(`Cleanup dry-run counters changed during savepoint rollback: ${rollbackCounterDrift.join(",")}.`);
    }
    const auditAfterRollback = await collectAuditEvidence(tx, ids, profileIds);
    assertAuditEvidenceTransition(auditBefore, auditAfterRollback, "restored");
    const dryRunMutations = subtractFanwardFixtureMutationCounters(countersBefore, countersAfterDryRun);
    const dryRunDrift = findFanwardFixtureMutationDrift(expectedMutations, dryRunMutations);
    if (dryRunDrift.length) {
      throw new FixtureOperationError(`Cleanup dry-run escaped its exact mutation allowlist: ${dryRunDrift.join(",")}.`);
    }

    await performExactCleanupDeletes(tx, ids, nonForeignKeys);
    const auditAfter = await collectAuditEvidence(tx, ids, profileIds);
    assertAuditEvidenceTransition(auditBefore, auditAfter, "nulled");
    const countersAfterActual = await readMutationCounters(tx);
    const actualMutations = subtractFanwardFixtureMutationCounters(countersAfterRollback, countersAfterActual);
    const actualDrift = [
      ...findFanwardFixtureMutationDrift(expectedMutations, actualMutations),
      ...findFanwardFixtureMutationDrift(dryRunMutations, actualMutations),
    ];
    if (actualDrift.length) {
      throw new FixtureOperationError(`Cleanup actual delete differed from its locked dry-run: ${actualDrift.join(",")}.`);
    }

    const [remainingSite] = await tx.select({ id: site.id }).from(site).where(eq(site.id, ids.siteId)).limit(1);
    const remainingUsers = await tx.select({ id: user.id }).from(user).where(inArray(user.id, [ids.ownerUserId, ids.adminUserId]));
    const remainingAccounts = await tx.select({ id: account.id }).from(account).where(inArray(account.id, [ids.ownerAccountId, ids.adminAccountId]));
    const remainingSessions = await tx.select({ id: session.id }).from(session).where(inArray(session.userId, [ids.ownerUserId, ids.adminUserId]));
    const remainingProfiles = profileIds.length
      ? await tx.select({ id: creatorProfile.id }).from(creatorProfile).where(inArray(creatorProfile.id, profileIds))
      : [];
    const remainingRateRows = await tx
      .select({ key: rateLimitBucket.key })
      .from(rateLimitBucket)
      .where(inArray(rateLimitBucket.key, nonForeignKeys.rateLimitKeys));
    if (
      remainingSite
      || remainingUsers.length
      || remainingAccounts.length
      || remainingSessions.length
      || remainingProfiles.length
      || remainingRateRows.length
    ) {
      throw new FixtureOperationError("Cleanup read-back found fixture residue.");
    }

    return {
      ...resultIdentity(context, ids),
      action: "cleanup",
      status: "deleted",
      deleted: true,
      deletedCreatorProfileIds: profileIds,
      retainedAuditCounts: auditCounts,
      usersDeleted: 2,
      sessionsDeleted: 0,
      rateLimitRowsDeleted: nonForeignKeys.rateLimitRowCount,
    };
  });
}

async function main(): Promise<number> {
  const command = parseCommand();
  const context = validateFanwardStagingFixtureEnvironment(process.env, checkoutSha());
  if (command === "revoke-sessions") assertFanwardFixtureSessionRevokeConfirmation(process.env, context);
  const secrets = command === "revoke-sessions" ? null : readFanwardFixtureSecrets(process.env);
  const db = getPostgresDb();
  await assertConnectedStagingDatabase(db);
  const result = command === "create"
    ? await createFixture(db, context, secrets!)
    : command === "status"
      ? await fixtureStatus(
          db,
          context,
          readFanwardFixtureIds(process.env, context),
          secrets!,
          readFanwardFixtureRateLimitPhase(process.env),
        )
      : command === "cleanup"
        ? await cleanupFixture(db, context, readFanwardFixtureIds(process.env, context), secrets!)
        : await revokeFixtureSessions(db, context, readFanwardFixtureIds(process.env, context));
  assertFanwardFixtureOutputSafe(result, secrets
    ? [secrets.ownerPassword, secrets.adminPassword, secrets.authSecret]
    : []);
  console.log(JSON.stringify(result, null, 2));
  return "drift" in result && result.drift.length ? 2 : 0;
}

void main()
  .then((exitCode) => {
    process.exitCode = exitCode;
  })
  .catch((error: unknown) => {
    const safeMessage = error instanceof FixtureOperationError
      ? error.message
      : error instanceof Error && (
          error.message.startsWith("FANWARD_FIXTURE_")
          || error.message.startsWith("NEXT_PUBLIC_APP_URL")
          || error.message.startsWith("BETTER_AUTH_URL")
          || error.message.startsWith("TURNSTILE_")
          || error.message.startsWith("APP_MODE")
          || error.message.startsWith("DATA_PROVIDER")
          || error.message.startsWith("DB_DRIVER")
          || error.message.startsWith("FEATURE_CREATORS")
          || error.message.startsWith("EXPECTED_MIGRATION_COUNT")
          || error.message.startsWith("DATABASE_URL")
          || error.message.startsWith("Usage:")
          || error.message.startsWith("The fixture command")
        )
        ? error.message
        : "Fanward staging fixture operation failed without exposing database or credential details.";
    console.error(JSON.stringify({ status: "error", error: safeMessage }));
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await closeDb();
    } catch {
      console.error(JSON.stringify({ status: "error", error: "Fixture database connection cleanup failed without exposing connection details." }));
      process.exitCode = 1;
    }
  });
