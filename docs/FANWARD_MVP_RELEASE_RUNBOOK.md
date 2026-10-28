# Fanward MVP release and rollback runbook

This runbook promotes the noncommercial Fanward MVP to staging first and then
to the production VPS. It is an operator procedure, not standing authorization
to merge, change secrets, migrate a database, restart a service, or expose a
new public route. Each external action requires the release owner's approval
for the exact SHA and environment at the time it is performed.

## Release boundary

Fanward MVP enables creator profiles, moderation, the public creator directory,
and site-derived Impact Score behavior only. It is not approval for payments,
paid placement, campaigns, auctions, GA4, a revenue board, or a public API.

The only feature flag enabled by this profile is:

```text
FEATURE_CREATORS=true
```

The following kill switches must be explicit, not absent or inherited:

```text
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

`pnpm launch:gates:fanward` enforces the release boundary. The historical
Public Free profile remains separately enforceable with
`pnpm launch:gates:public-free`; that profile requires all four future feature
flags, including `FEATURE_CREATORS`, to be false. Generic `pnpm launch:gates`
reports every provider gate, while `pnpm launch:gates -- --strict` accepts
either safe release profile and does not require mutually incompatible
commercial provider gates.

The schema target for this release is 15 journal entries through migration
`0014`. Migration `0014` must remain additive and backward-compatible with the
known-good Public Free application because production rollback is code-only.

## Verified baseline and facts to refresh

The following was verified read-only on 2026-08-30. Treat it as a baseline,
not as proof of state at deployment time:

| Item | Verified baseline |
| --- | --- |
| Git remote | `https://github.com/Simonjay85/surgeindex.git` |
| Protected release branch | `fix/launch-readiness` |
| Repository default branch | `feat/surgeindex-mvp` (older than the release branch; do not deploy it implicitly) |
| Current production release | `/opt/surgeindex/releases/surgeindex-public-free-20260829.2` |
| Current production SHA | `e419c77289eb046c19f8c968e8d60062032717c4` |
| Current production selector | `/opt/surgeindex/current` symlink |
| Current staging release | `/opt/surgeindex/releases/surgeindex-public-free-20260829.2-staging` |
| Current staging selector | `surgeindex-staging.service` contains a direct release path; there is no staging symlink yet |
| Production listeners | app `127.0.0.1:3211`, PostgreSQL `127.0.0.1:55433` |
| Staging listeners | app `127.0.0.1:3212`, PostgreSQL `127.0.0.1:55434` |
| Package runner | `/usr/bin/corepack pnpm`, resolving the repository pin `pnpm@11.22.0` |
| Operator path | SSH alias `templystudio`, login user `ubuntu`, with approved `sudo` access required |

Both baseline databases reported PostgreSQL 17.11 and 14 applied migrations.
Both web services were active with zero recorded restarts at the audit. The
runtime environment files were root-owned and mode `0600`. Re-run all of these
checks; do not infer readiness from this table.

The VPS is a self-hosted Next.js/systemd deployment. Do not run `pnpm deploy`:
that script targets the Cloudflare/OpenNext path and is not the active
production delivery mechanism.

## Required authority and access

Do not open a release window until all of the following are named in the
release ticket:

- release owner and operator, with approval for the exact 40-character SHA;
- successful `checks` and `migrations` workflow jobs for that same SHA;
- GitHub review/merge rights for the protected `fix/launch-readiness` branch;
- SSH access through `ssh templystudio` and narrowly scoped `sudo` rights for
  `/opt/surgeindex`, the two systemd services, and the root-only env files;
- secret-manager access for separate staging and production database, Better
  Auth, Turnstile, transactional-email, and three tracker secrets;
- staging Basic Auth and a controlled verified application admin session for
  staging read-back;
- an approved controlled mailbox, site, and creator record for smoke tests;
- a current verified backup/restore checkpoint and the known-good release
  retained on disk.

Stripe, Boost, auction, campaign, GA4, and public-API credentials are neither
required nor authorized for this release. Supplying one does not permit its
gate to be enabled.

## 1. Pin one immutable release SHA

Merge reviewed work into `fix/launch-readiness`, then record the resulting
merge SHA. Never deploy a branch name, `origin/HEAD`, a tag without resolving
it, or a dirty local checkout.

```bash
export RELEASE_SHA='<approved 40-character merge SHA>'
git fetch --prune origin fix/launch-readiness
test "$(git rev-parse origin/fix/launch-readiness)" = "$RELEASE_SHA"
git merge-base --is-ancestor "$RELEASE_SHA" origin/fix/launch-readiness
git show --no-patch --format='%H %cI %s' "$RELEASE_SHA"
```

Confirm the GitHub Actions run rather than relying on a local green build:

```bash
gh run list --workflow launch-readiness.yml --commit "$RELEASE_SHA"
gh run view '<run-id>' --json headSha,conclusion,jobs
```

The `headSha` must equal `RELEASE_SHA`; both `checks` and `migrations` must be
successful. The migration artifact must show:

- fresh PostgreSQL 17 path `0000 -> 0014`, final count 15; and
- Batch 6 upgrade path `0000 -> 0010; 0011 -> 0012 -> 0013 -> 0014`, final
  count 15.

## 2. Refresh the host baseline without changing it

```bash
ssh -t templystudio 'bash --noprofile --norc'
set -euo pipefail

release_secret_cleanup() {
  local status=$?
  local variable_name secret_file expected_path
  local cleanup_failed=0
  trap - EXIT
  for variable_name in \
    STAGING_READBACK_ENV ROLLBACK_READBACK_ENV STAGING_RESTORE_READBACK_ENV \
    PRODUCTION_READBACK_ENV PRODUCTION_ROLLBACK_READBACK_ENV STAGING_FIXTURE_ENV \
    STAGING_FIXTURE_EDGE_CURL_CONFIG STAGING_FIXTURE_OWNER_LOGIN_JSON \
    STAGING_FIXTURE_ADMIN_LOGIN_JSON STAGING_FIXTURE_OWNER_SIGNIN_CURL_CONFIG \
    STAGING_FIXTURE_ADMIN_SIGNIN_CURL_CONFIG STAGING_FIXTURE_SIGNOUT_JSON \
    STAGING_FIXTURE_OWNER_SIGNOUT_CURL_CONFIG STAGING_FIXTURE_ADMIN_SIGNOUT_CURL_CONFIG \
    STAGING_FIXTURE_OWNER_COOKIE_JAR STAGING_FIXTURE_ADMIN_COOKIE_JAR \
    STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV STAGING_FIXTURE_READBACK_ENV \
    NGINX_EFFECTIVE_CONFIG NGINX_PROBE_CODES; do
    secret_file="${!variable_name:-}"
    expected_path=""
    if [[ "${RELEASE_ID:-}" =~ ^surgeindex-fanward-[0-9]{8}\.[0-9]{4}-[0-9a-f]{12}$ ]]; then
      case "$variable_name" in
        STAGING_READBACK_ENV) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-staging.env" ;;
        ROLLBACK_READBACK_ENV) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-rollback-rehearsal.env" ;;
        STAGING_RESTORE_READBACK_ENV) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-staging-restored.env" ;;
        PRODUCTION_READBACK_ENV) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-production.env" ;;
        PRODUCTION_ROLLBACK_READBACK_ENV) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-production-rollback.env" ;;
        STAGING_FIXTURE_ENV) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-fixture.env" ;;
        STAGING_FIXTURE_EDGE_CURL_CONFIG) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-fixture-edge.curl" ;;
        STAGING_FIXTURE_OWNER_LOGIN_JSON) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-fixture-owner-login.json" ;;
        STAGING_FIXTURE_ADMIN_LOGIN_JSON) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-fixture-admin-login.json" ;;
        STAGING_FIXTURE_OWNER_SIGNIN_CURL_CONFIG) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-fixture-owner-signin.curl" ;;
        STAGING_FIXTURE_ADMIN_SIGNIN_CURL_CONFIG) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-fixture-admin-signin.curl" ;;
        STAGING_FIXTURE_SIGNOUT_JSON) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-fixture-signout.json" ;;
        STAGING_FIXTURE_OWNER_SIGNOUT_CURL_CONFIG) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-fixture-owner-signout.curl" ;;
        STAGING_FIXTURE_ADMIN_SIGNOUT_CURL_CONFIG) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-fixture-admin-signout.curl" ;;
        STAGING_FIXTURE_OWNER_COOKIE_JAR) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-fixture-owner.cookies" ;;
        STAGING_FIXTURE_ADMIN_COOKIE_JAR) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-fixture-admin.cookies" ;;
        STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-fixture-rate-limit-phase.env" ;;
        STAGING_FIXTURE_READBACK_ENV) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-fixture-readback.env" ;;
        NGINX_EFFECTIVE_CONFIG) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-nginx-effective.conf" ;;
        NGINX_PROBE_CODES) expected_path="/run/surgeindex-fanward-${RELEASE_ID}-nginx-probe.codes" ;;
      esac
    fi
    if [[ -n "$secret_file" && "$secret_file" == "$expected_path" ]]; then
      if ! sudo rm -f -- "$secret_file"; then cleanup_failed=1; fi
    elif [[ -n "$secret_file" ]]; then
      printf 'Refusing cleanup of unexpected transient path for %s: %s\n' "$variable_name" "$secret_file" >&2
      cleanup_failed=1
    fi
  done
  if (( cleanup_failed != 0 && status == 0 )); then status=1; fi
  if (( status != 0 )); then
    printf 'RELEASE STOPPED (exit %s). Keep timers paused and revoke every ephemeral application session before continuing.\n' "$status" >&2
  fi
  exit "$status"
}
trap release_secret_cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

wait_until_http_responds() {
  local url=$1
  local attempt
  for attempt in $(seq 1 30); do
    if curl -fsS --max-time 5 -o /dev/null "$url"; then return 0; fi
    sleep 2
  done
  return 1
}

id -un
sudo -v
sudo systemctl is-active surgeindex.service surgeindex-staging.service
sudo systemctl show surgeindex.service surgeindex-staging.service \
  -p ActiveState -p SubState -p NRestarts -p FragmentPath -p DropInPaths
sudo systemctl cat surgeindex.service
sudo systemctl cat surgeindex-staging.service
readlink -f /opt/surgeindex/current
git -C "$(readlink -f /opt/surgeindex/current)" rev-parse HEAD
git -C /opt/surgeindex/releases/surgeindex-public-free-20260829.2-staging rev-parse HEAD
ss -ltn | grep -E '127\.0\.0\.1:(3211|3212|55433|55434)'
curl -fsS https://surgeindex.lol/api/health/live | jq .
curl -fsS https://surgeindex.lol/api/health/ready | jq .
```

Run every later host command in this same fail-closed Bash session. A non-zero
SHA assertion, backup check, migration, gate, HTTP read-back, or `jq` assertion
ends the session before subsequent commands. The exit trap removes only the
listed transient files when each path exactly matches the validated release ID;
it refuses a broad `/run` deletion. It cannot revoke an application session, so
session revocation remains a required operator action. After any failure, leave
all timers paused until the release owner completes the fixture abort-recovery
procedure below when fixture sessions may exist, then records a new staffed
continuation or rollback decision.

Resolve and record every `EnvironmentFile=` path shown by `systemctl cat`.
Check only ownership and mode; do not print the files:

```bash
sudo stat -c '%U:%G %a %n' '<production-env-file>' '<staging-env-file>'
```

Stop if a path, listener, service account, active SHA, restart count, or env
file differs unexpectedly. Reconcile the release ticket before continuing.

## 3. Prepare two immutable builds

Next.js public build values are compiled into output. Build staging and
production separately so their canonical origin and public Turnstile site key
cannot cross environments. The source SHA is identical; the release
directories and build environments are not.

On the VPS, set explicit names and validate the SHA before using them:

```bash
export RELEASE_SHA='<same approved 40-character SHA>'
export RELEASE_ID="surgeindex-fanward-$(date -u +%Y%m%d.%H%M)-${RELEASE_SHA:0:12}"
export STAGING_RELEASE="/opt/surgeindex/releases/${RELEASE_ID}-staging"
export PRODUCTION_RELEASE="/opt/surgeindex/releases/${RELEASE_ID}-production"
export REPOSITORY_URL='https://github.com/Simonjay85/surgeindex.git'
test "${#RELEASE_SHA}" -eq 40
case "$RELEASE_SHA" in *[!0-9a-f]*) exit 1 ;; esac
export RELEASE_AVAILABLE_KIB="$(df --output=avail /opt/surgeindex | tail -1 | tr -d ' ')"
export RELEASE_AVAILABLE_INODES="$(df --output=iavail /opt/surgeindex | tail -1 | tr -d ' ')"
test "$RELEASE_AVAILABLE_KIB" -ge 12582912
test "$RELEASE_AVAILABLE_INODES" -ge 100000
df -h /opt/surgeindex
df -i /opt/surgeindex
sudo du -sh /opt/surgeindex/releases /opt/surgeindex/current
sudo install -d -m 0755 -o ubuntu -g ubuntu "$STAGING_RELEASE" "$PRODUCTION_RELEASE"
```

The 12 GiB and 100,000-inode minima are a pre-build floor for two independent
Next.js artifacts plus rollback headroom, not a cleanup target. Stop and add
capacity if either assertion fails; do not delete retained releases during the
window to make the check pass.

Populate each empty directory from the exact SHA. The explicit fetch avoids
the repository's older default branch.

```bash
for release_dir in "$STAGING_RELEASE" "$PRODUCTION_RELEASE"; do
  sudo -u ubuntu git clone --filter=blob:none --no-checkout "$REPOSITORY_URL" "$release_dir"
  sudo -u ubuntu git -C "$release_dir" fetch --depth=1 origin "$RELEASE_SHA"
  sudo -u ubuntu git -C "$release_dir" checkout --detach FETCH_HEAD
  test "$(git -C "$release_dir" rev-parse HEAD)" = "$RELEASE_SHA"
  test -z "$(git -C "$release_dir" status --porcelain=v1)"
done
```

Create root-only candidate env files from the current environment. Replace the
placeholders with the exact paths discovered from `systemctl cat`:

```bash
export STAGING_ENV='<staging main EnvironmentFile path>'
export PRODUCTION_ENV='/etc/surgeindex/surgeindex.env'
export STAGING_TURNSTILE_ENV='/etc/surgeindex/turnstile.staging.env'
export PRODUCTION_TURNSTILE_ENV='/etc/surgeindex/turnstile.production.env'
export EMAIL_ENV='/etc/surgeindex/resend.env'
export STAGING_ENV_CANDIDATE="${STAGING_ENV}.${RELEASE_ID}.candidate"
export PRODUCTION_ENV_CANDIDATE="${PRODUCTION_ENV}.${RELEASE_ID}.candidate"
sudo stat -c '%U:%G %a %n' \
  "$STAGING_ENV" "$PRODUCTION_ENV" \
  "$STAGING_TURNSTILE_ENV" "$PRODUCTION_TURNSTILE_ENV" "$EMAIL_ENV"
sudo install -m 0600 -o root -g root "$STAGING_ENV" "$STAGING_ENV_CANDIDATE"
sudo install -m 0600 -o root -g root "$PRODUCTION_ENV" "$PRODUCTION_ENV_CANDIDATE"
sudoedit "$STAGING_ENV_CANDIDATE"
sudoedit "$PRODUCTION_ENV_CANDIDATE"
```

Set the Fanward boundary listed at the start of this runbook, plus these core
values in both candidates:

```text
NODE_ENV=production
APP_MODE=production
DATA_PROVIDER=postgres
EXPECTED_MIGRATION_COUNT=15
TRUSTED_PROXY_MODE=direct_nginx
TRACKER_ENABLED=true
TURNSTILE_REQUIRED=true
EMAIL_PROVIDER=http
```

Use the exact canonical values per build:

```text
# staging candidate
NEXT_PUBLIC_APP_URL=https://staging.surgeindex.lol
BETTER_AUTH_URL=https://staging.surgeindex.lol
TURNSTILE_EXPECTED_HOSTNAME=staging.surgeindex.lol

# production candidate
NEXT_PUBLIC_APP_URL=https://surgeindex.lol
BETTER_AUTH_URL=https://surgeindex.lol
TURNSTILE_EXPECTED_HOSTNAME=surgeindex.lol
```

Staging and production must have separate database URLs, Better Auth secrets,
Turnstile pairs, tracker signing/hash/rotation secrets of at least 32
characters, and approved transactional-email settings. Repeat every additional
root-only `EnvironmentFile=` from the relevant service, in unit-file order, on
the transient build/migration/gate commands below. Never place secret values on
the command line or in the release directory.

Validate only safe switches without showing credentials:

```bash
sudo grep -E '^(APP_MODE|DATA_PROVIDER|EXPECTED_MIGRATION_COUNT|TRUSTED_PROXY_MODE|TRACKER_ENABLED|TURNSTILE_REQUIRED|EMAIL_PROVIDER|NEXT_PUBLIC_COMMERCIAL_ENABLED|STRIPE_ENABLED|BOOST_ENABLED|BOOST_LIVE_MODE_ENABLED|GA4_ENABLED|PUBLIC_REVENUE_BOARD_ENABLED|PUBLIC_PAGE_METRICS_ENABLED|BOOST_PLACEMENT_[A-Z_]+|FEATURE_[A-Z_]+)=' "$STAGING_ENV_CANDIDATE"
sudo grep -E '^(APP_MODE|DATA_PROVIDER|EXPECTED_MIGRATION_COUNT|TRUSTED_PROXY_MODE|TRACKER_ENABLED|TURNSTILE_REQUIRED|EMAIL_PROVIDER|NEXT_PUBLIC_COMMERCIAL_ENABLED|STRIPE_ENABLED|BOOST_ENABLED|BOOST_LIVE_MODE_ENABLED|GA4_ENABLED|PUBLIC_REVENUE_BOARD_ENABLED|PUBLIC_PAGE_METRICS_ENABLED|BOOST_PLACEMENT_[A-Z_]+|FEATURE_[A-Z_]+)=' "$PRODUCTION_ENV_CANDIDATE"
for env_candidate in "$STAGING_ENV_CANDIDATE" "$PRODUCTION_ENV_CANDIDATE"; do
  test "$(sudo grep -Ec '^TRUSTED_PROXY_MODE=' "$env_candidate")" = '1'
  sudo grep -qx 'TRUSTED_PROXY_MODE=direct_nginx' "$env_candidate"
done
```

