#!/usr/bin/env bash
# One-shot release deploy for surgeindex.lol on the VPS.
# Runs ON the VPS as the `ubuntu` user (GitHub Actions calls it over SSH).
# Usage: deploy-vps.sh <git-sha> [branch]
set -euo pipefail

SHA="${1:?usage: deploy-vps.sh <git-sha> [branch]}"
BRANCH="${2:-trends-pivot}"
REPO="https://github.com/Simonjay85/surgeindex.git"
ROOT=/opt/surgeindex
RELEASES="$ROOT/releases"
SHARED="$ROOT/shared"
DATA="$SHARED/trends"
ID="$(date -u +%Y%m%d%H%M%S)-${SHA:0:7}"
RELEASE="$RELEASES/$ID"
LOCK=/tmp/surgeindex-deploy.lock

exec 9>"$LOCK"
flock -n 9 || { echo "[deploy] another deploy is running"; exit 1; }
PREV="$(readlink -f "$ROOT/current" 2>/dev/null || true)"

log() { echo "[deploy $(date -u +%H:%M:%S)] $*"; }

# --- tools -------------------------------------------------------------
export PATH="$HOME/.local/share/pnpm:$HOME/.npm-global/bin:/usr/local/bin:$PATH"
command -v node >/dev/null || { log "node not found"; exit 1; }
command -v pnpm >/dev/null || { log "pnpm not found; provision it before deploying"; exit 1; }

# Provisioning and credential changes are separate from routine deployment.
test -d "$RELEASES" && test -w "$RELEASES" && test -d "$DATA" || {
  log "release or shared data directory unavailable; provision it before deploying"
  exit 1
}

# --- disk guard (VPS has run near-full before) -------------------------
FREE_MB=$(df -Pm "$ROOT" | awk 'NR==2{print $4}')
if [ "$FREE_MB" -lt 2500 ]; then
  log "only ${FREE_MB}MB free; stopping without deleting old releases"
  exit 1
fi

# Required production configuration must exist before a release is built.
for f in /etc/surgeindex/surgeindex.env /etc/surgeindex/trends.env "$SHARED/ingest.env"; do
  sudo test -s "$f" || { log "required configuration missing: $f"; exit 1; }
done
crontab -l 2>/dev/null | grep -q 'scripts/ingest-trends.ts' || {
  log "hourly trends cron missing; provision it before deploying"
  exit 1
}

# --- env ---------------------------------------------------------------
# Parse systemd-style env files literally (values may contain spaces/$/quotes).
load_env() {
  local f="$1" line key val
  sudo test -f "$f" || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"; key="${key#export }"; key="${key//[[:space:]]/}"
    [[ "$key" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || continue
    val="${line#*=}"
    if [[ "$val" =~ ^\"(.*)\"$ ]] || [[ "$val" =~ ^\'(.*)\'$ ]]; then val="${BASH_REMATCH[1]}"; fi
    export "$key=$val"
  done < <(sudo cat "$f")
  log "loaded env $(basename "$f")"
}
# Read existing configuration without modifying credentials or environment files.
for f in /etc/surgeindex/surgeindex.env /etc/surgeindex/turnstile.production.env /etc/surgeindex/resend.env /etc/surgeindex/trends.env; do
  load_env "$f"
done
export TRENDS_DATA_DIR="$DATA"

# --- fetch -------------------------------------------------------------
log "cloning $BRANCH @ $SHA -> $RELEASE"
git clone --quiet --branch "$BRANCH" "$REPO" "$RELEASE"
git -C "$RELEASE" checkout --quiet "$SHA"
printf 'BUILD_SHA=%s\n' "$SHA" > "$RELEASE/release.env"
chmod 0644 "$RELEASE/release.env"

cd "$RELEASE"
log "pnpm install"
pnpm install --frozen-lockfile --reporter=append-only

# --- data + build ------------------------------------------------------
# Build with the existing shared snapshot. The existing hourly cron continues
# to refresh it, without a deploy changing its configuration or credentials.

log "next build"
NODE_OPTIONS=--max-old-space-size=1536 pnpm build

# --- switch ------------------------------------------------------------
[ "$(readlink -f "$ROOT/current" 2>/dev/null || true)" = "$PREV" ] || {
  log "current release changed during build; refusing to switch"
  exit 1
}
log "switching current -> $RELEASE"
ln -sfn "$RELEASE" "$ROOT/current"

ok=0
if sudo systemctl restart surgeindex.service; then
  for i in $(seq 1 30); do
    if curl -fsS -o /dev/null http://127.0.0.1:3211/ && curl -fsS -o /tmp/surgeindex-health.json http://127.0.0.1:3211/api/trends && head -c 1 /tmp/surgeindex-health.json | grep -q '{'; then ok=1; break; fi
    sleep 2
  done
fi

if [ "$ok" -ne 1 ]; then
  log "health check FAILED"
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    log "rolling back to $PREV"
    ln -sfn "$PREV" "$ROOT/current"
    sudo systemctl restart surgeindex.service
  fi
  exit 1
fi

log "deployed $SHA ($ID) OK"
