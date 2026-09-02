# Fanward MVP — Staging release run sheet

Prepared: 2026-09-02 (Asia/Ho_Chi_Minh)
Updated: 2026-09-02 — PR #13 merged into `fix/launch-readiness`; `RELEASE_SHA` pinned.

**Pinned release SHA: `00ad2512cb99f4c865006e4bbcc3be156052a428`** (merge commit of PR #13; tree identical to `2aca5f4`, verified zero diff). Branch history was rewritten on purpose earlier the same day (force-with-lease superseding `c6a6f31`).

Source of truth: `docs/FANWARD_MVP_RELEASE_RUNBOOK.md` (now on `fix/launch-readiness` via the merge).
Scope: **staging only** — runbook §1 through §4 plus the mandatory rollback rehearsal. Production (§5) is out of scope until staging evidence is reviewed and a second GO is recorded.

> This sheet is an operator index and fill-in worksheet. It does not authorize
> any external action, and it never overrides the runbook. When this sheet and
> the runbook disagree, the runbook wins.

---

## Phase 0 — Preconditions (before opening the window)

### 0.1 Code and CI

| # | Item | Status / action |
| --- | --- | --- |
| 1 | Branch `codex/fanward-live` synced to origin at `2aca5f4` | ✅ Done 2026-09-02 (force-with-lease, supersedes `c6a6f31`) |
| 2 | PR #13 open: `codex/fanward-live` → `fix/launch-readiness` | ✅ https://github.com/Simonjay85/surgeindex/pull/13 |
| 3 | CI on PR head `2aca5f4`: `checks` pass, `migrations` pass, `database-tests` pass | ✅ 2026-09-02 |
| 4 | Independent review approval | ✅ **Waived by owner (Simonjay85)** 2026-09-02 — recorded in the PR #13 merge commit body; branch protection has no review requirement |
| 5 | Merged through branch protection; merge SHA → `RELEASE_SHA` = `00ad2512cb99f4c865006e4bbcc3be156052a428` | ✅ 2026-09-02 (merge commit, `MERGED`, origin verified) |
| 6 | CI green on the **merge SHA**: run `gh run list --workflow launch-readiness.yml --commit "$RELEASE_SHA"` | ✅ Run `33657451263` — `checks`, `migrations`, `database-tests` all success |
| 7 | Migration artifact shows fresh `0000 → 0014` (final count **15**) **and** Batch-6 upgrade `0000 → 0010; 0011 → 0012 → 0013 → 0014` (final count **15**) | ✅ Job `100339436681` log: `PASS migration fresh: 15 journal entries applied`; `PASS migration upgrade baseline: 11 … before 0011/0012/0013/0014`; `PASS migration upgrade: 15 migrations applied` |

### 0.2 Authority checklist (must all be named in the release ticket)

- [ ] Release owner and operator, with approval for the exact `RELEASE_SHA`
- [ ] GitHub review/merge rights on protected `fix/launch-readiness`
- [ ] SSH `ssh templystudio` (user `ubuntu`) + narrowly scoped sudo for `/opt/surgeindex`, the two systemd services, root-only env files
- [ ] Secret-manager access, staging only: database URL, Better Auth secret, Turnstile pair, transactional-email settings, **three** tracker secrets (signing / hash / rotation, ≥32 chars each)
- [ ] Staging Basic Auth credentials
- [ ] A controlled verified staging admin session (ephemeral, for read-back)
- [ ] Approved controlled mailbox, site, and creator record for smoke tests (or the synthetic fixture path)
- [ ] Current verified backup/restore checkpoint; known-good release retained on disk
- [ ] Confirm **no** Stripe/Boost/GA4/public-API credential is required or supplied

### 0.3 Fill-in values (resolve before the window)

| Variable | Value | Source |
| --- | --- | --- |
| `RELEASE_SHA` | `00ad2512cb99f4c865006e4bbcc3be156052a428` | PR #13 merge commit (pinned) |
| `RELEASE_ID` | auto: `surgeindex-fanward-$(date -u +%Y%m%d.%H%M)-${RELEASE_SHA:0:12}` | generated on VPS (§3); pattern `surgeindex-fanward-YYYYMMDD.HHMM-12hex` |
| `<staging main EnvironmentFile path>` | resolve via `sudo systemctl cat surgeindex-staging.service` | host (§2) |
| `<staging TLS vhost path>` | resolve via `nginx -T` | host (§3 nginx) |
| `<active included http-hardening path>` | resolve via `nginx -T` | host (§3 nginx) |
| staging Basic Auth | secret manager | §4 read-back env |
| `FANWARD_FIXTURE_RUN_ID` | `<8-24 lowercase/digits/internal hyphens>` | ticket (only if fixture path used) |
| fixture owner/admin passwords | two different 24–128 char URL-safe values | secret manager, never the shell |
| `ROLLBACK_SHA` | `e419c77289eb046c19f8c968e8d60062032717c4` | known-good Public Free (verify at §5-rehearsal time) |
| `ROLLBACK_STAGING_RELEASE` | `/opt/surgeindex/releases/surgeindex-public-free-20260829.2-staging` | verify SHA read-back |

---

## Phase 1 — Pin one immutable release SHA (runbook §1)

```bash
export RELEASE_SHA='00ad2512cb99f4c865006e4bbcc3be156052a428'
git fetch --prune origin fix/launch-readiness
test "$(git rev-parse origin/fix/launch-readiness)" = "$RELEASE_SHA"
git merge-base --is-ancestor "$RELEASE_SHA" origin/fix/launch-readiness
gh run list --workflow launch-readiness.yml --commit "$RELEASE_SHA"
gh run view '<run-id>' --json headSha,conclusion,jobs
```

Stop unless `headSha == RELEASE_SHA` and both `checks` and `migrations` succeeded.

## Phase 2 — Host baseline, fail-closed session (runbook §2)

Open one `ssh -t templystudio 'bash --noprofile --norc'` session and copy the
**entire §2 preamble verbatim** (secret-cleanup function, `release_secret_cleanup`
EXIT trap, HUP/INT/TERM traps, `wait_until_http_responds`). It is self-contained
in the runbook — do not retype it. Then run the §2 read-back block and confirm:

- both services active, `NRestarts` stable, expected release paths and SHAs;
- listeners `127.0.0.1:3211|3212|55433|55434` present and loopback-only;
- production `live`/`ready` health JSON OK;
- `EnvironmentFile=` paths discovered; `stat` shows `root:root 0600` each.

**Stop and reconcile the ticket if anything differs.** Every later host command
runs in this same session.

## Phase 3 — Two immutable builds, env candidates, gates, nginx boundary (runbook §3)

1. **Names + capacity**: run the §3 variable block (12 GiB / 100k-inode floor,
   `install -d` both release dirs).
2. **Clone both** release dirs from the exact SHA (`--filter=blob:none
   --no-checkout`, fetch depth 1, detach, assert SHA + clean status).
3. **Env candidates** (`sudoedit`, root `0600`): copy current staging/production
   env, then set the Fanward boundary + core values in **both** candidates:

   ```text
   NODE_ENV=production
   APP_MODE=production
   DATA_PROVIDER=postgres
   EXPECTED_MIGRATION_COUNT=15
   TRUSTED_PROXY_MODE=direct_nginx
   TRACKER_ENABLED=true
   TURNSTILE_REQUIRED=true
   EMAIL_PROVIDER=http
   FEATURE_CREATORS=true

   NEXT_PUBLIC_COMMERCIAL_ENABLED=false
   NEXT_PUBLIC_RADAR_ENABLED=false
   STRIPE_ENABLED=false
   BOOST_ENABLED=false
   BOOST_LIVE_MODE_ENABLED=false
   GA4_ENABLED=false
   PUBLIC_REVENUE_BOARD_ENABLED=false
   PUBLIC_PAGE_METRICS_ENABLED=false
   BOOST_PLACEMENT_HOMEPAGE_ENABLED=false
   BOOST_PLACEMENT_CATEGORY_ENABLED=false
   BOOST_PLACEMENT_RANKING_ENABLED=false
   BOOST_PLACEMENT_PROFILE_ENABLED=false
   BOOST_PLACEMENT_BREAKOUT_ENABLED=false
   FEATURE_CAMPAIGNS=false
   FEATURE_AUCTION=false
   FEATURE_PUBLIC_API=false
   ```

   Canonical origins (exact per build — never crossed):

   ```text
   # staging:  NEXT_PUBLIC_APP_URL / BETTER_AUTH_URL / TURNSTILE_EXPECTED_HOSTNAME = https://staging.surgeindex.lol
   # production: NEXT_PUBLIC_APP_URL / BETTER_AUTH_URL / TURNSTILE_EXPECTED_HOSTNAME = https://surgeindex.lol
   ```

   Separate per environment: database URL, Better Auth secret, Turnstile pair,
   tracker signing/hash/rotation secrets, email settings. Validate safe keys
   with the runbook's `sudo grep -E` blocks (no secret values printed).
4. **Install + build** both dirs via `systemd-run` with the repository-pinned
   corepack pnpm; builds source the candidate env + Turnstile + email files.
   Record build identity (`release.env` with `BUILD_SHA=`, tracker artifact,
   `dist/jobs`).
5. **Strict gates before touching any DB**: `pnpm launch:gates:fanward` for both
   candidates via `systemd-run` with the same EnvironmentFiles. Both must pass.
6. **Nginx Fanward boundary** (runbook §3, long block): apply the reviewed URI
   map + `surgeindex_fanward_public` zone to the http-hardening file and the
   three server-scope directives (`limit_req`, `status 429`,
   `limit_req_dry_run off`) to **both** vhosts as same-directory candidates.
   - Do **not** create a new Fanward `location`; keep both catch-alls and all
     staging Basic Auth directives.
   - Back up all three originals to `/var/backups/surgeindex/nginx/${RELEASE_ID}`
     (dir must not pre-exist), sha256 them.
   - Define `restore_nginx_boundary` **before** promoting anything.
   - Run `pnpm nginx:release-check` from **both** artifacts.
   - Promote via the guarded subshell (auto-restore on any failure, exit 90);
     verify `nginx -T` with `scripts/nginx-fanward-boundary-check.mjs` twice
     (pre- and post-reload), credential-less `401` probes on all five protected
     paths, the 80-request `/creators` burst requiring normal+`429` mix, and
     health `200` after the burst.
   - Only after **all** of §3 passes may migration begin.

## Phase 4 — Migration 0014, staging switch, read-back (runbook §4)

Complete the whole section before any production step.

1. **Systemd drop-ins** (before the window, no restart yet): `sudo systemctl
   edit` for `surgeindex-staging.service`, `surgeindex-staging-traffic-aggregation.service`,
   `surgeindex-staging-scoring.service` — content exactly as in runbook §4
   (all three resolve through `/opt/surgeindex/staging-current`; `EnvironmentFile=`
   and `ExecStart=` resets are intentional). Then `daemon-reload` +
   `systemd-analyze verify` + `systemctl cat` (keep a copy with the evidence).
2. **Quiesce staging**: stop both staging timers, bounded 10-min wait for
   running writers with `Result=success`/`ExecMainStatus=0`, then stop
   `surgeindex-staging.service`.
3. **Staging backup** (container `surgeindex-staging-db`, **not**
   `surgeindex-db`): custom-format dump to
   `/var/backups/surgeindex/staging/${RELEASE_ID}-pre-0014.dump`, root `0600`,
   `pg_restore --list` read-back must succeed. Record path/size/sha256.
4. **Migrate** from `$STAGING_RELEASE` with candidate env + `PGOPTIONS=-c
   lock_timeout=5s -c statement_timeout=120s`. A timeout is a **hard stop** —
   never raise limits mid-window; restore/restart from the checkpoint.
5. **Migration read-back**: direct DB count must print `15`.
6. **Promote + switch**: install env pre/next copies, atomic symlink flip via
   `.staging-current-${RELEASE_ID}`, restart, assert symlink → `$STAGING_RELEASE`,
   health `live` (`.data.build == RELEASE_SHA`) and `ready`
   (`expectedMigrationCount == 15`).
7. **Post-switch gate** (`launch:gates:fanward`) + run both one-shot writer
   services once, require success.
8. **Staging Fanward read-back**: create root-only
   `/run/surgeindex-fanward-${RELEASE_ID}-staging.env` with the ten
   `FANWARD_READBACK_*` values (staging mode/origin, exact SHAs, Basic Auth,
   fresh ephemeral admin cookie). Run `pnpm fanward:readback` from
   `$STAGING_RELEASE`; require evidence `result=PASS`, `summary.failed==0`,
   `summary.notRun==0`, then delete the env file and **revoke the admin
   session**. Missing admin session ⇒ exit 2 `PARTIAL` ⇒ not acceptance.

### 4b. Optional synthetic fixture (runbook §4 "Optional synthetic staging prerequisite")

Use only when no controlled public account/domain is available. Key invariants
to keep on the sheet: pinned to `https://staging.surgeindex.lol` + loopback DB
`55434` + count 15 + exact SHA; limiter phases `preflight=0` / `active=9` /
`complete=10` keys; both sign-ins 200, three mutation probes exactly `422`;
sign-outs create the 10th key; cleanup requires `usersDeleted==2`,
`sessionsDeleted==0`, `rateLimitRowsDeleted==10`; timers stay paused for the
whole fixture window. If anything aborts after a sign-in, follow **Mandatory
fixture abort recovery** (re-run §2 preamble, rehydrate exact values, `revoke-sessions`,
then recovery `cleanup`) — never a new run ID, new user, or direct SQL.

## Phase 5 — Mandatory forward-schema rollback rehearsal (runbook §"Rehearse")

Runs **after** staging is on migration count 15, **before** production GO.

1. `ROLLBACK_SHA=e419c772…` retained staging build; verify its SHA read-back.
2. Backup current staging env, create rehearsal env: same staging DB/provider
   credentials, `EXPECTED_MIGRATION_COUNT=15`, `FEATURE_CREATORS=false`, all
   commercial/future flags false.
3. Validate the **rehearsal env** with the **new** Fanward artifact's
   `pnpm launch:gates:public-free` (old release's gate expects 14 — not
   authoritative here).
4. Prepare rollback read-back env (`mode=rollback-rehearsal`,
   `EXPECTED_SHA=$ROLLBACK_SHA`, `TOOL_SHA=$RELEASE_SHA`) **before** touching
   the selector, with a fresh admin cookie.
5. Run the whole switch-old → health → one-shots → read-back inside its own
   fail-closed subshell (parent captures status with `set +e`).
6. **Whether it passes or fails**, restore the Fanward staging env + selector,
   restart, health-jq, restore gate, one-shots, and the **restoration
   read-back** (fresh session, distinct evidence file). Only then act on the
   rehearsal result: failure blocks production and keeps timers paused.
7. On a full pass: `systemctl start` both staging timers, confirm with
   `systemctl list-timers`.

## Staging acceptance (all nine must be observed, runbook §4 acceptance list)

1. `/fanward` empty-state correct; `/creators` 301 → `/fanward`
2. Anonymous cannot draft/moderate
3. Owner: one draft, single submit, cannot self-publish
4. Admin approve/reject with audit trail; only approved becomes public
5. Public detail canonical/search/filter/pagination/image fallback/source labels/Impact Score/primary-site link correct
6. Boost/Stripe/campaign/auction/public-API routes and nav absent and non-indexable
7. robots/sitemap, nav desktop+mobile, 404/empty/error, keyboard focus, responsive widths
8. Migration count stays 15, `NRestarts` stable, jobs fresh, no unexpected 5xx or secret-bearing logs
9. If fixture path used: derived-IP evidence + phases 0/9/10 + full-PASS active-creator read-back

Keep staging on the exact SHA through the full controlled draft→approve→public
flow. A green health endpoint alone is not approval to move to production.

## Hard stops and abort rules (quick reference)

- Any non-zero SHA/env/listener/health/gate/migration/jq assertion ⇒ session ends; timers stay paused.
- Nginx promotion guard: any failure auto-runs `restore_nginx_boundary` (exit 90) — then **stop the application release**.
- Migration timeout ⇒ hard stop, inspect blocker, resume from checkpoint only.
- Fixture abort after a sign-in ⇒ mandatory abort-recovery procedure above.
- Rollback rehearsal failure ⇒ restore Fanward staging first, keep timers paused, block production, escalate to owner.
- Session revocation (admin, fixture owner/admin, rehearsal) is always a manual operator action after evidence capture — the trap cannot do it.

## Evidence inventory produced during the window

| Evidence | Path |
| --- | --- |
| Nginx backups | `/var/backups/surgeindex/nginx/${RELEASE_ID}/{http-hardening,production-vhost,staging-vhost}.conf` (+ sha256) |
| Staging pre-0014 backup | `/var/backups/surgeindex/staging/${RELEASE_ID}-pre-0014.dump` (+ size, sha256, `pg_restore --list` OK) |
| Build identity | `${STAGING_RELEASE}/release.env` (`BUILD_SHA=`), tracker + `dist/jobs` presence |
| Staging read-back | `/var/lib/surgeindex/release-evidence/fanward-staging-${RELEASE_SHA}.json` |
| Fixture (optional) | `fanward-fixture-${RELEASE_SHA}.json`, `…-status-…`, `…-cleanup-…`, `…-readback-…` (same dir) |
| Rehearsal read-back | `/var/lib/surgeindex/release-evidence/fanward-rollback-rehearsal-${ROLLBACK_SHA}.json` |
| Restoration read-back | `/var/lib/surgeindex/release-evidence/fanward-staging-restored-${RELEASE_SHA}.json` |
| Retained env backups | `${STAGING_ENV}.pre-${RELEASE_ID}`, `${STAGING_ENV}.fanward-${RELEASE_ID}` |

Redacted JSON only — no database URL, token, mailbox credential, Turnstile
secret, or cookie ever lands in evidence, argv, shell history, or the release
directory. Outcomes short of full staging acceptance: `BUILD READY`,
`STAGING READY` (all of §1–§4 + acceptance), never `FANWARD MVP LIVE`.