Install and build with the repository-pinned pnpm. Do not use the VPS-global
pnpm version and do not build through the live symlink:

```bash
sudo systemd-run --wait --collect --pipe --unit="surgeindex-install-${RELEASE_ID}-staging" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  /usr/bin/corepack pnpm install --frozen-lockfile
sudo systemd-run --wait --collect --pipe --unit="surgeindex-build-${RELEASE_ID}-staging" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
  --property="EnvironmentFile=$STAGING_ENV_CANDIDATE" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  /usr/bin/corepack pnpm build

sudo systemd-run --wait --collect --pipe --unit="surgeindex-install-${RELEASE_ID}-production" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$PRODUCTION_RELEASE" \
  /usr/bin/corepack pnpm install --frozen-lockfile
sudo systemd-run --wait --collect --pipe --unit="surgeindex-build-${RELEASE_ID}-production" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$PRODUCTION_RELEASE" \
  --property="EnvironmentFile=$PRODUCTION_ENV_CANDIDATE" \
  --property="EnvironmentFile=$PRODUCTION_TURNSTILE_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  /usr/bin/corepack pnpm build
```

Record the immutable build identity after both builds:

```bash
for release_dir in "$STAGING_RELEASE" "$PRODUCTION_RELEASE"; do
  test "$(git -C "$release_dir" rev-parse HEAD)" = "$RELEASE_SHA"
  git -C "$release_dir" diff --exit-code
  printf 'BUILD_SHA=%s\n' "$RELEASE_SHA" | sudo tee "$release_dir/release.env" >/dev/null
  sudo chown ubuntu:ubuntu "$release_dir/release.env"
  sudo chmod 0644 "$release_dir/release.env"
  grep -qx "BUILD_SHA=$RELEASE_SHA" "$release_dir/release.env"
  test -s "$release_dir/tracker/build/tracker.js"
  test -d "$release_dir/dist/jobs"
done
```

Run the strict configuration gate against each candidate before touching a
database. Add the service's remaining `EnvironmentFile=` properties so the
gate sees Turnstile/email fragments without printing them:

```bash
sudo systemd-run --wait --collect --pipe --unit="surgeindex-gate-${RELEASE_ID}-staging" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
  --property="EnvironmentFile=$STAGING_ENV_CANDIDATE" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  /usr/bin/corepack pnpm launch:gates:fanward
sudo systemd-run --wait --collect --pipe --unit="surgeindex-gate-${RELEASE_ID}-production" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$PRODUCTION_RELEASE" \
  --property="EnvironmentFile=$PRODUCTION_ENV_CANDIDATE" \
  --property="EnvironmentFile=$PRODUCTION_TURNSTILE_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  /usr/bin/corepack pnpm launch:gates:fanward
```

Before exposing the database-backed Fanward surfaces, apply the reviewed URI
map and `surgeindex_fanward_public` zone from
`deploy/vps/nginx-http-hardening.conf` in Nginx's `http {}` context. Apply the
three server-scope directives from `deploy/vps/surgeindex.nginx.conf` to both
canonical TLS vhosts: the Fanward `limit_req`, status `429`, and explicit
`limit_req_dry_run off`. Requests outside the exact map have an empty key and
are not accounted. Do not create a new Fanward `location`: preserving the
existing catch-all locations also preserves staging Basic Auth and the pinned
upstreams (`3211` production, `3212` staging). Do not reuse the stricter
anonymous-mutation zone. Installing or reloading Nginx and the bounded runtime
burst below are separately approved external actions.

Resolve the three active files from the source markers in the current
`nginx -T` output. The production vhost path is fixed; enter the exact included
hardening and staging-vhost paths discovered on this host. Back up all three
before preparing same-directory candidates. Keep the backup after the release:

```bash
export NGINX_BIN='/www/server/nginx/sbin/nginx'
export NGINX_PID_FILE='/www/server/nginx/logs/nginx.pid'
export NGINX_HTTP_HARDENING_CONFIG='<active included http-hardening path from nginx -T>'
export NGINX_PRODUCTION_VHOST='/www/server/panel/vhost/nginx/surgeindex.lol.conf'
export NGINX_STAGING_VHOST='<active staging TLS vhost path from nginx -T>'
export NGINX_BACKUP_DIR="/var/backups/surgeindex/nginx/${RELEASE_ID}"
export NGINX_HTTP_CANDIDATE="${NGINX_HTTP_HARDENING_CONFIG}.${RELEASE_ID}.candidate"
export NGINX_PRODUCTION_CANDIDATE="${NGINX_PRODUCTION_VHOST}.${RELEASE_ID}.candidate"
export NGINX_STAGING_CANDIDATE="${NGINX_STAGING_VHOST}.${RELEASE_ID}.candidate"
export NGINX_HTTP_RESTORE="${NGINX_HTTP_HARDENING_CONFIG}.${RELEASE_ID}.restore"
export NGINX_PRODUCTION_RESTORE="${NGINX_PRODUCTION_VHOST}.${RELEASE_ID}.restore"
export NGINX_STAGING_RESTORE="${NGINX_STAGING_VHOST}.${RELEASE_ID}.restore"
export NGINX_EFFECTIVE_CONFIG="/run/surgeindex-fanward-${RELEASE_ID}-nginx-effective.conf"
export NGINX_PROBE_CODES="/run/surgeindex-fanward-${RELEASE_ID}-nginx-probe.codes"
test -x "$NGINX_BIN"
sudo test -r "$NGINX_PID_FILE"
for config_path in \
  "$NGINX_HTTP_HARDENING_CONFIG" "$NGINX_PRODUCTION_VHOST" "$NGINX_STAGING_VHOST"; do
  sudo test -f "$config_path"
  test "$(sudo realpath -e "$config_path")" = "$config_path"
done
sudo test ! -e "$NGINX_BACKUP_DIR"
sudo test ! -L "$NGINX_BACKUP_DIR"
for transient_path in \
  "$NGINX_HTTP_CANDIDATE" "$NGINX_PRODUCTION_CANDIDATE" "$NGINX_STAGING_CANDIDATE" \
  "$NGINX_HTTP_RESTORE" "$NGINX_PRODUCTION_RESTORE" "$NGINX_STAGING_RESTORE"; do
  sudo test ! -e "$transient_path"
  sudo test ! -L "$transient_path"
done
sudo install -d -m 0700 -o root -g root "$NGINX_BACKUP_DIR"
sudo cp --preserve=all "$NGINX_HTTP_HARDENING_CONFIG" "$NGINX_BACKUP_DIR/http-hardening.conf"
sudo cp --preserve=all "$NGINX_PRODUCTION_VHOST" "$NGINX_BACKUP_DIR/production-vhost.conf"
sudo cp --preserve=all "$NGINX_STAGING_VHOST" "$NGINX_BACKUP_DIR/staging-vhost.conf"
sudo cp --preserve=all "$NGINX_HTTP_HARDENING_CONFIG" "$NGINX_HTTP_CANDIDATE"
sudo cp --preserve=all "$NGINX_PRODUCTION_VHOST" "$NGINX_PRODUCTION_CANDIDATE"
sudo cp --preserve=all "$NGINX_STAGING_VHOST" "$NGINX_STAGING_CANDIDATE"
sudo sha256sum \
  "$NGINX_BACKUP_DIR/http-hardening.conf" \
  "$NGINX_BACKUP_DIR/production-vhost.conf" \
  "$NGINX_BACKUP_DIR/staging-vhost.conf"
sudoedit "$NGINX_HTTP_CANDIDATE"
sudoedit "$NGINX_PRODUCTION_CANDIDATE"
sudoedit "$NGINX_STAGING_CANDIDATE"
```

Edit only the URI map/zone and the three server-scope directives described
above. Leave both catch-all proxy blocks and all staging authentication
directives where they are. The checker deliberately rejects a child location
that can divert a protected Fanward route, a local limiter that cancels server
inheritance, commented-only expected directives, direct includes/rewrites it
cannot associate, missing staging Basic Auth, production Basic Auth, a wrong
upstream, or any effective dry-run override.

Define the exact restore path before replacing the files. It atomically restores
the retained originals, syntax-checks them, reloads them, and verifies the old
configuration again. Do not continue the application release after this runs:

```bash
restore_nginx_boundary() {
  local master_pid old_children current_children new_pids pid attempt probe_ip probe_path
  local stability_check survivor
  sudo cp --preserve=all "$NGINX_BACKUP_DIR/http-hardening.conf" "$NGINX_HTTP_RESTORE"
  sudo cp --preserve=all "$NGINX_BACKUP_DIR/production-vhost.conf" "$NGINX_PRODUCTION_RESTORE"
  sudo cp --preserve=all "$NGINX_BACKUP_DIR/staging-vhost.conf" "$NGINX_STAGING_RESTORE"
  sudo mv -Tf "$NGINX_HTTP_RESTORE" "$NGINX_HTTP_HARDENING_CONFIG"
  sudo mv -Tf "$NGINX_PRODUCTION_RESTORE" "$NGINX_PRODUCTION_VHOST"
  sudo mv -Tf "$NGINX_STAGING_RESTORE" "$NGINX_STAGING_VHOST"
  sudo cmp -s "$NGINX_BACKUP_DIR/http-hardening.conf" "$NGINX_HTTP_HARDENING_CONFIG"
  sudo cmp -s "$NGINX_BACKUP_DIR/production-vhost.conf" "$NGINX_PRODUCTION_VHOST"
  sudo cmp -s "$NGINX_BACKUP_DIR/staging-vhost.conf" "$NGINX_STAGING_VHOST"
  sudo "$NGINX_BIN" -t
  master_pid="$(sudo cat "$NGINX_PID_FILE")"
  case "$master_pid" in ''|*[!0-9]*) return 1 ;; esac
  old_children="$(sudo pgrep -P "$master_pid" | sort -n | tr '\n' ' ' || true)"
  test -n "$old_children"
  sudo "$NGINX_BIN" -s reload
  new_pids=''
  for attempt in $(seq 1 30); do
    test "$(sudo cat "$NGINX_PID_FILE")" = "$master_pid"
    current_children="$(sudo pgrep -P "$master_pid" | sort -n | tr '\n' ' ' || true)"
    for pid in $current_children; do
      if [[ " $old_children " != *" $pid "* && " $new_pids " != *" $pid "* ]]; then
        new_pids+="${pid} "
      fi
    done
    if [[ -n "$new_pids" ]]; then break; fi
    sleep 1
  done
  test -n "$new_pids"
  printf -v probe_ip '127.%d.%d.%d' \
    "$((16#${RELEASE_SHA:34:2} % 254 + 1))" \
    "$((16#${RELEASE_SHA:36:2} % 254 + 1))" \
    "$((16#${RELEASE_SHA:38:2} % 254 + 1))"
  for probe_path in \
    /fanward '/api/fanward/creators?limit=1' /sitemap.xml \
    /dashboard/fanward /admin/fanward; do
    test "$(curl --silent --show-error --max-time 10 \
      --interface "$probe_ip" \
      --resolve 'staging.surgeindex.lol:443:127.0.0.1' \
      --output /dev/null --write-out '%{http_code}' \
      "https://staging.surgeindex.lol${probe_path}")" = '401'
  done
  for stability_check in 1 2; do
    current_children="$(sudo pgrep -P "$master_pid" | sort -n | tr '\n' ' ' || true)"
    survivor=''
    for pid in $new_pids; do
      if [[ " $current_children " == *" $pid "* ]]; then survivor=$pid; break; fi
    done
    test -n "$survivor"
    if (( stability_check == 1 )); then sleep 1; fi
  done
}
```

Run the repository checker from both immutable artifacts, atomically promote the
three candidates, and validate the semantic `nginx -T` output before reload.
The guarded subshell restores the old configuration after any syntax, parser,
worker-generation, Basic-Auth, or runtime-limiter failure:

```bash
for release_dir in "$STAGING_RELEASE" "$PRODUCTION_RELEASE"; do
  sudo systemd-run --quiet --wait --collect --pipe \
    --unit="surgeindex-nginx-boundary-${RELEASE_ID}-$(basename "$release_dir")" \
    --property=User=ubuntu --property=Group=ubuntu \
    --property="WorkingDirectory=$release_dir" \
    /usr/bin/corepack pnpm nginx:release-check
done
```

Freeze Nginx changes in the control panel, Certbot, and operator sessions for
this promotion. Immediately before arming the restore guard, prove that none of
the three active files changed after backup. If any comparison fails, stop
without restoring or promoting anything; recreate the backup and candidates
from the newly reviewed active configuration:

```bash
sudo cmp -s "$NGINX_BACKUP_DIR/http-hardening.conf" "$NGINX_HTTP_HARDENING_CONFIG"
sudo cmp -s "$NGINX_BACKUP_DIR/production-vhost.conf" "$NGINX_PRODUCTION_VHOST"
sudo cmp -s "$NGINX_BACKUP_DIR/staging-vhost.conf" "$NGINX_STAGING_VHOST"

set +e
(
  set -euo pipefail
  NGINX_PROMOTION_COMPLETE=0
  nginx_promotion_guard() {
    local original_status=$?
    trap - EXIT HUP INT TERM
    if (( NGINX_PROMOTION_COMPLETE == 0 )); then
      restore_nginx_boundary
      exit 90
    fi
    exit "$original_status"
  }
  trap nginx_promotion_guard EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
  sudo mv -Tf "$NGINX_HTTP_CANDIDATE" "$NGINX_HTTP_HARDENING_CONFIG"
  sudo mv -Tf "$NGINX_PRODUCTION_CANDIDATE" "$NGINX_PRODUCTION_VHOST"
  sudo mv -Tf "$NGINX_STAGING_CANDIDATE" "$NGINX_STAGING_VHOST"
  sudo "$NGINX_BIN" -t
  sudo install -m 0600 -o root -g root /dev/null "$NGINX_EFFECTIVE_CONFIG"
  sudo "$NGINX_BIN" -T 2>&1 | sudo tee "$NGINX_EFFECTIVE_CONFIG" >/dev/null
  test "$(sudo stat -c '%U:%G %a' "$NGINX_EFFECTIVE_CONFIG")" = 'root:root 600'
  sudo /usr/bin/node "$STAGING_RELEASE/scripts/nginx-fanward-boundary-check.mjs" \
    --effective "$NGINX_EFFECTIVE_CONFIG"

  NGINX_MASTER_PID="$(sudo cat "$NGINX_PID_FILE")"
  case "$NGINX_MASTER_PID" in ''|*[!0-9]*) exit 1 ;; esac
  OLD_NGINX_CHILDREN="$(sudo pgrep -P "$NGINX_MASTER_PID" | sort -n | tr '\n' ' ' || true)"
  test -n "$OLD_NGINX_CHILDREN"
  sudo "$NGINX_BIN" -s reload
  NEW_NGINX_PIDS=''
  for attempt in $(seq 1 30); do
    test "$(sudo cat "$NGINX_PID_FILE")" = "$NGINX_MASTER_PID"
    CURRENT_NGINX_CHILDREN="$(sudo pgrep -P "$NGINX_MASTER_PID" | sort -n | tr '\n' ' ' || true)"
    for pid in $CURRENT_NGINX_CHILDREN; do
      if [[ " $OLD_NGINX_CHILDREN " != *" $pid "* && " $NEW_NGINX_PIDS " != *" $pid "* ]]; then
        NEW_NGINX_PIDS+="${pid} "
      fi
    done
    if [[ -n "$NEW_NGINX_PIDS" ]]; then break; fi
    sleep 1
  done
  test -n "$NEW_NGINX_PIDS"
  sudo "$NGINX_BIN" -T 2>&1 | sudo tee "$NGINX_EFFECTIVE_CONFIG" >/dev/null
  sudo /usr/bin/node "$STAGING_RELEASE/scripts/nginx-fanward-boundary-check.mjs" \
    --effective "$NGINX_EFFECTIVE_CONFIG"

  printf -v NGINX_PROBE_CLIENT_IP '127.%d.%d.%d' \
    "$((16#${RELEASE_SHA:34:2} % 254 + 1))" \
    "$((16#${RELEASE_SHA:36:2} % 254 + 1))" \
    "$((16#${RELEASE_SHA:38:2} % 254 + 1))"
  for probe_path in \
    /fanward '/api/fanward/creators?limit=1' /sitemap.xml \
    /dashboard/fanward /admin/fanward; do
    test "$(curl --silent --show-error --max-time 10 \
      --interface "$NGINX_PROBE_CLIENT_IP" \
      --resolve 'staging.surgeindex.lol:443:127.0.0.1' \
      --output /dev/null --write-out '%{http_code}' \
      "https://staging.surgeindex.lol${probe_path}")" = '401'
  done

  sudo install -m 0600 -o ubuntu -g ubuntu /dev/null "$NGINX_PROBE_CODES"
  for request_number in $(seq 1 80); do
    (
      curl --silent --show-error --max-time 10 --request HEAD \
        --interface "$NGINX_PROBE_CLIENT_IP" \
        --resolve 'surgeindex.lol:443:127.0.0.1' \
        --output /dev/null --write-out '%{http_code}\n' \
        'https://surgeindex.lol/creators' || printf '000\n'
    ) >>"$NGINX_PROBE_CODES" &
  done
  wait
  test "$(wc -l < "$NGINX_PROBE_CODES" | tr -d ' ')" = '80'
  if grep -Ev '^(2[0-9][0-9]|3[0-9][0-9]|429)$' "$NGINX_PROBE_CODES"; then exit 1; fi
  grep -Eq '^(2[0-9][0-9]|3[0-9][0-9])$' "$NGINX_PROBE_CODES"
  grep -Fxq '429' "$NGINX_PROBE_CODES"
  test "$(curl --silent --show-error --max-time 10 \
    --interface "$NGINX_PROBE_CLIENT_IP" \
    --resolve 'surgeindex.lol:443:127.0.0.1' \
    --output /dev/null --write-out '%{http_code}' \
    'https://surgeindex.lol/api/health/live')" = '200'
  for stability_check in 1 2; do
    CURRENT_NGINX_CHILDREN="$(sudo pgrep -P "$NGINX_MASTER_PID" | sort -n | tr '\n' ' ' || true)"
    NGINX_GENERATION_SURVIVOR=''
    for pid in $NEW_NGINX_PIDS; do
      if [[ " $CURRENT_NGINX_CHILDREN " == *" $pid "* ]]; then
        NGINX_GENERATION_SURVIVOR=$pid
        break
      fi
    done
    test -n "$NGINX_GENERATION_SURVIVOR"
    if (( stability_check == 1 )); then sleep 1; fi
  done
  NGINX_PROMOTION_COMPLETE=1
  trap - EXIT HUP INT TERM
)
NGINX_PROMOTION_STATUS=$?
set -e
if (( NGINX_PROMOTION_STATUS != 0 )); then
  if (( NGINX_PROMOTION_STATUS != 90 )); then restore_nginx_boundary; fi
  exit 1
fi
sudo rm -f -- "$NGINX_EFFECTIVE_CONFIG" "$NGINX_PROBE_CODES"
```

