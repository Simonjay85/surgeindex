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
PREV="$(readlink -f "$ROOT/current" 2>/dev/null || true)"
LOCK=/tmp/surgeindex-deploy.lock

exec 9>"$LOCK"
flock -n 9 || { echo "[deploy] another deploy is running"; exit 1; }

log() { echo "[deploy $(date -u +%H:%M:%S)] $*"; }

# --- tools -------------------------------------------------------------
export PATH="$HOME/.local/share/pnpm:$HOME/.npm-global/bin:/usr/local/bin:$PATH"
command -v node >/dev/null || { log "node not found"; exit 1; }
if ! command -v pnpm >/dev/null; then
  log "installing pnpm via corepack"
  corepack enable --install-directory "$HOME/.local/bin" pnpm 2>/dev/null || npm i -g pnpm@11.22.0 --prefix "$HOME/.npm-global"
  export PATH="$HOME/.local/bin:$PATH"
fi

# --- one-time dirs -----------------------------------------------------
sudo mkdir -p "$RELEASES" "$DATA" "$SHARED/live" "$SHARED/tips" /var/log/surgeindex
sudo chown -R ubuntu:ubuntu "$RELEASES" "$SHARED" /var/log/surgeindex

# --- disk guard (VPS has run near-full before) -------------------------
FREE_MB=$(df -Pm "$ROOT" | awk 'NR==2{print $4}')
if [ "$FREE_MB" -lt 2500 ]; then
  log "only ${FREE_MB}MB free; pruning old releases first"
fi
# keep current + 2 newest others
for d in $(ls -1dt "$RELEASES"/* 2>/dev/null | tail -n +4); do
  [ "$(readlink -f "$d")" = "$PREV" ] && continue
  rm -rf "$d"
done

# --- fetch -------------------------------------------------------------
log "cloning $BRANCH @ $SHA -> $RELEASE"
git clone --quiet --branch "$BRANCH" "$REPO" "$RELEASE"
git -C "$RELEASE" checkout --quiet "$SHA"
printf 'BUILD_SHA=%s\n' "$SHA" > "$RELEASE/release.env"
chmod 0644 "$RELEASE/release.env"

cd "$RELEASE"
log "pnpm install"
pnpm install --frozen-lockfile --reporter=append-only

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
# merge optional keys pushed by GitHub Actions. Ingest keys go to trends.env
# (cron); keys the web process needs at runtime (live-blog admin token,
# donate channels) go to surgeindex.env, which surgeindex.service loads.
if [ -s /tmp/surgeindex-keys.env ]; then
  sudo touch /etc/surgeindex/trends.env
  while IFS= read -r kv; do
    k="${kv%%=*}"
    [[ "$k" =~ ^[A-Z_][A-Z0-9_]*$ ]] || continue
    case "$k" in
      LIVE_ADMIN_TOKEN|DONATE_*|TIPS_NOTIFY_EMAIL) target=/etc/surgeindex/surgeindex.env ;;
      *) target=/etc/surgeindex/trends.env ;;
    esac
    sudo sed -i "/^${k}=/d" "$target"
    printf '%s\n' "$kv" | sudo tee -a "$target" >/dev/null
    log "updated $k in $(basename "$target")"
  done < /tmp/surgeindex-keys.env
  grep -q '^TRENDS_DATA_DIR=' <(sudo cat /etc/surgeindex/trends.env) || echo "TRENDS_DATA_DIR=$DATA" | sudo tee -a /etc/surgeindex/trends.env >/dev/null
  sudo chown root:ubuntu /etc/surgeindex/trends.env; sudo chmod 0640 /etc/surgeindex/trends.env
fi
rm -f /tmp/surgeindex-keys.env
# same env files surgeindex.service loads, plus trends.env
for f in /etc/surgeindex/surgeindex.env /etc/surgeindex/turnstile.production.env /etc/surgeindex/resend.env /etc/surgeindex/trends.env; do
  load_env "$f"
done
export TRENDS_DATA_DIR="$DATA"
grep -q '^TRENDS_DATA_DIR=' <(sudo cat /etc/surgeindex/surgeindex.env) || \
  echo "TRENDS_DATA_DIR=$DATA" | sudo tee -a /etc/surgeindex/surgeindex.env >/dev/null

# --- data + build ------------------------------------------------------
log "seeding trends snapshot"
NODE_OPTIONS=--max-old-space-size=256 pnpm trends:ingest || log "ingest returned non-zero (boards may show Delayed)"

log "next build"
NODE_OPTIONS=--max-old-space-size=1536 pnpm build

# --- switch ------------------------------------------------------------
log "switching current -> $RELEASE"
ln -sfn "$RELEASE" "$ROOT/current"
sudo systemctl restart surgeindex.service

ok=0
for i in $(seq 1 30); do
  if curl -fsS -o /dev/null http://127.0.0.1:3211/ && curl -fsS -o /tmp/surgeindex-health.json http://127.0.0.1:3211/api/trends && head -c 1 /tmp/surgeindex-health.json | grep -q '{'; then ok=1; break; fi
  sleep 2
done

if [ "$ok" -ne 1 ]; then
  log "health check FAILED"
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    log "rolling back to $PREV"
    ln -sfn "$PREV" "$ROOT/current"
    sudo systemctl restart surgeindex.service
  fi
  exit 1
fi

# --- hourly ingest cron (idempotent) -----------------------------------
# The cron job runs as ubuntu without sudo. It used to read
# /etc/surgeindex/trends.env directly, which it cannot always do (directory
# permissions / older Node without process.loadEnvFile), so hourly runs lost
# YOUTUBE_API_KEY and flipped the YouTube boards to "Coming soon" one hour
# after every deploy. Give it a private copy it can always read.
INGEST_ENV="$SHARED/ingest.env"
( umask 077; sudo cat /etc/surgeindex/trends.env 2>/dev/null > "$INGEST_ENV.tmp" || : > "$INGEST_ENV.tmp" )
grep -q '^TRENDS_DATA_DIR=' "$INGEST_ENV.tmp" || echo "TRENDS_DATA_DIR=$DATA" >> "$INGEST_ENV.tmp"
chmod 0600 "$INGEST_ENV.tmp"; mv -f "$INGEST_ENV.tmp" "$INGEST_ENV"
if grep -q '^YOUTUBE_API_KEY=..*' "$INGEST_ENV"; then log "ingest env: YOUTUBE_API_KEY present"; else log "ingest env: YOUTUBE_API_KEY missing (YouTube boards stay Coming soon)"; fi
log "node $(node -v)"
CRON_LINE="5 * * * * cd $ROOT/current && TRENDS_ENV_FILE=$INGEST_ENV TRENDS_DATA_DIR=$DATA NODE_OPTIONS=--max-old-space-size=256 /usr/bin/flock -n /tmp/surgeindex-trends.lock timeout 300 node_modules/.bin/tsx scripts/ingest-trends.ts >> /var/log/surgeindex/trends-ingest.log 2>&1"
( crontab -l 2>/dev/null | grep -v 'scripts/ingest-trends.ts' ; echo "$CRON_LINE" ) | crontab -

log "deployed $SHA ($ID) OK"