The unique loopback source IP contains the last three SHA bytes, so the bounded
80-request HEAD burst cannot consume a real visitor's bucket or the later
fixture bucket. The required mix of normal responses and edge `429`, followed
by a same-IP `200` on an unmapped health route, proves both enforcement and the
empty-key exclusion. The credential-free staging probes prove that the current
Nginx worker generation still enforces Basic Auth across every protected route.
Only after all of this passes may migration `0014` begin.

## 4. Stage migration 0014 and switch staging

Complete this entire section before production. Migration is forward-only.
Pause staging writes, take and verify the staging backup, and record the old
unit text and direct release path before migration.

The current staging unit hard-codes a release directory. Before the window,
install a drop-in that points it to a stable staging selector. Back up the
current unit, then use `sudo systemctl edit surgeindex-staging.service` with:

```ini
[Service]
WorkingDirectory=/opt/surgeindex/staging-current/apps/web
EnvironmentFile=
EnvironmentFile=/etc/surgeindex/turnstile.staging.env
EnvironmentFile=/etc/surgeindex/staging.env
EnvironmentFile=-/etc/surgeindex/resend.env
EnvironmentFile=-/opt/surgeindex/staging-current/release.env
ExecStart=
ExecStart=/usr/bin/node /opt/surgeindex/staging-current/apps/web/node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3212
```

The two staging writer services also hard-code the old release. Install a
drop-in for `surgeindex-staging-traffic-aggregation.service`:

```ini
[Service]
WorkingDirectory=/opt/surgeindex/staging-current
EnvironmentFile=
EnvironmentFile=/etc/surgeindex/staging.env
EnvironmentFile=-/etc/surgeindex/turnstile.staging.env
EnvironmentFile=-/etc/surgeindex/resend.env
EnvironmentFile=-/opt/surgeindex/staging-current/release.env
ExecStart=
ExecStart=/usr/bin/node /opt/surgeindex/staging-current/dist/jobs/run-traffic-aggregation.mjs
TimeoutStartSec=240
RuntimeMaxSec=300
```

Install the corresponding drop-in for
`surgeindex-staging-scoring.service`:

```ini
[Service]
WorkingDirectory=/opt/surgeindex/staging-current
EnvironmentFile=
EnvironmentFile=/etc/surgeindex/staging.env
EnvironmentFile=-/etc/surgeindex/turnstile.staging.env
EnvironmentFile=-/etc/surgeindex/resend.env
EnvironmentFile=-/opt/surgeindex/staging-current/release.env
ExecStart=
ExecStart=/usr/bin/node /opt/surgeindex/staging-current/dist/jobs/run-scoring-jobs.mjs
TimeoutStartSec=240
RuntimeMaxSec=300
```

Resetting `EnvironmentFile=` and `ExecStart=` is intentional: it prevents the
merged units from retaining a second old-release env or executable. All three
staging processes must resolve through the same selector.

Do not restart yet. Validate the merged unit and keep the previous unit/drop-in
copy with the release evidence:

```bash
sudo systemctl daemon-reload
sudo systemd-analyze verify \
  surgeindex-staging.service \
  surgeindex-staging-traffic-aggregation.service \
  surgeindex-staging-scoring.service
sudo systemctl cat \
  surgeindex-staging.service \
  surgeindex-staging-traffic-aggregation.service \
  surgeindex-staging-scoring.service
```

Quiesce staging before its snapshot. Stop both staging timers, wait at most ten
minutes for any already-running writers to finish, require successful exits,
then stop the staging web service so no controlled test write can overlap the
snapshot or migration:

```bash
sudo systemctl stop surgeindex-staging-traffic-aggregation.timer surgeindex-staging-scoring.timer
for unit in surgeindex-staging-traffic-aggregation.service surgeindex-staging-scoring.service; do
  for attempt in $(seq 1 120); do
    state="$(sudo systemctl show "$unit" -p ActiveState --value)"
    test "$state" != active -a "$state" != activating && break
    sleep 5
  done
  test "$(sudo systemctl show "$unit" -p ActiveState --value)" = inactive
  test "$(sudo systemctl show "$unit" -p Result --value)" = success
  test "$(sudo systemctl show "$unit" -p ExecMainStatus --value)" = 0
  sudo systemctl show "$unit" -p ActiveState -p Result -p ExecMainStatus
done
sudo systemctl stop surgeindex-staging.service
test "$(sudo systemctl show surgeindex-staging.service -p ActiveState --value)" = inactive
```

The production backup unit targets `surgeindex-db`, not the separate staging
container. Create and verify an explicit root-only staging custom-format dump:

```bash
export STAGING_BACKUP_DIR='/var/backups/surgeindex/staging'
export STAGING_BACKUP="${STAGING_BACKUP_DIR}/${RELEASE_ID}-pre-0014.dump"
sudo install -d -m 0700 -o root -g root "$STAGING_BACKUP_DIR"
sudo docker exec surgeindex-staging-db sh -ec \
  'exec pg_dump --format=custom --no-owner --no-privileges --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  | sudo dd of="$STAGING_BACKUP" status=none
sudo chown root:root "$STAGING_BACKUP"
sudo chmod 0600 "$STAGING_BACKUP"
sudo test -s "$STAGING_BACKUP"
sudo stat -c '%U:%G %a %s %y %n' "$STAGING_BACKUP"
sudo sha256sum "$STAGING_BACKUP"
sudo dd if="$STAGING_BACKUP" status=none \
  | sudo docker exec -i surgeindex-staging-db pg_restore --list >/dev/null
```

Keep its exact path, size, checksum, and successful archive-list result in the
release evidence. Do not reuse a production backup as staging evidence.

Start the staging switch window. From the exact staging release, run migration
`0014` with the candidate env:

```bash
sudo systemd-run --wait --collect --pipe --unit="surgeindex-migrate-${RELEASE_ID}-staging" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_ENV_CANDIDATE" \
  --setenv='PGOPTIONS=-c lock_timeout=5s -c statement_timeout=120s' \
  /usr/bin/corepack pnpm db:migrate
```

`lock_timeout` prevents the change window from waiting indefinitely behind an
unexpected writer. `statement_timeout` bounds the migration itself. Both are
non-secret, apply only to the transient migration process, and must not be
added to the long-lived web-service environment. A timeout is a hard stop:
inspect the blocker and restart from the backup/checkpoint rather than raising
the limits during the window.

Read the database directly without placing its URL in argv. The only output is
the count; it must be `15`:

```bash
sudo systemd-run --wait --collect --pipe --unit="surgeindex-readback-${RELEASE_ID}-staging" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_ENV_CANDIDATE" \
  /usr/bin/node -e 'const {Client}=require("pg");(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL});await c.connect();const r=await c.query("select count(*)::int as count from drizzle.__drizzle_migrations");console.log(JSON.stringify({migrationCount:Number(r.rows[0].count)}));await c.end()})().catch(e=>{console.error(e.name);process.exit(1)})'
```

Promote the candidate env, atomically select the new staging release, restart,
and require exact-SHA health:

```bash
sudo install -m 0600 -o root -g root "$STAGING_ENV" "${STAGING_ENV}.pre-${RELEASE_ID}"
sudo install -m 0600 -o root -g root "$STAGING_ENV_CANDIDATE" "${STAGING_ENV}.next-${RELEASE_ID}"
sudo mv -Tf "${STAGING_ENV}.next-${RELEASE_ID}" "$STAGING_ENV"
sudo ln -s "$STAGING_RELEASE" "/opt/surgeindex/.staging-current-${RELEASE_ID}"
sudo mv -Tf "/opt/surgeindex/.staging-current-${RELEASE_ID}" /opt/surgeindex/staging-current
sudo systemctl restart surgeindex-staging.service
sudo systemctl is-active surgeindex-staging.service
test "$(readlink -f /opt/surgeindex/staging-current)" = "$STAGING_RELEASE"
wait_until_http_responds http://127.0.0.1:3212/api/health/live
curl -fsS http://127.0.0.1:3212/api/health/live | jq -e --arg sha "$RELEASE_SHA" '.data.status == "ok" and .data.build == $sha'
curl -fsS http://127.0.0.1:3212/api/health/ready | jq -e '.data.ready == true and .data.checks.database == true and .data.checks.migrations == true and .data.expectedMigrationCount == 15'
```

Run the gate again against the promoted environment, then execute the dedicated
Fanward read-back. Never put Basic Auth or a session cookie in argv, an exported
interactive-shell variable, shell history, or the release directory. Create a
root-owned transient `EnvironmentFile` in `/run`; systemd reads it before
dropping to the `ubuntu` service account:

```bash
sudo systemd-run --wait --collect --pipe --unit="surgeindex-postswitch-gate-${RELEASE_ID}-staging" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
  --property="EnvironmentFile=$STAGING_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  /usr/bin/corepack pnpm launch:gates:fanward

for unit in surgeindex-staging-traffic-aggregation.service surgeindex-staging-scoring.service; do
  sudo systemctl start "$unit"
  test "$(sudo systemctl show "$unit" -p Result --value)" = success
  test "$(sudo systemctl show "$unit" -p ExecMainStatus --value)" = 0
  sudo systemctl show "$unit" -p ActiveState -p Result -p ExecMainStatus
done

export RELEASE_EVIDENCE_DIR='/var/lib/surgeindex/release-evidence'
export STAGING_READBACK_ENV="/run/surgeindex-fanward-${RELEASE_ID}-staging.env"
export STAGING_READBACK_EVIDENCE="${RELEASE_EVIDENCE_DIR}/fanward-staging-${RELEASE_SHA}.json"
sudo install -d -m 0750 -o ubuntu -g ubuntu "$RELEASE_EVIDENCE_DIR"
sudo install -m 0600 -o root -g root /dev/null "$STAGING_READBACK_ENV"
sudoedit "$STAGING_READBACK_ENV"
```

Enter the following names in that file. Resolve every placeholder to the exact
value from the release ticket or secret manager. Quote/escape values according
to `systemd.exec(5)`; neither credential may contain a newline:

```text
FANWARD_READBACK_MODE=staging
FANWARD_READBACK_DEPLOYMENT=staging
FANWARD_READBACK_EXPECTED_SHA=<RELEASE_SHA>
FANWARD_READBACK_TOOL_SHA=<RELEASE_SHA>
FANWARD_READBACK_RELEASE_DIR=<STAGING_RELEASE>
FANWARD_READBACK_EVIDENCE_FILE=<STAGING_READBACK_EVIDENCE>
FANWARD_READBACK_BASE_URL=https://staging.surgeindex.lol
FANWARD_READBACK_PUBLIC_ORIGIN=https://staging.surgeindex.lol
FANWARD_READBACK_BASIC_AUTH=<controlled staging Basic Auth value>
FANWARD_READBACK_ADMIN_COOKIE=<ephemeral verified admin Cookie header value>
```

Run from the exact staging artifact. A missing admin session is `PARTIAL` and
returns exit status 2; it is not staging acceptance:

```bash
sudo systemd-run --wait --collect --pipe --unit="surgeindex-fanward-readback-${RELEASE_ID}-staging" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
  --property="EnvironmentFile=$STAGING_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  --property="EnvironmentFile=$STAGING_READBACK_ENV" \
  /usr/bin/corepack pnpm fanward:readback
sudo test "$(sudo stat -c '%a' "$STAGING_READBACK_EVIDENCE")" = 600
sudo jq -e '.result == "PASS" and .mode == "staging" and .deployment == "staging" and .summary.failed == 0 and .summary.notRun == 0' "$STAGING_READBACK_EVIDENCE"
sudo rm -f "$STAGING_READBACK_ENV"
```

Revoke the ephemeral application admin session immediately after evidence is
captured. Keep the redacted JSON evidence; do not keep its source credentials.

### Optional synthetic staging prerequisite

Use this path only when a controlled public domain is unavailable. It proves
the Fanward owner/admin authentication and moderation APIs against an isolated
staging record; it does **not** prove signup, email delivery, DNS/meta claim,
tracker installation, or a real traffic source. The preferred acceptance path
still uses verified accounts and a domain controlled by the release owner.

The fixture command is hard-pinned to `https://staging.surgeindex.lol`, the
loopback `surgeindex_staging` database on port `55434`, migration count 15, and
the exact checkout SHA. It refuses production and every non-exact origin or
database target. It creates:

- two release-scoped Better Auth credential principals marked `is_demo=true`;
- one clearly named `.staging.invalid` site marked `is_demo=false`, because
  Fanward intentionally excludes demo sites from creator eligibility;
- exactly one owner membership and one synthetic tracker-verification record.

It creates no session, tracker key/event, score, snapshot, audience/follower,
revenue, conversion, payment, or commercial record. The two passwords are
accepted only through a root-owned environment file, hashed with Better Auth,
and never included in command output. Keep staging scoring/traffic timers
paused for the entire fixture window; cleanup fails closed if a job or operator
adds any forbidden site data.

Create the root-only command environment and empty evidence file. Obtain two
different 24-128 character URL-safe passwords from the approved secret manager;
do not generate or export them in the interactive shell:

The fixture HTTPS client IP is derived from the first three SHA bytes exactly as
`127.(shaByte0 % 254 + 1).(shaByte1 % 254 + 1).(shaByte2 % 254 + 1)`; it is not
chosen by the operator.

```bash
export STAGING_FIXTURE_ENV="/run/surgeindex-fanward-${RELEASE_ID}-fixture.env"
export STAGING_FIXTURE_MANIFEST="${RELEASE_EVIDENCE_DIR}/fanward-fixture-${RELEASE_SHA}.json"
export STAGING_FIXTURE_STATUS="${RELEASE_EVIDENCE_DIR}/fanward-fixture-status-${RELEASE_SHA}.json"
export STAGING_FIXTURE_CLEANUP="${RELEASE_EVIDENCE_DIR}/fanward-fixture-cleanup-${RELEASE_SHA}.json"
export STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV="/run/surgeindex-fanward-${RELEASE_ID}-fixture-rate-limit-phase.env"
export STAGING_FIXTURE_READBACK_ENV="/run/surgeindex-fanward-${RELEASE_ID}-fixture-readback.env"
export STAGING_FIXTURE_READBACK_EVIDENCE="${RELEASE_EVIDENCE_DIR}/fanward-fixture-readback-${RELEASE_SHA}.json"
printf -v STAGING_FIXTURE_HTTPS_CLIENT_IP '127.%d.%d.%d' \
  "$((16#${RELEASE_SHA:0:2} % 254 + 1))" \
  "$((16#${RELEASE_SHA:2:2} % 254 + 1))" \
  "$((16#${RELEASE_SHA:4:2} % 254 + 1))"
export STAGING_FIXTURE_HTTPS_CLIENT_IP
sudo install -m 0600 -o root -g root /dev/null "$STAGING_FIXTURE_ENV"
sudo install -m 0600 -o root -g root /dev/null "$STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV"
sudo install -m 0600 -o ubuntu -g ubuntu /dev/null "$STAGING_FIXTURE_MANIFEST"
sudo install -m 0600 -o ubuntu -g ubuntu /dev/null "$STAGING_FIXTURE_STATUS"
sudo install -m 0600 -o ubuntu -g ubuntu /dev/null "$STAGING_FIXTURE_CLEANUP"
sudo install -m 0600 -o ubuntu -g ubuntu /dev/null "$STAGING_FIXTURE_READBACK_EVIDENCE"
sudoedit "$STAGING_FIXTURE_ENV"
```

Enter only these fixture-specific values. The staging service environment
supplies the exact application/Auth origins, database URL, provider mode,
Turnstile hostname, feature flag, and migration count:

```text
FANWARD_FIXTURE_CONFIRM=staging.surgeindex.lol
FANWARD_FIXTURE_RUN_ID=<8-24 lowercase letters, digits, or internal hyphens>
FANWARD_FIXTURE_RELEASE_SHA=<RELEASE_SHA>
FANWARD_FIXTURE_HTTPS_CLIENT_IP=<exact derived STAGING_FIXTURE_HTTPS_CLIENT_IP>
FANWARD_FIXTURE_CATEGORY_SLUG=other
FANWARD_FIXTURE_OWNER_PASSWORD=<root-only URL-safe password>
FANWARD_FIXTURE_ADMIN_PASSWORD=<different root-only URL-safe password>
```

Create once from the exact staging artifact. An idempotent `create` retry is
allowed only during preflight, while none of the ten exact release-scoped
rate-limit keys exists and every release marker, credential hash, principal,
membership, and site field still matches. After the first fixture HTTPS request,
never rerun `create`; it intentionally refuses authentication residue:

```bash
sudo systemd-run --quiet --wait --collect --pipe \
  --unit="surgeindex-fanward-fixture-create-${RELEASE_ID}" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
  --property="EnvironmentFile=$STAGING_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  --property="EnvironmentFile=$STAGING_FIXTURE_ENV" \
  /usr/bin/corepack pnpm --silent fanward:fixture -- create \
  | sudo -u ubuntu tee "$STAGING_FIXTURE_MANIFEST" >/dev/null
sudo chmod 0600 "$STAGING_FIXTURE_MANIFEST"
sudo jq -e '
  .status == "ready"
  and .mode == "synthetic_staging_fixture"
  and .origin == "https://staging.surgeindex.lol"
  and .releaseSha == $sha
  and .httpsClientIp == $ip
  and (.created | type == "boolean")
  and .secretsEmitted == false
  and .sessionsCreated == 0
  and .metricsCreated == 0
' --arg sha "$RELEASE_SHA" --arg ip "$STAGING_FIXTURE_HTTPS_CLIENT_IP" \
  "$STAGING_FIXTURE_MANIFEST"
```

Copy only the exact non-secret IDs into the same root-owned environment file;
cleanup will not accept a lookup by email, prefix, wildcard, or a different
release marker:

```bash
sudo jq -r '
  "FANWARD_FIXTURE_SITE_ID=\(.ids.siteId)",
  "FANWARD_FIXTURE_SITE_OWNER_ID=\(.ids.siteOwnerId)",
  "FANWARD_FIXTURE_CATEGORY_ID=\(.ids.categoryId)",
  "FANWARD_FIXTURE_OWNER_USER_ID=\(.ids.ownerUserId)",
  "FANWARD_FIXTURE_ADMIN_USER_ID=\(.ids.adminUserId)",
  "FANWARD_FIXTURE_OWNER_ACCOUNT_ID=\(.ids.ownerAccountId)",
  "FANWARD_FIXTURE_ADMIN_ACCOUNT_ID=\(.ids.adminAccountId)"
' "$STAGING_FIXTURE_MANIFEST" | sudo tee -a "$STAGING_FIXTURE_ENV" >/dev/null
sudo chmod 0600 "$STAGING_FIXTURE_ENV"
sudo grep -Fqx "FANWARD_FIXTURE_HTTPS_CLIENT_IP=$STAGING_FIXTURE_HTTPS_CLIENT_IP" "$STAGING_FIXTURE_ENV"
```

Keep the limiter phase in its own exact-path root environment so a status check
cannot silently inherit a stale phase. This file contains no secret but remains
`root:root 0600` to prevent an untrusted phase change:

```bash
set_fixture_rate_limit_phase() {
  local phase=$1
  case "$phase" in preflight|active|complete|recovery) ;; *) return 1 ;; esac
  printf 'FANWARD_FIXTURE_RATE_LIMIT_PHASE=%s\n' "$phase" \
    | sudo tee "$STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV" >/dev/null
  sudo chmod 0600 "$STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV"
  test "$(sudo stat -c '%U:%G %a' "$STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV")" = 'root:root 600'
}

set_fixture_rate_limit_phase preflight
sudo systemd-run --quiet --wait --collect --pipe \
  --unit="surgeindex-fanward-fixture-preflight-status-${RELEASE_ID}" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
  --property="EnvironmentFile=$STAGING_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  --property="EnvironmentFile=$STAGING_FIXTURE_ENV" \
  --property="EnvironmentFile=$STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV" \
  /usr/bin/corepack pnpm --silent fanward:fixture -- status \
  | sudo -u ubuntu tee "$STAGING_FIXTURE_STATUS" >/dev/null
sudo jq -e '
  .status == "ready"
  and .drift == []
  and .httpsClientIp == $ip
  and .rateLimitInventory.phase == "preflight"
  and .rateLimitInventory.expectedKeyCount == 10
  and .rateLimitInventory.presentKeyCount == 0
' --arg ip "$STAGING_FIXTURE_HTTPS_CLIENT_IP" "$STAGING_FIXTURE_STATUS"
```

Create all HTTP-authentication inputs under exact release-scoped paths. The
edge Basic Auth value lives only in the common curl config; the application
passwords live only in their JSON bodies; the resulting Better Auth cookies
live only in their separate jars. Curl configs do not expand shell variables,
so replace every angle-bracket path below with the exact value printed by the
corresponding shell variable, without displaying file contents afterward:

```bash
export STAGING_FIXTURE_EDGE_CURL_CONFIG="/run/surgeindex-fanward-${RELEASE_ID}-fixture-edge.curl"
export STAGING_FIXTURE_OWNER_LOGIN_JSON="/run/surgeindex-fanward-${RELEASE_ID}-fixture-owner-login.json"
export STAGING_FIXTURE_ADMIN_LOGIN_JSON="/run/surgeindex-fanward-${RELEASE_ID}-fixture-admin-login.json"
export STAGING_FIXTURE_OWNER_SIGNIN_CURL_CONFIG="/run/surgeindex-fanward-${RELEASE_ID}-fixture-owner-signin.curl"
export STAGING_FIXTURE_ADMIN_SIGNIN_CURL_CONFIG="/run/surgeindex-fanward-${RELEASE_ID}-fixture-admin-signin.curl"
export STAGING_FIXTURE_SIGNOUT_JSON="/run/surgeindex-fanward-${RELEASE_ID}-fixture-signout.json"
export STAGING_FIXTURE_OWNER_SIGNOUT_CURL_CONFIG="/run/surgeindex-fanward-${RELEASE_ID}-fixture-owner-signout.curl"
export STAGING_FIXTURE_ADMIN_SIGNOUT_CURL_CONFIG="/run/surgeindex-fanward-${RELEASE_ID}-fixture-admin-signout.curl"
export STAGING_FIXTURE_OWNER_COOKIE_JAR="/run/surgeindex-fanward-${RELEASE_ID}-fixture-owner.cookies"
export STAGING_FIXTURE_ADMIN_COOKIE_JAR="/run/surgeindex-fanward-${RELEASE_ID}-fixture-admin.cookies"

for secret_file in \
  "$STAGING_FIXTURE_EDGE_CURL_CONFIG" \
  "$STAGING_FIXTURE_OWNER_LOGIN_JSON" "$STAGING_FIXTURE_ADMIN_LOGIN_JSON" \
  "$STAGING_FIXTURE_OWNER_SIGNIN_CURL_CONFIG" "$STAGING_FIXTURE_ADMIN_SIGNIN_CURL_CONFIG" \
  "$STAGING_FIXTURE_SIGNOUT_JSON" \
  "$STAGING_FIXTURE_OWNER_SIGNOUT_CURL_CONFIG" "$STAGING_FIXTURE_ADMIN_SIGNOUT_CURL_CONFIG" \
  "$STAGING_FIXTURE_OWNER_COOKIE_JAR" "$STAGING_FIXTURE_ADMIN_COOKIE_JAR"; do
  sudo install -m 0600 -o root -g root /dev/null "$secret_file"
done
sudoedit "$STAGING_FIXTURE_EDGE_CURL_CONFIG"
sudoedit "$STAGING_FIXTURE_OWNER_LOGIN_JSON"
sudoedit "$STAGING_FIXTURE_ADMIN_LOGIN_JSON"
sudoedit "$STAGING_FIXTURE_OWNER_SIGNIN_CURL_CONFIG"
sudoedit "$STAGING_FIXTURE_ADMIN_SIGNIN_CURL_CONFIG"
sudoedit "$STAGING_FIXTURE_SIGNOUT_JSON"
sudoedit "$STAGING_FIXTURE_OWNER_SIGNOUT_CURL_CONFIG"
sudoedit "$STAGING_FIXTURE_ADMIN_SIGNOUT_CURL_CONFIG"
```

The common edge config contains only these directives. Quote and escape the
controlled staging Basic Auth value according to `curl --config`; do not place
it in argv or an exported variable:

```text
silent
show-error
fail
proto = "=https"
tlsv1.2
connect-timeout = 10
max-time = 30
resolve = "staging.surgeindex.lol:443:127.0.0.1"
interface = "<exact STAGING_FIXTURE_HTTPS_CLIENT_IP>"
user = "<controlled staging Basic Auth username>:<controlled staging Basic Auth password>"
```

Every fixture HTTPS request below must load this common config first. The URL
hostname remains `staging.surgeindex.lol`, so TLS certificate validation and SNI
remain production-shaped; `resolve` bypasses external DNS/Cloudflare only for
this curl process, while `interface` makes Nginx observe the exact release-scoped
loopback source IP. Never replace the URL with `https://127.0.0.1` or disable TLS
verification.

The owner and admin login JSON files contain the exact email from
`loginPrincipals`, the corresponding password already stored in the fixture
environment, and a non-persistent session request. Do not reuse or print either
password:

```json
{"email":"<exact ownerEmail>","password":"<exact owner fixture password>","callbackURL":"/dashboard/fanward","rememberMe":false}
```

```json
{"email":"<exact adminEmail>","password":"<exact admin fixture password>","callbackURL":"/admin/fanward","rememberMe":false}
```

The owner sign-in curl config is:

```text
url = "https://staging.surgeindex.lol/api/auth/sign-in/email"
resolve = "staging.surgeindex.lol:443:127.0.0.1"
interface = "<exact STAGING_FIXTURE_HTTPS_CLIENT_IP>"
request = "POST"
header = "accept: application/json"
header = "content-type: application/json"
header = "origin: https://staging.surgeindex.lol"
data-binary = "@<exact STAGING_FIXTURE_OWNER_LOGIN_JSON path>"
cookie-jar = "<exact STAGING_FIXTURE_OWNER_COOKIE_JAR path>"
output = "/dev/null"
write-out = "%{http_code}\n"
```

The admin sign-in config is identical except that `data-binary` and
`cookie-jar` use the exact admin paths. The sign-out body contains exactly:

```json
{}
```

The owner sign-out curl config is:

```text
url = "https://staging.surgeindex.lol/api/auth/sign-out"
resolve = "staging.surgeindex.lol:443:127.0.0.1"
interface = "<exact STAGING_FIXTURE_HTTPS_CLIENT_IP>"
request = "POST"
header = "accept: application/json"
header = "content-type: application/json"
header = "origin: https://staging.surgeindex.lol"
data-binary = "@<exact STAGING_FIXTURE_SIGNOUT_JSON path>"
cookie = "<exact STAGING_FIXTURE_OWNER_COOKIE_JAR path>"
cookie-jar = "<exact STAGING_FIXTURE_OWNER_COOKIE_JAR path>"
output = "/dev/null"
write-out = "%{http_code}\n"
```

The admin sign-out config is identical except that `cookie` and `cookie-jar`
use the exact admin jar. Validate ownership, JSON identity, callback boundaries,
and session persistence without printing a password, Basic Auth value, response
body, or cookie:

```bash
for secret_file in \
  "$STAGING_FIXTURE_EDGE_CURL_CONFIG" \
  "$STAGING_FIXTURE_OWNER_LOGIN_JSON" "$STAGING_FIXTURE_ADMIN_LOGIN_JSON" \
  "$STAGING_FIXTURE_OWNER_SIGNIN_CURL_CONFIG" "$STAGING_FIXTURE_ADMIN_SIGNIN_CURL_CONFIG" \
  "$STAGING_FIXTURE_SIGNOUT_JSON" \
  "$STAGING_FIXTURE_OWNER_SIGNOUT_CURL_CONFIG" "$STAGING_FIXTURE_ADMIN_SIGNOUT_CURL_CONFIG" \
  "$STAGING_FIXTURE_OWNER_COOKIE_JAR" "$STAGING_FIXTURE_ADMIN_COOKIE_JAR"; do
  test "$(sudo stat -c '%U:%G %a' "$secret_file")" = 'root:root 600'
done
for curl_config in \
  "$STAGING_FIXTURE_EDGE_CURL_CONFIG" \
  "$STAGING_FIXTURE_OWNER_SIGNIN_CURL_CONFIG" "$STAGING_FIXTURE_ADMIN_SIGNIN_CURL_CONFIG" \
  "$STAGING_FIXTURE_OWNER_SIGNOUT_CURL_CONFIG" "$STAGING_FIXTURE_ADMIN_SIGNOUT_CURL_CONFIG"; do
  sudo grep -Fqx 'resolve = "staging.surgeindex.lol:443:127.0.0.1"' "$curl_config"
  sudo grep -Fqx "interface = \"$STAGING_FIXTURE_HTTPS_CLIENT_IP\"" "$curl_config"
done
sudo jq -e --slurpfile manifest "$STAGING_FIXTURE_MANIFEST" \
  '.email == $manifest[0].loginPrincipals.ownerEmail and (.password | type == "string" and length >= 24 and length <= 128) and .callbackURL == "/dashboard/fanward" and .rememberMe == false' \
  "$STAGING_FIXTURE_OWNER_LOGIN_JSON" >/dev/null
sudo jq -e --slurpfile manifest "$STAGING_FIXTURE_MANIFEST" \
  '.email == $manifest[0].loginPrincipals.adminEmail and (.password | type == "string" and length >= 24 and length <= 128) and .callbackURL == "/admin/fanward" and .rememberMe == false' \
  "$STAGING_FIXTURE_ADMIN_LOGIN_JSON" >/dev/null
sudo jq -e 'type == "object" and length == 0' "$STAGING_FIXTURE_SIGNOUT_JSON" >/dev/null

sudo curl --config "$STAGING_FIXTURE_EDGE_CURL_CONFIG" \
  --config "$STAGING_FIXTURE_OWNER_SIGNIN_CURL_CONFIG" | grep -qx '200'
sudo curl --config "$STAGING_FIXTURE_EDGE_CURL_CONFIG" \
  --config "$STAGING_FIXTURE_ADMIN_SIGNIN_CURL_CONFIG" | grep -qx '200'
sudo test -s "$STAGING_FIXTURE_OWNER_COOKIE_JAR"
sudo test -s "$STAGING_FIXTURE_ADMIN_COOKIE_JAR"
```

Before the active status, deliberately touch every one of the first seven
Fanward limiter scopes through the same resolved HTTPS path. Together with the
two successful sign-ins above, these requests create exactly the first nine
release-scoped keys. The three mutation probes use an empty strict payload and
must return exactly `422`; they create a limiter row before validation but do
not mutate a Fanward profile:

```bash
sudo curl --config "$STAGING_FIXTURE_EDGE_CURL_CONFIG" \
  --cookie "$STAGING_FIXTURE_OWNER_COOKIE_JAR" \
  --url 'https://staging.surgeindex.lol/api/fanward/me' \
  --output /dev/null --write-out '%{http_code}\n' | grep -qx '200'
sudo curl --config "$STAGING_FIXTURE_EDGE_CURL_CONFIG" --no-fail \
  --cookie "$STAGING_FIXTURE_OWNER_COOKIE_JAR" --request PATCH \
  --header 'content-type: application/json' --header 'origin: https://staging.surgeindex.lol' \
  --data-binary "@$STAGING_FIXTURE_SIGNOUT_JSON" \
  --url 'https://staging.surgeindex.lol/api/fanward/me' \
  --output /dev/null --write-out '%{http_code}\n' | grep -qx '422'
sudo curl --config "$STAGING_FIXTURE_EDGE_CURL_CONFIG" --no-fail \
  --cookie "$STAGING_FIXTURE_OWNER_COOKIE_JAR" --request POST \
  --header 'content-type: application/json' --header 'origin: https://staging.surgeindex.lol' \
  --data-binary "@$STAGING_FIXTURE_SIGNOUT_JSON" \
  --url 'https://staging.surgeindex.lol/api/fanward/me/submit' \
  --output /dev/null --write-out '%{http_code}\n' | grep -qx '422'
sudo curl --config "$STAGING_FIXTURE_EDGE_CURL_CONFIG" \
  --cookie "$STAGING_FIXTURE_ADMIN_COOKIE_JAR" \
  --url 'https://staging.surgeindex.lol/api/admin/fanward?limit=1&offset=0' \
  --output /dev/null --write-out '%{http_code}\n' | grep -qx '200'
sudo curl --config "$STAGING_FIXTURE_EDGE_CURL_CONFIG" --no-fail \
  --cookie "$STAGING_FIXTURE_ADMIN_COOKIE_JAR" --request POST \
  --header 'content-type: application/json' --header 'origin: https://staging.surgeindex.lol' \
  --data-binary "@$STAGING_FIXTURE_SIGNOUT_JSON" \
  --url 'https://staging.surgeindex.lol/api/admin/fanward/00000000-0000-4000-8000-000000000000/review' \
  --output /dev/null --write-out '%{http_code}\n' | grep -qx '422'
sudo curl --config "$STAGING_FIXTURE_EDGE_CURL_CONFIG" \
  --url 'https://staging.surgeindex.lol/api/fanward/creators?limit=1' \
  --output /dev/null --write-out '%{http_code}\n' | grep -qx '200'
sudo curl --config "$STAGING_FIXTURE_EDGE_CURL_CONFIG" --no-fail \
  --url 'https://staging.surgeindex.lol/api/fanward/creators/fixture-rate-limit-probe' \
  --output /dev/null --write-out '%{http_code}\n' | grep -qx '404'
```

Do not insert a session or sign a cookie directly. Exercise draft, reject,
revise, approve, suspend, restore, public detail, and the active-creator
`fanward:readback`; record distinct request IDs. This path uses pre-verified
synthetic principals, so email verification remains outside its evidence
boundary. A sign-in retry is not allowed while either fixture user has a live
session; run the sign-out or abort-recovery procedure first.

After the controlled flow has an active public creator, set the phase to
`active`. Status must show exactly one owner session, one admin session, and all
first nine limiter keys—no unknown-email key yet. Profile, revision, and audit
counts may be non-zero; `drift` and all forbidden counts remain empty/zero:

```bash
set_fixture_rate_limit_phase active
sudo systemd-run --quiet --wait --collect --pipe \
  --unit="surgeindex-fanward-fixture-status-${RELEASE_ID}" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
  --property="EnvironmentFile=$STAGING_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  --property="EnvironmentFile=$STAGING_FIXTURE_ENV" \
  --property="EnvironmentFile=$STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV" \
  /usr/bin/corepack pnpm --silent fanward:fixture -- status \
  | sudo -u ubuntu tee "$STAGING_FIXTURE_STATUS" >/dev/null
sudo jq -e '
  .status == "ready"
  and .drift == []
  and .httpsClientIp == $ip
  and .sessions.owner == 1
  and .sessions.admin == 1
  and .rateLimitInventory.phase == "active"
  and .rateLimitInventory.expectedKeyCount == 10
  and .rateLimitInventory.presentKeyCount == 9
  and ([.forbiddenCounts[]] | all(. == 0))
' --arg ip "$STAGING_FIXTURE_HTTPS_CLIENT_IP" "$STAGING_FIXTURE_STATUS"
```

Run the dedicated active-creator read-back directly against the staging app
listener. This is a fixture-only mode: HTTP is allowed only on
`127.0.0.1:3212`, while `PUBLIC_ORIGIN` and `Host` remain the staging hostname.
It supplies the same derived trusted client IP and deliberately supplies no
staging Basic Auth because the request never traverses the edge:

```bash
sudo install -m 0600 -o root -g root /dev/null "$STAGING_FIXTURE_READBACK_ENV"
sudoedit "$STAGING_FIXTURE_READBACK_ENV"
```

Enter exactly these non-cookie values, resolving every placeholder from the
current release variables:

```text
FANWARD_READBACK_MODE=staging
FANWARD_READBACK_DEPLOYMENT=staging
FANWARD_READBACK_EXPECTED_SHA=<RELEASE_SHA>
FANWARD_READBACK_TOOL_SHA=<RELEASE_SHA>
FANWARD_READBACK_RELEASE_DIR=<STAGING_RELEASE>
FANWARD_READBACK_EVIDENCE_FILE=<STAGING_FIXTURE_READBACK_EVIDENCE>
FANWARD_READBACK_BASE_URL=http://127.0.0.1:3212
FANWARD_READBACK_PUBLIC_ORIGIN=https://staging.surgeindex.lol
FANWARD_READBACK_HOST=staging.surgeindex.lol
FANWARD_READBACK_ALLOW_HTTP_LOCAL=YES
FANWARD_READBACK_TRUSTED_CLIENT_IP=<STAGING_FIXTURE_HTTPS_CLIENT_IP>
FANWARD_READBACK_TIMEOUT_MS=8000
```

Derive exactly one admin session Cookie header from the root cookie jar. The
parser accepts only the secure staging-domain Better Auth session cookie and a
systemd-safe cookie alphabet. Its output goes directly into the root
EnvironmentFile and is never displayed or placed in argv:

```bash
test "$(sudo stat -c '%U:%G %a' "$STAGING_FIXTURE_READBACK_ENV")" = 'root:root 600'
if sudo grep -q '^FANWARD_READBACK_\(ADMIN_COOKIE\|BASIC_AUTH\)=' "$STAGING_FIXTURE_READBACK_ENV"; then
  printf 'Refusing a pre-existing readback cookie or Basic Auth value.\n' >&2
  exit 1
fi
sudo grep -Fqx "FANWARD_READBACK_TRUSTED_CLIENT_IP=$STAGING_FIXTURE_HTTPS_CLIENT_IP" "$STAGING_FIXTURE_READBACK_ENV"
sudo awk -F '\t' '
  BEGIN { count = 0 }
  {
    domain = $1
    if ($0 ~ /^#HttpOnly_/) sub(/^#HttpOnly_/, "", domain)
    else if ($0 ~ /^#/) next
    if (NF < 7) next
    if ((domain == "staging.surgeindex.lol" || domain == ".staging.surgeindex.lol") &&
        $3 == "/" && toupper($4) == "TRUE" &&
        ($6 == "better-auth.session_token" || $6 == "__Secure-better-auth.session_token")) {
      if ($6 !~ /^[A-Za-z0-9_.-]+$/ || $7 !~ /^[A-Za-z0-9._~+\/:=%-]+$/) exit 2
      cookie = $6 "=" $7
      count++
    }
  }
  END {
    if (count != 1) exit 3
    printf "FANWARD_READBACK_ADMIN_COOKIE=%s\n", cookie
  }
' "$STAGING_FIXTURE_ADMIN_COOKIE_JAR" \
  | sudo tee -a "$STAGING_FIXTURE_READBACK_ENV" >/dev/null
sudo chmod 0600 "$STAGING_FIXTURE_READBACK_ENV"
test "$(sudo grep -c '^FANWARD_READBACK_ADMIN_COOKIE=' "$STAGING_FIXTURE_READBACK_ENV")" = 1

sudo systemd-run --wait --collect --pipe \
  --unit="surgeindex-fanward-fixture-readback-${RELEASE_ID}" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
  --property="EnvironmentFile=$STAGING_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  --property="EnvironmentFile=$STAGING_FIXTURE_READBACK_ENV" \
  /usr/bin/corepack pnpm fanward:readback
sudo test "$(sudo stat -c '%a' "$STAGING_FIXTURE_READBACK_EVIDENCE")" = 600
sudo jq -e --arg ip "$STAGING_FIXTURE_HTTPS_CLIENT_IP" '
  .result == "PASS"
  and .mode == "staging"
  and .deployment == "staging"
  and .target.baseOrigin == "http://127.0.0.1:3212"
  and .target.publicOrigin == "https://staging.surgeindex.lol"
  and .target.hostOverrideProvided == true
  and .target.trustedClientIpOverrideProvided == true
  and .target.trustedClientIpOverride == $ip
  and .execution.adminSessionProvided == true
  and .execution.basicAuthProvided == false
  and .summary.failed == 0
  and .summary.notRun == 0
' "$STAGING_FIXTURE_READBACK_EVIDENCE"
sudo rm -f -- "$STAGING_FIXTURE_READBACK_ENV"
```

After evidence capture, suspend the creator and prove its public detail is
`404`. Sign out the owner and admin through real HTTPS while both cookie jars
still exist. The common config supplies staging Basic Auth; the per-user config
supplies only that user's Better Auth cookie. A non-200 response ends the
fail-closed shell and activates abort recovery:

```bash
sudo curl --config "$STAGING_FIXTURE_EDGE_CURL_CONFIG" \
  --config "$STAGING_FIXTURE_OWNER_SIGNOUT_CURL_CONFIG" | grep -qx '200'
sudo curl --config "$STAGING_FIXTURE_EDGE_CURL_CONFIG" \
  --config "$STAGING_FIXTURE_ADMIN_SIGNOUT_CURL_CONFIG" | grep -qx '200'
set_fixture_rate_limit_phase complete
```

The guarded auth POST path classifies each `{}` sign-out body under the shared
`auth-signin:<httpsClientIp>:unknown` limiter scope before Better Auth handles
sign-out. Therefore the real sign-outs create the tenth key; no synthetic failed
login is required.

Run `status` again and require both session counts to be zero before cleanup.
Cleanup deletes only the exact site, principals, accounts, owner row, Fanward
profile, and revisions for this release marker. It intentionally retains
`moderation_action` and `admin_audit_log` rows as staging evidence; their actor
foreign key becomes null when the synthetic admin is removed, while target ID,
request ID, action, reason, and state transition remain. Unrelated audit rows
are never selected or deleted.

```bash
sudo systemd-run --quiet --wait --collect --pipe \
  --unit="surgeindex-fanward-fixture-final-status-${RELEASE_ID}" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
  --property="EnvironmentFile=$STAGING_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  --property="EnvironmentFile=$STAGING_FIXTURE_ENV" \
  --property="EnvironmentFile=$STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV" \
  /usr/bin/corepack pnpm --silent fanward:fixture -- status \
  | sudo -u ubuntu tee "$STAGING_FIXTURE_STATUS" >/dev/null
sudo jq -e --arg ip "$STAGING_FIXTURE_HTTPS_CLIENT_IP" '
  .status == "ready"
  and .drift == []
  and .httpsClientIp == $ip
  and .sessions.owner == 0
  and .sessions.admin == 0
  and .rateLimitInventory.phase == "complete"
  and .rateLimitInventory.expectedKeyCount == 10
  and .rateLimitInventory.presentKeyCount == 10
  and ([.forbiddenCounts[]] | all(. == 0))
' "$STAGING_FIXTURE_STATUS"

# Status and cleanup re-verify both credential hashes. Retain the root-only
# STAGING_FIXTURE_ENV until cleanup PASS; delete only the HTTP inputs now.
sudo rm -f -- \
  "$STAGING_FIXTURE_EDGE_CURL_CONFIG" \
  "$STAGING_FIXTURE_OWNER_LOGIN_JSON" "$STAGING_FIXTURE_ADMIN_LOGIN_JSON" \
  "$STAGING_FIXTURE_OWNER_SIGNIN_CURL_CONFIG" "$STAGING_FIXTURE_ADMIN_SIGNIN_CURL_CONFIG" \
  "$STAGING_FIXTURE_SIGNOUT_JSON" \
  "$STAGING_FIXTURE_OWNER_SIGNOUT_CURL_CONFIG" "$STAGING_FIXTURE_ADMIN_SIGNOUT_CURL_CONFIG" \
  "$STAGING_FIXTURE_OWNER_COOKIE_JAR" "$STAGING_FIXTURE_ADMIN_COOKIE_JAR" \
  "$STAGING_FIXTURE_READBACK_ENV"

sudo systemd-run --quiet --wait --collect --pipe \
  --unit="surgeindex-fanward-fixture-cleanup-${RELEASE_ID}" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
  --property="EnvironmentFile=$STAGING_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  --property="EnvironmentFile=$STAGING_FIXTURE_ENV" \
  /usr/bin/corepack pnpm --silent fanward:fixture -- cleanup \
  | sudo -u ubuntu tee "$STAGING_FIXTURE_CLEANUP" >/dev/null
sudo jq -e '
  .status == "deleted"
  and .deleted == true
  and .usersDeleted == 2
  and .sessionsDeleted == 0
  and .rateLimitRowsDeleted == 10
' "$STAGING_FIXTURE_CLEANUP"
sudo rm -f -- "$STAGING_FIXTURE_ENV" "$STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV"
```

Do not resume staging timers until cleanup is `deleted`, the synthetic public
profile is absent, and the retained audit counts match the pre-cleanup status.

#### Mandatory fixture abort recovery

If the shell, network, curl, application flow, or operator exits after either
sign-in, the global trap destroys the cookie jars and credentials but cannot
invalidate their server-side sessions. Staging traffic and scoring timers must
remain paused. Start a new fail-closed root shell, revalidate the same exact
`RELEASE_SHA`, `RELEASE_ID`, `STAGING_RELEASE`, staging environment paths, and
migration count 15, then reconstruct `STAGING_FIXTURE_ENV` from the release
ticket, approved secret manager, and exact manifest IDs. Do not create a new run
ID, user, site, cookie, or direct SQL cleanup.

Run the Section 2 SSH and trap preamble again in full, through all four trap
installations, before rehydrating these exact values from the release ticket.
Do not derive a new `RELEASE_ID` from the current time:

```bash
export RELEASE_SHA='<same approved 40-character SHA>'
export RELEASE_ID='<same original surgeindex-fanward-YYYYMMDD.HHMM-12hex release ID>'
export STAGING_RELEASE="/opt/surgeindex/releases/${RELEASE_ID}-staging"
export STAGING_ENV='<same staging main EnvironmentFile path>'
export STAGING_TURNSTILE_ENV='/etc/surgeindex/turnstile.staging.env'
export EMAIL_ENV='/etc/surgeindex/resend.env'
export RELEASE_EVIDENCE_DIR='/var/lib/surgeindex/release-evidence'
export STAGING_FIXTURE_MANIFEST="${RELEASE_EVIDENCE_DIR}/fanward-fixture-${RELEASE_SHA}.json"
export STAGING_FIXTURE_STATUS="${RELEASE_EVIDENCE_DIR}/fanward-fixture-status-${RELEASE_SHA}.json"
export STAGING_FIXTURE_CLEANUP="${RELEASE_EVIDENCE_DIR}/fanward-fixture-cleanup-${RELEASE_SHA}.json"
export STAGING_FIXTURE_ENV="/run/surgeindex-fanward-${RELEASE_ID}-fixture.env"
export STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV="/run/surgeindex-fanward-${RELEASE_ID}-fixture-rate-limit-phase.env"
export STAGING_FIXTURE_READBACK_ENV="/run/surgeindex-fanward-${RELEASE_ID}-fixture-readback.env"
export STAGING_FIXTURE_RUN_ID='<same exact FANWARD_FIXTURE_RUN_ID from release ticket>'
export STAGING_FIXTURE_EDGE_CURL_CONFIG="/run/surgeindex-fanward-${RELEASE_ID}-fixture-edge.curl"
export STAGING_FIXTURE_OWNER_LOGIN_JSON="/run/surgeindex-fanward-${RELEASE_ID}-fixture-owner-login.json"
export STAGING_FIXTURE_ADMIN_LOGIN_JSON="/run/surgeindex-fanward-${RELEASE_ID}-fixture-admin-login.json"
export STAGING_FIXTURE_OWNER_SIGNIN_CURL_CONFIG="/run/surgeindex-fanward-${RELEASE_ID}-fixture-owner-signin.curl"
export STAGING_FIXTURE_ADMIN_SIGNIN_CURL_CONFIG="/run/surgeindex-fanward-${RELEASE_ID}-fixture-admin-signin.curl"
export STAGING_FIXTURE_SIGNOUT_JSON="/run/surgeindex-fanward-${RELEASE_ID}-fixture-signout.json"
export STAGING_FIXTURE_OWNER_SIGNOUT_CURL_CONFIG="/run/surgeindex-fanward-${RELEASE_ID}-fixture-owner-signout.curl"
export STAGING_FIXTURE_ADMIN_SIGNOUT_CURL_CONFIG="/run/surgeindex-fanward-${RELEASE_ID}-fixture-admin-signout.curl"
export STAGING_FIXTURE_OWNER_COOKIE_JAR="/run/surgeindex-fanward-${RELEASE_ID}-fixture-owner.cookies"
export STAGING_FIXTURE_ADMIN_COOKIE_JAR="/run/surgeindex-fanward-${RELEASE_ID}-fixture-admin.cookies"

test "${#RELEASE_SHA}" -eq 40
case "$RELEASE_SHA" in *[!0-9a-f]*) exit 1 ;; esac
printf -v STAGING_FIXTURE_HTTPS_CLIENT_IP '127.%d.%d.%d' \
  "$((16#${RELEASE_SHA:0:2} % 254 + 1))" \
  "$((16#${RELEASE_SHA:2:2} % 254 + 1))" \
  "$((16#${RELEASE_SHA:4:2} % 254 + 1))"
export STAGING_FIXTURE_HTTPS_CLIENT_IP
[[ "$RELEASE_ID" =~ ^surgeindex-fanward-[0-9]{8}\.[0-9]{4}-${RELEASE_SHA:0:12}$ ]]
[[ "$STAGING_FIXTURE_RUN_ID" =~ ^[a-z0-9][a-z0-9-]{6,22}[a-z0-9]$ ]]
test "$(readlink -f /opt/surgeindex/staging-current)" = "$STAGING_RELEASE"
test "$(git -C "$STAGING_RELEASE" rev-parse HEAD)" = "$RELEASE_SHA"
test -z "$(git -C "$STAGING_RELEASE" status --porcelain=v1)"
test "$(sed -n 's/^BUILD_SHA=//p' "$STAGING_RELEASE/release.env")" = "$RELEASE_SHA"
test "$(sudo systemctl show surgeindex-staging-traffic-aggregation.timer -p ActiveState --value)" = inactive
test "$(sudo systemctl show surgeindex-staging-scoring.timer -p ActiveState --value)" = inactive
for env_file in "$STAGING_ENV" "$STAGING_TURNSTILE_ENV" "$EMAIL_ENV"; do
  test "$(sudo stat -c '%U:%G %a' "$env_file")" = 'root:root 600'
done
curl -fsS http://127.0.0.1:3212/api/health/ready \
  | jq -e '.data.ready == true and .data.checks.database == true and .data.checks.migrations == true and .data.expectedMigrationCount == 15'
test "$(sudo stat -c '%U:%G %a' "$STAGING_FIXTURE_MANIFEST")" = 'ubuntu:ubuntu 600'

# A killed shell may have bypassed the earlier EXIT trap. Every variable is
# defined above and every equality is exact; never replace this with a glob.
test "$STAGING_FIXTURE_EDGE_CURL_CONFIG" = "/run/surgeindex-fanward-${RELEASE_ID}-fixture-edge.curl"
test "$STAGING_FIXTURE_OWNER_LOGIN_JSON" = "/run/surgeindex-fanward-${RELEASE_ID}-fixture-owner-login.json"
test "$STAGING_FIXTURE_ADMIN_LOGIN_JSON" = "/run/surgeindex-fanward-${RELEASE_ID}-fixture-admin-login.json"
test "$STAGING_FIXTURE_OWNER_SIGNIN_CURL_CONFIG" = "/run/surgeindex-fanward-${RELEASE_ID}-fixture-owner-signin.curl"
test "$STAGING_FIXTURE_ADMIN_SIGNIN_CURL_CONFIG" = "/run/surgeindex-fanward-${RELEASE_ID}-fixture-admin-signin.curl"
test "$STAGING_FIXTURE_SIGNOUT_JSON" = "/run/surgeindex-fanward-${RELEASE_ID}-fixture-signout.json"
test "$STAGING_FIXTURE_OWNER_SIGNOUT_CURL_CONFIG" = "/run/surgeindex-fanward-${RELEASE_ID}-fixture-owner-signout.curl"
test "$STAGING_FIXTURE_ADMIN_SIGNOUT_CURL_CONFIG" = "/run/surgeindex-fanward-${RELEASE_ID}-fixture-admin-signout.curl"
test "$STAGING_FIXTURE_OWNER_COOKIE_JAR" = "/run/surgeindex-fanward-${RELEASE_ID}-fixture-owner.cookies"
test "$STAGING_FIXTURE_ADMIN_COOKIE_JAR" = "/run/surgeindex-fanward-${RELEASE_ID}-fixture-admin.cookies"
test "$STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV" = "/run/surgeindex-fanward-${RELEASE_ID}-fixture-rate-limit-phase.env"
test "$STAGING_FIXTURE_READBACK_ENV" = "/run/surgeindex-fanward-${RELEASE_ID}-fixture-readback.env"
sudo rm -f -- \
  "$STAGING_FIXTURE_EDGE_CURL_CONFIG" \
  "$STAGING_FIXTURE_OWNER_LOGIN_JSON" "$STAGING_FIXTURE_ADMIN_LOGIN_JSON" \
  "$STAGING_FIXTURE_OWNER_SIGNIN_CURL_CONFIG" "$STAGING_FIXTURE_ADMIN_SIGNIN_CURL_CONFIG" \
  "$STAGING_FIXTURE_SIGNOUT_JSON" \
  "$STAGING_FIXTURE_OWNER_SIGNOUT_CURL_CONFIG" "$STAGING_FIXTURE_ADMIN_SIGNOUT_CURL_CONFIG" \
  "$STAGING_FIXTURE_OWNER_COOKIE_JAR" "$STAGING_FIXTURE_ADMIN_COOKIE_JAR" \
  "$STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV" "$STAGING_FIXTURE_READBACK_ENV"

sudo install -m 0600 -o root -g root /dev/null "$STAGING_FIXTURE_ENV"
sudo install -m 0600 -o root -g root /dev/null "$STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV"
sudoedit "$STAGING_FIXTURE_ENV"
```

Enter the same `FANWARD_FIXTURE_CONFIRM`, `FANWARD_FIXTURE_RUN_ID`,
`FANWARD_FIXTURE_RELEASE_SHA`, derived `FANWARD_FIXTURE_HTTPS_CLIENT_IP`, category
slug, and two fixture passwords recorded for the original run. Require the run
ID, SHA, and derived IP to equal the retained manifest, then append its exact
non-secret IDs without displaying the passwords:

```bash
sudo jq -e \
  --arg sha "$RELEASE_SHA" \
  --arg runId "$STAGING_FIXTURE_RUN_ID" \
  --arg ip "$STAGING_FIXTURE_HTTPS_CLIENT_IP" '
  .releaseSha == $sha
  and .runId == $runId
  and .httpsClientIp == $ip
' \
  "$STAGING_FIXTURE_MANIFEST" >/dev/null
sudo grep -Fqx "FANWARD_FIXTURE_CONFIRM=staging.surgeindex.lol" "$STAGING_FIXTURE_ENV"
sudo grep -Fqx "FANWARD_FIXTURE_RUN_ID=$STAGING_FIXTURE_RUN_ID" "$STAGING_FIXTURE_ENV"
sudo grep -Fqx "FANWARD_FIXTURE_RELEASE_SHA=$RELEASE_SHA" "$STAGING_FIXTURE_ENV"
sudo grep -Fqx "FANWARD_FIXTURE_HTTPS_CLIENT_IP=$STAGING_FIXTURE_HTTPS_CLIENT_IP" "$STAGING_FIXTURE_ENV"
sudo jq -r '
  "FANWARD_FIXTURE_SITE_ID=\(.ids.siteId)",
  "FANWARD_FIXTURE_SITE_OWNER_ID=\(.ids.siteOwnerId)",
  "FANWARD_FIXTURE_CATEGORY_ID=\(.ids.categoryId)",
  "FANWARD_FIXTURE_OWNER_USER_ID=\(.ids.ownerUserId)",
  "FANWARD_FIXTURE_ADMIN_USER_ID=\(.ids.adminUserId)",
  "FANWARD_FIXTURE_OWNER_ACCOUNT_ID=\(.ids.ownerAccountId)",
  "FANWARD_FIXTURE_ADMIN_ACCOUNT_ID=\(.ids.adminAccountId)"
' "$STAGING_FIXTURE_MANIFEST" | sudo tee -a "$STAGING_FIXTURE_ENV" >/dev/null
sudo chmod 0600 "$STAGING_FIXTURE_ENV"
```

The exact release artifact must support the bounded `revoke-sessions` fixture
action before this synthetic path is release-acceptable. Before the action, it
must reject unless `FANWARD_FIXTURE_SESSION_REVOKE_CONFIRM` equals the exact
release-scoped fixture marker. Validate that marker from the retained manifest,
then append it to the newly reconstructed root-only fixture environment without
printing the marker or any password. Refuse a duplicate confirmation entry:

```bash
test "$(sudo stat -c '%U:%G %a' "$STAGING_FIXTURE_ENV")" = 'root:root 600'
test "$(sudo stat -c '%U:%G %a' "$STAGING_FIXTURE_MANIFEST")" = 'ubuntu:ubuntu 600'
sudo jq -e --arg sha "$RELEASE_SHA" --arg ip "$STAGING_FIXTURE_HTTPS_CLIENT_IP" '
  .status == "ready"
  and .mode == "synthetic_staging_fixture"
  and .origin == "https://staging.surgeindex.lol"
  and .releaseSha == $sha
  and .httpsClientIp == $ip
  and (.runId | type == "string" and test("^[a-z0-9](?:[a-z0-9-]{6,22}[a-z0-9])$"))
  and .marker == ("fanward-staging-fixture:" + .runId + ":" + $sha)
  and .secretsEmitted == false
  and .sessionsCreated == 0
  and .metricsCreated == 0
' "$STAGING_FIXTURE_MANIFEST" >/dev/null
if sudo grep -q '^FANWARD_FIXTURE_SESSION_REVOKE_CONFIRM=' "$STAGING_FIXTURE_ENV"; then
  printf 'Refusing duplicate fixture session-revocation confirmation.\n' >&2
  exit 1
fi
sudo jq -r '"FANWARD_FIXTURE_SESSION_REVOKE_CONFIRM=" + .marker' \
  "$STAGING_FIXTURE_MANIFEST" | sudo tee -a "$STAGING_FIXTURE_ENV" >/dev/null
sudo chmod 0600 "$STAGING_FIXTURE_ENV"
test "$(sudo grep -c '^FANWARD_FIXTURE_SESSION_REVOKE_CONFIRM=' "$STAGING_FIXTURE_ENV")" = 1
```

The action validates that confirmation against the marker derived independently
from `FANWARD_FIXTURE_RUN_ID` and `FANWARD_FIXTURE_RELEASE_SHA` before acquiring
its mutation lock. It then locks the same exact fixture and deletes sessions
only for the manifest's owner/admin user IDs. Capture its non-secret result and
verify its complete identity against the retained manifest before running the
independent read-only status command:

```bash
export STAGING_FIXTURE_SESSION_REVOCATION="${RELEASE_EVIDENCE_DIR}/fanward-fixture-session-revocation-${RELEASE_SHA}.json"
sudo install -m 0600 -o ubuntu -g ubuntu /dev/null "$STAGING_FIXTURE_SESSION_REVOCATION"
sudo systemctl stop surgeindex-staging-traffic-aggregation.timer surgeindex-staging-scoring.timer

sudo systemd-run --quiet --wait --collect --pipe \
  --unit="surgeindex-fanward-fixture-revoke-sessions-${RELEASE_ID}" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
  --property="EnvironmentFile=$STAGING_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  --property="EnvironmentFile=$STAGING_FIXTURE_ENV" \
  /usr/bin/corepack pnpm --silent fanward:fixture -- revoke-sessions \
  | sudo -u ubuntu tee "$STAGING_FIXTURE_SESSION_REVOCATION" >/dev/null
sudo jq -e --slurpfile manifest "$STAGING_FIXTURE_MANIFEST" '
  .action == "revoke-sessions"
  and .status == "ready"
  and .mode == $manifest[0].mode
  and .origin == $manifest[0].origin
  and .runId == $manifest[0].runId
  and .releaseSha == $manifest[0].releaseSha
  and .httpsClientIp == $manifest[0].httpsClientIp
  and .marker == $manifest[0].marker
  and .ids == $manifest[0].ids
  and .secretsEmitted == false
  and .drift == []
  and .sessions.owner == 0
  and .sessions.admin == 0
' \
  "$STAGING_FIXTURE_SESSION_REVOCATION"

printf 'FANWARD_FIXTURE_RATE_LIMIT_PHASE=recovery\n' \
  | sudo tee "$STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV" >/dev/null
sudo chmod 0600 "$STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV"
test "$(sudo stat -c '%U:%G %a' "$STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV")" = 'root:root 600'
sudo systemd-run --quiet --wait --collect --pipe \
  --unit="surgeindex-fanward-fixture-recovery-status-${RELEASE_ID}" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
  --property="EnvironmentFile=$STAGING_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  --property="EnvironmentFile=$STAGING_FIXTURE_ENV" \
  --property="EnvironmentFile=$STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV" \
  /usr/bin/corepack pnpm --silent fanward:fixture -- status \
  | sudo -u ubuntu tee "$STAGING_FIXTURE_STATUS" >/dev/null
sudo jq -e --arg ip "$STAGING_FIXTURE_HTTPS_CLIENT_IP" '
  .status == "ready"
  and .drift == []
  and .httpsClientIp == $ip
  and .sessions.owner == 0
  and .sessions.admin == 0
  and .rateLimitInventory.phase == "recovery"
  and .rateLimitInventory.expectedKeyCount == 10
  and (.rateLimitInventory.presentKeyCount | type == "number" and . >= 0 and . <= 10)
  and ([.forbiddenCounts[]] | all(. == 0))
' "$STAGING_FIXTURE_STATUS"

# The earlier EXIT trap or the defensive exact-path cleanup destroyed every
# HTTP/cookie input. This recovery cleanup does not need them again.
sudo systemd-run --quiet --wait --collect --pipe \
  --unit="surgeindex-fanward-fixture-recovery-cleanup-${RELEASE_ID}" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
  --property="EnvironmentFile=$STAGING_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  --property="EnvironmentFile=$STAGING_FIXTURE_ENV" \
  /usr/bin/corepack pnpm --silent fanward:fixture -- cleanup \
  | sudo -u ubuntu tee "$STAGING_FIXTURE_CLEANUP" >/dev/null
sudo jq -e \
  --slurpfile manifest "$STAGING_FIXTURE_MANIFEST" \
  --slurpfile before "$STAGING_FIXTURE_STATUS" '
  .action == "cleanup"
  and .status == "deleted"
  and .deleted == true
  and .ids == $manifest[0].ids
  and .usersDeleted == 2
  and .sessionsDeleted == 0
  and .rateLimitRowsDeleted == $before[0].rateLimitInventory.presentKeyCount
  and .retainedAuditCounts == $before[0].retainedAuditCounts
' "$STAGING_FIXTURE_CLEANUP"
sudo rm -f -- \
  "$STAGING_FIXTURE_ENV" "$STAGING_FIXTURE_RATE_LIMIT_PHASE_ENV" \
  "$STAGING_FIXTURE_READBACK_ENV"
test "$(sudo systemctl show surgeindex-staging-traffic-aggregation.timer -p ActiveState --value)" = inactive
test "$(sudo systemctl show surgeindex-staging-scoring.timer -p ActiveState --value)" = inactive
```

If `revoke-sessions` is unavailable, fails, or the subsequent status is not
exactly zero for both fixture users, cleanup and the release remain blocked;
keep the timers paused and escalate to the release owner. The recovery-specific
cleanup above runs only after zero-session status and does not expand any HTTP
path destroyed by the earlier trap. Require `status=deleted`, prove the
synthetic public profile is absent, and only then consider resuming staging
timers.

Staging acceptance must include all of these observations:

1. `/fanward` loads with no placeholder creators and an empty state when no
   approved creator exists; `/creators` redirects permanently to `/fanward`.
2. Anonymous users cannot access creator draft or moderation actions.
3. A controlled verified site owner can create/edit one draft, submit it once,
   and cannot publish it directly.
4. A controlled admin can approve or reject with attributable audit evidence;
   only the approved profile becomes public.
5. The public detail canonical URL, search/filter/pagination, image fallback,
   source labels, Impact Score explanation, and primary-site link are correct.
6. Disabled routes/nav for Boost, Stripe, campaigns, auction, and public API do
   not become visible or indexable.
7. `robots.txt`, sitemap behavior, desktop/mobile navigation, 404/empty/error
   states, keyboard focus, and responsive widths pass.
8. Database count remains 15, service `NRestarts` stays stable, required jobs
   are fresh, and no unexpected 5xx or secret-bearing log line appears.
9. Synthetic-fixture evidence (when this optional path is used) proves the exact
   derived HTTPS client IP, limiter phases `preflight=0`, `active=9`, and
   `complete=10`, plus a full-PASS active-creator read-back whose trusted client
   IP override equals that same derived value.

Keep staging on this exact SHA long enough to exercise the full controlled
draft-to-approved-public flow. A green health endpoint alone is not approval
to move to production.

### Rehearse the forward-schema rollback before production

The rollback rehearsal is mandatory after staging reaches migration count 15
and before production `GO`. It must prove that the retained Public Free code
can run against the forward schema without a down migration, and it must also
prove that staging can return to the exact Fanward SHA.

Use the retained staging build of the known-good Public Free SHA so its compiled
canonical origin remains `staging.surgeindex.lol`:

```bash
export ROLLBACK_SHA='e419c77289eb046c19f8c968e8d60062032717c4'
export ROLLBACK_STAGING_RELEASE='/opt/surgeindex/releases/surgeindex-public-free-20260829.2-staging'
test "$(git -C "$ROLLBACK_STAGING_RELEASE" rev-parse HEAD)" = "$ROLLBACK_SHA"
export STAGING_FANWARD_ENV_BACKUP="${STAGING_ENV}.fanward-${RELEASE_ID}"
export STAGING_ROLLBACK_ENV="${STAGING_ENV}.rollback-rehearsal-${RELEASE_ID}"
sudo install -m 0600 -o root -g root "$STAGING_ENV" "$STAGING_FANWARD_ENV_BACKUP"
sudo install -m 0600 -o root -g root "$STAGING_ENV" "$STAGING_ROLLBACK_ENV"
sudoedit "$STAGING_ROLLBACK_ENV"
```

In the rehearsal env retain the staging database/provider credentials, set
`EXPECTED_MIGRATION_COUNT=15`, set `FEATURE_CREATORS=false`, and explicitly
keep every commercial/future flag in the release boundary false. Validate it
with the **new Fanward artifact's** gate tooling; the old release's historical
gate expects migration count 14 and is not authoritative for this rehearsal:

```bash
sudo systemd-run --wait --collect --pipe --unit="surgeindex-rollback-gate-${RELEASE_ID}-staging" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
  --property="EnvironmentFile=$STAGING_ROLLBACK_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  /usr/bin/corepack pnpm launch:gates:public-free
```

The retained `e419c772...` application predates the active directory. Its known
emergency contract is a `noindex,nofollow` Fanward waitlist/preview at both
`/fanward` and `/creators`, no Fanward data API, and no sitemap entry. The
rollback read-back asserts that exact containment contract; it must not pretend
that the old application honors the newer route-level feature flag.

Prepare the root-only rollback read-back file and its distinct evidence path
**before** touching the selector. Use a fresh ephemeral application-admin
session:

```bash
export ROLLBACK_READBACK_ENV="/run/surgeindex-fanward-${RELEASE_ID}-rollback-rehearsal.env"
export ROLLBACK_READBACK_EVIDENCE="${RELEASE_EVIDENCE_DIR}/fanward-rollback-rehearsal-${ROLLBACK_SHA}.json"
sudo install -m 0600 -o root -g root /dev/null "$ROLLBACK_READBACK_ENV"
sudoedit "$ROLLBACK_READBACK_ENV"
```

```text
FANWARD_READBACK_MODE=rollback-rehearsal
FANWARD_READBACK_DEPLOYMENT=staging
FANWARD_READBACK_EXPECTED_SHA=<ROLLBACK_SHA>
FANWARD_READBACK_TOOL_SHA=<RELEASE_SHA>
FANWARD_READBACK_RELEASE_DIR=<STAGING_RELEASE>
FANWARD_READBACK_EVIDENCE_FILE=<ROLLBACK_READBACK_EVIDENCE>
FANWARD_READBACK_BASE_URL=https://staging.surgeindex.lol
FANWARD_READBACK_PUBLIC_ORIGIN=https://staging.surgeindex.lol
FANWARD_READBACK_BASIC_AUTH=<controlled staging Basic Auth value>
FANWARD_READBACK_ADMIN_COOKIE=<fresh ephemeral verified admin Cookie header value>
```

Run the whole selector switch, exact-SHA/ready checks, old one-shot jobs, and
the **new** read-back tool inside its own fail-closed subshell. The parent shell
temporarily disables `errexit` only while it captures that subshell's status;
the subshell itself remains `set -euo pipefail`. This is what lets the mandatory
Fanward restoration run even when the rehearsal fails:

```bash
set +e
(
  set -euo pipefail
  sudo install -m 0600 -o root -g root "$STAGING_ROLLBACK_ENV" "${STAGING_ENV}.next-rollback-rehearsal-${RELEASE_ID}"
  sudo mv -Tf "${STAGING_ENV}.next-rollback-rehearsal-${RELEASE_ID}" "$STAGING_ENV"
  sudo ln -s "$ROLLBACK_STAGING_RELEASE" "/opt/surgeindex/.staging-rollback-${RELEASE_ID}"
  sudo mv -Tf "/opt/surgeindex/.staging-rollback-${RELEASE_ID}" /opt/surgeindex/staging-current
  sudo systemctl restart surgeindex-staging.service
  test "$(readlink -f /opt/surgeindex/staging-current)" = "$ROLLBACK_STAGING_RELEASE"
  wait_until_http_responds http://127.0.0.1:3212/api/health/live
  curl -fsS http://127.0.0.1:3212/api/health/live | jq -e --arg sha "$ROLLBACK_SHA" '.data.status == "ok" and .data.build == $sha'
  curl -fsS http://127.0.0.1:3212/api/health/ready | jq -e '.data.ready == true and .data.checks.database == true and .data.checks.migrations == true and .data.expectedMigrationCount == 15'
  for unit in surgeindex-staging-traffic-aggregation.service surgeindex-staging-scoring.service; do
    sudo systemctl start "$unit"
    test "$(sudo systemctl show "$unit" -p Result --value)" = success
    test "$(sudo systemctl show "$unit" -p ExecMainStatus --value)" = 0
    sudo systemctl show "$unit" -p ActiveState -p Result -p ExecMainStatus
  done
  sudo systemd-run --wait --collect --pipe --unit="surgeindex-fanward-readback-${RELEASE_ID}-rollback" \
    --property=User=ubuntu --property=Group=ubuntu \
    --property="WorkingDirectory=$STAGING_RELEASE" \
    --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
    --property="EnvironmentFile=$STAGING_ROLLBACK_ENV" \
    --property="EnvironmentFile=$EMAIL_ENV" \
    --property="EnvironmentFile=$ROLLBACK_READBACK_ENV" \
    /usr/bin/corepack pnpm fanward:readback
  sudo jq -e --arg target "$ROLLBACK_SHA" --arg tool "$RELEASE_SHA" \
    '.result == "PASS" and .mode == "rollback-rehearsal" and .deployment == "staging" and .target.expectedSha == $target and .target.toolSha == $tool and .summary.failed == 0 and .summary.notRun == 0' \
    "$ROLLBACK_READBACK_EVIDENCE"
)
REHEARSAL_STATUS=$?
set -e
if ! sudo rm -f "$ROLLBACK_READBACK_ENV"; then
  printf 'Warning: remove %s manually during credential cleanup; continuing mandatory Fanward restoration.\n' "$ROLLBACK_READBACK_ENV" >&2
fi
```

This checks the contained legacy preview, absent Fanward data API, Public Free
SEO, tracker artifact, authenticated session, and protected job endpoints while
using the current release's schema-15 gate. Revoke its ephemeral session now,
whether `REHEARSAL_STATUS` is zero or non-zero. Do not exit on a non-zero
rehearsal status yet: staging must first be restored to Fanward and read back.

Whether the rehearsal passes or fails, restore the Fanward staging env and
selector as one staffed operation. A failed rehearsal blocks production:

```bash
sudo install -m 0600 -o root -g root "$STAGING_FANWARD_ENV_BACKUP" "${STAGING_ENV}.next-fanward-${RELEASE_ID}"
sudo mv -Tf "${STAGING_ENV}.next-fanward-${RELEASE_ID}" "$STAGING_ENV"
sudo ln -s "$STAGING_RELEASE" "/opt/surgeindex/.staging-fanward-${RELEASE_ID}"
sudo mv -Tf "/opt/surgeindex/.staging-fanward-${RELEASE_ID}" /opt/surgeindex/staging-current
sudo systemctl restart surgeindex-staging.service
test "$(readlink -f /opt/surgeindex/staging-current)" = "$STAGING_RELEASE"
wait_until_http_responds http://127.0.0.1:3212/api/health/live
curl -fsS http://127.0.0.1:3212/api/health/live | jq -e --arg sha "$RELEASE_SHA" '.data.status == "ok" and .data.build == $sha'
curl -fsS http://127.0.0.1:3212/api/health/ready | jq -e '.data.ready == true and .data.expectedMigrationCount == 15'
sudo systemd-run --wait --collect --pipe --unit="surgeindex-restore-gate-${RELEASE_ID}-staging" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
  --property="EnvironmentFile=$STAGING_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  /usr/bin/corepack pnpm launch:gates:fanward
for unit in surgeindex-staging-traffic-aggregation.service surgeindex-staging-scoring.service; do
  sudo systemctl start "$unit"
  test "$(sudo systemctl show "$unit" -p Result --value)" = success
  test "$(sudo systemctl show "$unit" -p ExecMainStatus --value)" = 0
done
```

Create a fresh admin session and a distinct restoration read-back file; the
earlier staging credential file and session have already been destroyed:

```bash
export STAGING_RESTORE_READBACK_ENV="/run/surgeindex-fanward-${RELEASE_ID}-staging-restored.env"
export STAGING_RESTORE_EVIDENCE="${RELEASE_EVIDENCE_DIR}/fanward-staging-restored-${RELEASE_SHA}.json"
sudo install -m 0600 -o root -g root /dev/null "$STAGING_RESTORE_READBACK_ENV"
sudoedit "$STAGING_RESTORE_READBACK_ENV"
```

```text
FANWARD_READBACK_MODE=staging
FANWARD_READBACK_DEPLOYMENT=staging
FANWARD_READBACK_EXPECTED_SHA=<RELEASE_SHA>
FANWARD_READBACK_TOOL_SHA=<RELEASE_SHA>
FANWARD_READBACK_RELEASE_DIR=<STAGING_RELEASE>
FANWARD_READBACK_EVIDENCE_FILE=<STAGING_RESTORE_EVIDENCE>
FANWARD_READBACK_BASE_URL=https://staging.surgeindex.lol
FANWARD_READBACK_PUBLIC_ORIGIN=https://staging.surgeindex.lol
FANWARD_READBACK_BASIC_AUTH=<controlled staging Basic Auth value>
FANWARD_READBACK_ADMIN_COOKIE=<fresh ephemeral verified admin Cookie header value>
```

```bash
sudo systemd-run --wait --collect --pipe --unit="surgeindex-fanward-readback-${RELEASE_ID}-staging-restored" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$STAGING_RELEASE" \
  --property="EnvironmentFile=$STAGING_TURNSTILE_ENV" \
  --property="EnvironmentFile=$STAGING_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  --property="EnvironmentFile=$STAGING_RESTORE_READBACK_ENV" \
  /usr/bin/corepack pnpm fanward:readback
sudo jq -e --arg sha "$RELEASE_SHA" \
  '.result == "PASS" and .mode == "staging" and .deployment == "staging" and .target.expectedSha == $sha and .target.toolSha == $sha and .summary.failed == 0 and .summary.notRun == 0' \
  "$STAGING_RESTORE_EVIDENCE"
sudo rm -f "$STAGING_RESTORE_READBACK_ENV"
```

Revoke this session. Retain the old staging release, the new staging release,
all three redacted evidence files, and the protected env backup. Only after the
restoration read-back passes may the rehearsal result be acted on. Propagate a
failed rehearsal only **after** restoration, which leaves the timers paused and
blocks production. Resume the timers only on a complete rehearsal pass:

```bash
if (( REHEARSAL_STATUS != 0 )); then
  printf 'Rollback rehearsal failed with exit %s; Fanward staging is restored, production remains blocked, and staging timers remain paused.\n' "$REHEARSAL_STATUS" >&2
  exit "$REHEARSAL_STATUS"
fi
sudo systemctl start surgeindex-staging-traffic-aggregation.timer surgeindex-staging-scoring.timer
sudo systemctl list-timers surgeindex-staging-traffic-aggregation.timer surgeindex-staging-scoring.timer --all
```

## 5. Production switch window

Obtain a second explicit `GO` for the same SHA after staging evidence is
reviewed. Record the current symlink, SHA, env backup, migration count, service
restart count, and timer state. Do not delete the Public Free release.

Prepare the production rollback env **before** quiescing writers or migrating.
Retain `EXPECTED_MIGRATION_COUNT=15`, set `FEATURE_CREATORS=false`, and keep all
commercial/future flags false. Validate it with the new immutable artifact's
schema-15 Public Free gate; production still points to the old release here:

```bash
test "$(git -C "$PRODUCTION_RELEASE" rev-parse HEAD)" = "$RELEASE_SHA"
export ROLLBACK_ENV_CANDIDATE="${PRODUCTION_ENV}.rollback-${RELEASE_ID}.candidate"
sudo install -m 0600 -o root -g root "$PRODUCTION_ENV" "$ROLLBACK_ENV_CANDIDATE"
sudoedit "$ROLLBACK_ENV_CANDIDATE"
sudo grep -E '^(EXPECTED_MIGRATION_COUNT|NEXT_PUBLIC_COMMERCIAL_ENABLED|NEXT_PUBLIC_RADAR_ENABLED|STRIPE_ENABLED|BOOST_ENABLED|BOOST_LIVE_MODE_ENABLED|GA4_ENABLED|PUBLIC_REVENUE_BOARD_ENABLED|PUBLIC_PAGE_METRICS_ENABLED|BOOST_PLACEMENT_[A-Z_]+|FEATURE_[A-Z_]+)=' "$ROLLBACK_ENV_CANDIDATE"
sudo systemd-run --wait --collect --pipe --unit="surgeindex-rollback-gate-${RELEASE_ID}" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$PRODUCTION_RELEASE" \
  --property="EnvironmentFile=$ROLLBACK_ENV_CANDIDATE" \
  --property="EnvironmentFile=$PRODUCTION_TURNSTILE_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  /usr/bin/corepack pnpm launch:gates:public-free
```

Pause both schedulers first, then wait for any already-started aggregation or
scoring one-shot to finish before taking the backup. Stopping only the timers
does not quiesce a service that is already running. Use a bounded wait (ten
minutes maximum); if either writer remains active, abort the release window and
investigate instead of killing it during a database write. Record `Result` and
`ExecMainStatus` for both writers:

```bash
sudo systemctl stop surgeindex-traffic-aggregation.timer surgeindex-scoring.timer
sudo systemctl is-active surgeindex-traffic-aggregation.timer surgeindex-scoring.timer || true
for unit in surgeindex-traffic-aggregation.service surgeindex-scoring.service; do
  for attempt in $(seq 1 120); do
    state="$(sudo systemctl show "$unit" -p ActiveState --value)"
    test "$state" != active -a "$state" != activating && break
    sleep 5
  done
  test "$(sudo systemctl show "$unit" -p ActiveState --value)" = inactive
  test "$(sudo systemctl show "$unit" -p Result --value)" = success
  test "$(sudo systemctl show "$unit" -p ExecMainStatus --value)" = 0
  sudo systemctl show "$unit" -p ActiveState -p Result -p ExecMainStatus
done
sudo systemctl list-timers 'surgeindex-*' --all
```

Now take a fresh production backup. It must report `Result=success` and
`ExecMainStatus=0`; record the backup artifact, size, checksum, and a current
restore-test/checkpoint reference without printing database credentials:

```bash
export PRE_RELEASE_BACKUP="$(sudo find /var/backups/surgeindex/postgres -maxdepth 1 -type f -name '*.dump' -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)"
sudo systemctl start surgeindex-postgres-backup.service
sudo systemctl show surgeindex-postgres-backup.service -p ActiveState -p Result -p ExecMainStatus
test "$(sudo systemctl show surgeindex-postgres-backup.service -p Result --value)" = success
test "$(sudo systemctl show surgeindex-postgres-backup.service -p ExecMainStatus --value)" = 0
export PRODUCTION_BACKUP="$(sudo find /var/backups/surgeindex/postgres -maxdepth 1 -type f -name '*.dump' -printf '%T@ %p\n' | sort -n | tail -1 | cut -d' ' -f2-)"
test -n "$PRODUCTION_BACKUP"
test "$PRODUCTION_BACKUP" != "$PRE_RELEASE_BACKUP"
sudo test -s "$PRODUCTION_BACKUP"
sudo stat -c '%U:%G %a %s %y %n' "$PRODUCTION_BACKUP"
sudo sha256sum "$PRODUCTION_BACKUP"
sudo dd if="$PRODUCTION_BACKUP" status=none \
  | sudo docker exec -i surgeindex-db pg_restore --list >/dev/null

sudo systemctl start surgeindex-postgres-backup-offsite.service
test "$(sudo systemctl show surgeindex-postgres-backup-offsite.service -p Result --value)" = success
test "$(sudo systemctl show surgeindex-postgres-backup-offsite.service -p ExecMainStatus --value)" = 0
sudo systemctl start surgeindex-postgres-backup-verify.service
test "$(sudo systemctl show surgeindex-postgres-backup-verify.service -p Result --value)" = success
test "$(sudo systemctl show surgeindex-postgres-backup-verify.service -p ExecMainStatus --value)" = 0
sudo systemctl show surgeindex-postgres-backup-offsite.service surgeindex-postgres-backup-verify.service \
  -p ActiveState -p Result -p ExecMainStatus -p ExecMainStartTimestamp -p ExecMainExitTimestamp
```

The important ordering constraint is:

1. build and validate the new artifact before the window;
2. pause write-producing jobs and verify the backup;
3. migrate the database to 15;
4. promote the env with `EXPECTED_MIGRATION_COUNT=15`;
5. switch the symlink and restart immediately;
6. verify exact SHA/readiness, then resume approved jobs.

After step 3, the old application still expects 14 and can report not-ready.
That is the controlled env-switch window. Do not restart the old application,
set the old count back to 14, or leave the window unattended. Keep migration,
env promotion, symlink switch, and restart in one staffed change window.

Run the production migration from the exact production artifact:

```bash
export PREVIOUS_PRODUCTION_RELEASE="$(readlink -f /opt/surgeindex/current)"
test "$PREVIOUS_PRODUCTION_RELEASE" = '/opt/surgeindex/releases/surgeindex-public-free-20260829.2'
sudo systemd-run --wait --collect --pipe --unit="surgeindex-migrate-${RELEASE_ID}-production" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$PRODUCTION_RELEASE" \
  --property="EnvironmentFile=$PRODUCTION_ENV_CANDIDATE" \
  --setenv='PGOPTIONS=-c lock_timeout=5s -c statement_timeout=120s' \
  /usr/bin/corepack pnpm db:migrate
```

Read production directly and stop unless it reports exactly 15:

```bash
sudo systemd-run --wait --collect --pipe --unit="surgeindex-readback-${RELEASE_ID}-production" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$PRODUCTION_RELEASE" \
  --property="EnvironmentFile=$PRODUCTION_ENV_CANDIDATE" \
  /usr/bin/node -e 'const {Client}=require("pg");(async()=>{const c=new Client({connectionString:process.env.DATABASE_URL_UNPOOLED||process.env.DATABASE_URL});await c.connect();const r=await c.query("select count(*)::int as count from drizzle.__drizzle_migrations");console.log(JSON.stringify({migrationCount:Number(r.rows[0].count)}));await c.end()})().catch(e=>{console.error(e.name);process.exit(1)})'
```

Promote the production env and switch traffic atomically:

```bash
sudo install -m 0600 -o root -g root "$PRODUCTION_ENV" "${PRODUCTION_ENV}.pre-${RELEASE_ID}"
sudo install -m 0600 -o root -g root "$PRODUCTION_ENV_CANDIDATE" "${PRODUCTION_ENV}.next-${RELEASE_ID}"
sudo mv -Tf "${PRODUCTION_ENV}.next-${RELEASE_ID}" "$PRODUCTION_ENV"
sudo ln -s "$PRODUCTION_RELEASE" "/opt/surgeindex/.current-${RELEASE_ID}"
sudo mv -Tf "/opt/surgeindex/.current-${RELEASE_ID}" /opt/surgeindex/current
sudo systemctl restart surgeindex.service
sudo systemctl is-active surgeindex.service
test "$(readlink -f /opt/surgeindex/current)" = "$PRODUCTION_RELEASE"
test "$(git -C "$(readlink -f /opt/surgeindex/current)" rev-parse HEAD)" = "$RELEASE_SHA"
wait_until_http_responds https://surgeindex.lol/api/health/live
curl -fsS https://surgeindex.lol/api/health/live | jq -e --arg sha "$RELEASE_SHA" '.data.status == "ok" and .data.build == $sha'
curl -fsS https://surgeindex.lol/api/health/ready | jq -e '.data.ready == true and .data.checks.database == true and .data.checks.migrations == true and .data.expectedMigrationCount == 15'
```

Run `pnpm launch:gates:fanward` through a transient unit using the promoted
production env. Then run the dedicated Fanward read-back **before** resuming
paused timers:

```bash
sudo systemd-run --wait --collect --pipe --unit="surgeindex-postswitch-gate-${RELEASE_ID}-production" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$PRODUCTION_RELEASE" \
  --property="EnvironmentFile=$PRODUCTION_ENV" \
  --property="EnvironmentFile=$PRODUCTION_TURNSTILE_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  /usr/bin/corepack pnpm launch:gates:fanward

export PRODUCTION_READBACK_ENV="/run/surgeindex-fanward-${RELEASE_ID}-production.env"
export RELEASE_EVIDENCE_DIR='/var/lib/surgeindex/release-evidence'
export PRODUCTION_READBACK_EVIDENCE="${RELEASE_EVIDENCE_DIR}/fanward-production-${RELEASE_SHA}.json"
sudo install -d -m 0750 -o ubuntu -g ubuntu "$RELEASE_EVIDENCE_DIR"
sudo install -m 0600 -o root -g root /dev/null "$PRODUCTION_READBACK_ENV"
sudoedit "$PRODUCTION_READBACK_ENV"
```

Use the following entries, with a short-lived controlled production admin
session from the secret manager/auth flow. Production has no staging Basic
Auth, so omit `FANWARD_READBACK_BASIC_AUTH`:

```text
FANWARD_READBACK_MODE=production
FANWARD_READBACK_DEPLOYMENT=production
FANWARD_READBACK_EXPECTED_SHA=<RELEASE_SHA>
FANWARD_READBACK_TOOL_SHA=<RELEASE_SHA>
FANWARD_READBACK_RELEASE_DIR=<PRODUCTION_RELEASE>
FANWARD_READBACK_EVIDENCE_FILE=<PRODUCTION_READBACK_EVIDENCE>
FANWARD_READBACK_BASE_URL=https://surgeindex.lol
FANWARD_READBACK_PUBLIC_ORIGIN=https://surgeindex.lol
FANWARD_READBACK_ADMIN_COOKIE=<ephemeral verified admin Cookie header value>
```

Run and require a complete pass. `PARTIAL` is not permission to resume jobs:

```bash
sudo systemd-run --wait --collect --pipe --unit="surgeindex-fanward-readback-${RELEASE_ID}-production" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$PRODUCTION_RELEASE" \
  --property="EnvironmentFile=$PRODUCTION_ENV" \
  --property="EnvironmentFile=$PRODUCTION_TURNSTILE_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  --property="EnvironmentFile=$PRODUCTION_READBACK_ENV" \
  /usr/bin/corepack pnpm fanward:readback
sudo test "$(sudo stat -c '%a' "$PRODUCTION_READBACK_EVIDENCE")" = 600
sudo jq -e --arg sha "$RELEASE_SHA" \
  '.result == "PASS" and .mode == "production" and .deployment == "production" and .target.expectedSha == $sha and .summary.failed == 0 and .summary.notRun == 0' \
  "$PRODUCTION_READBACK_EVIDENCE"
sudo rm -f "$PRODUCTION_READBACK_ENV"
```

Revoke the ephemeral admin session. Re-check that the web service remains on
the exact release and did not restart during read-back. Only then resume the
approved schedulers:

```bash
test "$(readlink -f /opt/surgeindex/current)" = "$PRODUCTION_RELEASE"
sudo systemctl show surgeindex.service -p ActiveState -p SubState -p NRestarts
for unit in surgeindex-traffic-aggregation.service surgeindex-scoring.service; do
  sudo systemctl start "$unit"
  test "$(sudo systemctl show "$unit" -p Result --value)" = success
  test "$(sudo systemctl show "$unit" -p ExecMainStatus --value)" = 0
done
sudo systemctl start surgeindex-traffic-aggregation.timer surgeindex-scoring.timer
sudo systemctl list-timers surgeindex-traffic-aggregation.timer surgeindex-scoring.timer --all
```

Do not create or approve a real creator record without the release owner's
content approval.

## 6. Production canary

Record every checkpoint against `RELEASE_SHA`; do not report “live” from the
deployment command alone.

| Checkpoint | Required evidence |
| --- | --- |
| T0 | exact build SHA, ready 200/count 15, service active, stable restart count, `/fanward` 200, commercial/future gates false |
| T+15 minutes | no repeated restart or 5xx burst; auth, Turnstile, email delivery, save/submit boundaries, and moderation authorization healthy; do not publish unapproved content |
| T+1 hour | approved profile/directory/filter/detail evidence when approved content exists, otherwise the truthful empty state; jobs fresh; tracker/scoring source labels truthful; no secret leakage |
| T+6 hours | readiness continuously healthy, no error-rate/regression threshold breached, rollback release retained, owner signs final Fanward MVP result |

Sample liveness/readiness and `NRestarts` every minute for the first 15
minutes, every five minutes through T+1 hour, and every 15 minutes through T+6
hours. Trigger rollback/containment on any authorization or unmoderated-publish
failure, any increase in `NRestarts`, two consecutive readiness failures 30
seconds apart, five web 5xx responses in a rolling five-minute window, or three
consecutive 5xx responses on the same required route. A single provider timeout
does not justify inventing a healthy result; record it and repeat the exact
controlled probe once. A second consecutive Turnstile/email/auth failure blocks
the canary and requires containment.

At each checkpoint capture safe output from:

```bash
sudo systemctl show surgeindex.service -p ActiveState -p SubState -p NRestarts
sudo journalctl -u surgeindex.service --since '<checkpoint start UTC>' --no-pager
curl -fsS https://surgeindex.lol/api/health/live | jq .
curl -fsS https://surgeindex.lol/api/health/ready | jq .
curl -fsS -o /dev/null -w '%{http_code}\n' https://surgeindex.lol/fanward
```

Redact cookies, email links, tokens, database URLs, and provider responses from
the release evidence. Keep both release directories and both env backups until
the six-hour result and rollback window are closed.

## 7. Forward-only rollback

Rollback never removes migration `0014`, resets a schema, restores the count to
14, or deletes Fanward records. It switches code, removes the active creator
directory/data API, and returns to the retained non-indexable Fanward preview
while preserving the database at count 15.

Before production `GO`, rehearse the known-good Public Free artifact against a
disposable or staging database already at migration 15. Accept it as rollback
target only if its application/readiness paths are compatible with additive
`0014`. The intended target is:

```text
/opt/surgeindex/releases/surgeindex-public-free-20260829.2
e419c77289eb046c19f8c968e8d60062032717c4
```

The already-prepared `ROLLBACK_ENV_CANDIDATE` from section 5 is the only
authorized rollback env. Do not derive a new candidate during an incident.

An incident is assumed to start in a fresh shell. Rehydrate every value from
the release ticket—not shell history—and validate it before stopping anything:

```bash
ssh -t templystudio 'bash --noprofile --norc'
set -euo pipefail

export RELEASE_ID='<exact release id from the ticket>'
export RELEASE_SHA='<exact deployed Fanward 40-character SHA>'
export PRODUCTION_RELEASE='<exact Fanward production release directory>'
export PRODUCTION_ENV='/etc/surgeindex/surgeindex.env'
export PRODUCTION_TURNSTILE_ENV='/etc/surgeindex/turnstile.production.env'
export EMAIL_ENV='/etc/surgeindex/resend.env'
export ROLLBACK_ENV_CANDIDATE="${PRODUCTION_ENV}.rollback-${RELEASE_ID}.candidate"
export RELEASE_EVIDENCE_DIR='/var/lib/surgeindex/release-evidence'
export ROLLBACK_RELEASE='/opt/surgeindex/releases/surgeindex-public-free-20260829.2'
export ROLLBACK_SHA='e419c77289eb046c19f8c968e8d60062032717c4'

case "$RELEASE_ID" in ''|*[!A-Za-z0-9_.-]*) exit 1 ;; esac
test "${#RELEASE_SHA}" = 40
test "${#ROLLBACK_SHA}" = 40
case "$RELEASE_SHA$ROLLBACK_SHA" in *[!0-9a-f]*) exit 1 ;; esac
case "$PRODUCTION_RELEASE" in /opt/surgeindex/releases/*-production) ;; *) exit 1 ;; esac
test "$(git -C "$PRODUCTION_RELEASE" rev-parse HEAD)" = "$RELEASE_SHA"
git -C "$PRODUCTION_RELEASE" diff --quiet HEAD --
grep -qx "BUILD_SHA=$RELEASE_SHA" "$PRODUCTION_RELEASE/release.env"
test "$(git -C "$ROLLBACK_RELEASE" rev-parse HEAD)" = "$ROLLBACK_SHA"
git -C "$ROLLBACK_RELEASE" diff --quiet HEAD --
grep -qx "BUILD_SHA=$ROLLBACK_SHA" "$ROLLBACK_RELEASE/release.env"
test "$(readlink -f /opt/surgeindex/current)" = "$PRODUCTION_RELEASE"
test "$(sudo stat -c '%U:%G:%a' "$ROLLBACK_ENV_CANDIDATE")" = root:root:600
sudo grep -q '^EXPECTED_MIGRATION_COUNT=15$' "$ROLLBACK_ENV_CANDIDATE"
sudo grep -q '^FEATURE_CREATORS=false$' "$ROLLBACK_ENV_CANDIDATE"
sudo stat -c '%U:%G %a %n' "$PRODUCTION_ENV" "$PRODUCTION_TURNSTILE_ENV" "$EMAIL_ENV"
sudo test -d "$RELEASE_EVIDENCE_DIR"

incident_cleanup() {
  local status=$?
  trap - EXIT
  if [[ "${PRODUCTION_ROLLBACK_READBACK_ENV:-}" == /run/surgeindex-fanward-*.env ]]; then
    sudo rm -f -- "$PRODUCTION_ROLLBACK_READBACK_ENV"
  fi
  if (( status != 0 )); then
    printf 'ROLLBACK STOPPED (exit %s). Keep writers paused and revoke the ephemeral session.\n' "$status" >&2
  fi
  exit "$status"
}
trap incident_cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

wait_until_http_responds() {
  local url=$1 attempt
  for attempt in $(seq 1 30); do
    if curl -fsS --max-time 5 -o /dev/null "$url"; then return 0; fi
    sleep 2
  done
  return 1
}
```

If a rollback trigger fires:

1. declare the incident, stop creator announcements/moderation, and pause
   affected write-producing timers;
2. preserve journals, the new release, the env used, and exact SHAs;
3. atomically promote the rollback env and select the rehearsed Public Free
   directory;
4. restart `surgeindex.service` and verify the rollback SHA, ready 200, and
   migration count 15;
5. resume only the jobs explicitly verified compatible with schema 15.

The code switch is:

```bash
sudo systemctl stop surgeindex-traffic-aggregation.timer surgeindex-scoring.timer
for unit in surgeindex-traffic-aggregation.service surgeindex-scoring.service; do
  for attempt in $(seq 1 120); do
    state="$(sudo systemctl show "$unit" -p ActiveState --value)"
    test "$state" != active -a "$state" != activating && break
    sleep 5
  done
  test "$(sudo systemctl show "$unit" -p ActiveState --value)" = inactive
  test "$(sudo systemctl show "$unit" -p Result --value)" = success
  test "$(sudo systemctl show "$unit" -p ExecMainStatus --value)" = 0
done
export ROLLBACK_RELEASE='/opt/surgeindex/releases/surgeindex-public-free-20260829.2'
export ROLLBACK_SHA='e419c77289eb046c19f8c968e8d60062032717c4'
test "$(git -C "$ROLLBACK_RELEASE" rev-parse HEAD)" = "$ROLLBACK_SHA"
sudo install -m 0600 -o root -g root "$PRODUCTION_ENV" "${PRODUCTION_ENV}.pre-rollback-${RELEASE_ID}"
sudo install -m 0600 -o root -g root "$ROLLBACK_ENV_CANDIDATE" "${PRODUCTION_ENV}.next-rollback-${RELEASE_ID}"
sudo mv -Tf "${PRODUCTION_ENV}.next-rollback-${RELEASE_ID}" "$PRODUCTION_ENV"
sudo ln -s "$ROLLBACK_RELEASE" "/opt/surgeindex/.current-rollback-${ROLLBACK_SHA:0:12}"
sudo mv -Tf "/opt/surgeindex/.current-rollback-${ROLLBACK_SHA:0:12}" /opt/surgeindex/current
sudo systemctl restart surgeindex.service
sudo systemctl is-active surgeindex.service
test "$(readlink -f /opt/surgeindex/current)" = "$ROLLBACK_RELEASE"
wait_until_http_responds https://surgeindex.lol/api/health/live
curl -fsS https://surgeindex.lol/api/health/live | jq -e --arg sha "$ROLLBACK_SHA" '.data.status == "ok" and .data.build == $sha'
curl -fsS https://surgeindex.lol/api/health/ready | jq -e '.data.ready == true and .data.checks.database == true and .data.checks.migrations == true and .data.expectedMigrationCount == 15'
```

Do not resume jobs from health alone. Run the current tool's schema-15 Public
Free gate against the promoted rollback env, then its rollback read-back
against the exact old target:

```bash
sudo systemd-run --wait --collect --pipe --unit="surgeindex-postrollback-gate-${RELEASE_ID}-production" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$PRODUCTION_RELEASE" \
  --property="EnvironmentFile=$PRODUCTION_ENV" \
  --property="EnvironmentFile=$PRODUCTION_TURNSTILE_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  /usr/bin/corepack pnpm launch:gates:public-free

export PRODUCTION_ROLLBACK_READBACK_ENV="/run/surgeindex-fanward-${RELEASE_ID}-production-rollback.env"
export PRODUCTION_ROLLBACK_EVIDENCE="${RELEASE_EVIDENCE_DIR}/fanward-production-rollback-${ROLLBACK_SHA}.json"
sudo install -m 0600 -o root -g root /dev/null "$PRODUCTION_ROLLBACK_READBACK_ENV"
sudoedit "$PRODUCTION_ROLLBACK_READBACK_ENV"
```

```text
FANWARD_READBACK_MODE=rollback-rehearsal
FANWARD_READBACK_DEPLOYMENT=production
FANWARD_READBACK_EXPECTED_SHA=<ROLLBACK_SHA>
FANWARD_READBACK_TOOL_SHA=<RELEASE_SHA>
FANWARD_READBACK_RELEASE_DIR=<PRODUCTION_RELEASE>
FANWARD_READBACK_EVIDENCE_FILE=<PRODUCTION_ROLLBACK_EVIDENCE>
FANWARD_READBACK_BASE_URL=https://surgeindex.lol
FANWARD_READBACK_PUBLIC_ORIGIN=https://surgeindex.lol
FANWARD_READBACK_ADMIN_COOKIE=<fresh ephemeral verified admin Cookie header value>
```

```bash
sudo systemd-run --wait --collect --pipe --unit="surgeindex-fanward-readback-${RELEASE_ID}-production-rollback" \
  --property=User=ubuntu --property=Group=ubuntu \
  --property="WorkingDirectory=$PRODUCTION_RELEASE" \
  --property="EnvironmentFile=$PRODUCTION_ENV" \
  --property="EnvironmentFile=$PRODUCTION_TURNSTILE_ENV" \
  --property="EnvironmentFile=$EMAIL_ENV" \
  --property="EnvironmentFile=$PRODUCTION_ROLLBACK_READBACK_ENV" \
  /usr/bin/corepack pnpm fanward:readback
sudo jq -e --arg target "$ROLLBACK_SHA" --arg tool "$RELEASE_SHA" \
  '.result == "PASS" and .mode == "rollback-rehearsal" and .deployment == "production" and .target.expectedSha == $target and .target.toolSha == $tool and .summary.failed == 0 and .summary.notRun == 0' \
  "$PRODUCTION_ROLLBACK_EVIDENCE"
sudo rm -f "$PRODUCTION_ROLLBACK_READBACK_ENV"
```

Revoke the ephemeral session. Run each rehearsed old job artifact once against
schema 15 and require success before resuming its scheduler:

```bash
for unit in surgeindex-traffic-aggregation.service surgeindex-scoring.service; do
  sudo systemctl start "$unit"
  test "$(sudo systemctl show "$unit" -p Result --value)" = success
  test "$(sudo systemctl show "$unit" -p ExecMainStatus --value)" = 0
done
sudo systemctl start surgeindex-traffic-aggregation.timer surgeindex-scoring.timer
sudo systemctl list-timers surgeindex-traffic-aggregation.timer surgeindex-scoring.timer --all
```

If the gate, read-back, or either one-shot fails, keep both timers paused and
continue incident containment; do not trade a successful code switch for an
unverified writer resume.

Rollback immediately for migration/readiness failure, repeated process
restart, authorization bypass, unmoderated publication, corrupted creator/site
association, wrong source/Impact Score claims, unexpected commercial surface,
or a material 5xx/auth/email/Turnstile regression. A cosmetic issue with a
safe feature flag may be contained by setting `FEATURE_CREATORS=false`, but it
still requires a controlled restart and the same post-change verification.

If the additive compatibility rehearsal failed, the older Public Free release
is not an authorized rollback target. Keep traffic contained, leave the
database forward-only, and build a new compatible application SHA; do not
invent a down migration during the incident.

## Evidence outcome

The result is `FANWARD MVP LIVE` only after the exact production SHA passes the
six-hour canary and the release owner reviews the evidence. Before that, use
`BUILD READY`, `STAGING READY`, or `PRODUCTION CANARY` as appropriate. Local
tests, source review, CI fixtures, and a successful restart are supporting
evidence; none substitutes for current provider, database, host, browser, and
moderation-flow read-back.
