#!/usr/bin/env bash

# Read-only VPS acceptance probe. It never installs packages, reloads Nginx,
# changes firewall rules, alters systemd, restarts services, or touches a
# database. Host installation remains an explicit operator/runbook action.
set -u -o pipefail

repo_root="${SURGEINDEX_REPO_ROOT:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
base_url="${SURGEINDEX_BASE_URL:-https://surgeindex.lol}"
evidence_file="${VPS_READINESS_EVIDENCE_FILE:-}"
nginx_bin="${SURGEINDEX_NGINX_BIN:-$(command -v nginx 2>/dev/null || true)}"
results=()
overall="PASS"

usage() {
  printf '%s\n' "Usage: scripts/vps-readiness.sh [--base-url URL] [--evidence-file PATH]"
  printf '%s\n' "Default mode is read-only. Use PRODUCTION_RUNBOOK.md for installation or remediation."
}

while (($# > 0)); do
  case "$1" in
    --base-url)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      base_url="$2"
      shift 2
      ;;
    --evidence-file)
      [[ $# -ge 2 ]] || { usage >&2; exit 2; }
      evidence_file="$2"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

record() {
  local name="$1"
  local result="$2"
  local detail="$3"
  results+=("${name}|${result}|${detail}")
  printf '%-32s %-8s %s\n' "$name" "$result" "$detail"
  if [[ "$result" == "FAIL" ]]; then
    overall="FAIL"
  elif [[ "$result" == "BLOCKED" || "$result" == "PENDING" ]] && [[ "$overall" == "PASS" ]]; then
    overall="BLOCKED"
  fi
}

command_status() {
  local command_name="$1"
  if command -v "$command_name" >/dev/null 2>&1; then
    record "command:${command_name}" "PASS" "available"
  else
    record "command:${command_name}" "BLOCKED" "not installed on this host"
  fi
}

contains_pattern() {
  local pattern="$1"
  local file="$2"
  if command -v rg >/dev/null 2>&1; then
    rg -q "$pattern" "$file"
  else
    grep -Eq "$pattern" "$file"
  fi
}

service_units=(
  surgeindex.service
  surgeindex-traffic-aggregation.service
  surgeindex-scoring.service
  surgeindex-ga4-core.service
  surgeindex-ga4-realtime.service
  surgeindex-ga4-health.service
  surgeindex-ga4-backfill.service
  surgeindex-boost-pace.service
  surgeindex-boost-aggregate.service
  surgeindex-boost-complete.service
  surgeindex-boost-underdelivery.service
  surgeindex-boost-reconcile-payments.service
  surgeindex-boost-release-reservations.service
  surgeindex-higuppy-revenue.service
  surgeindex-postgres-backup.service
  surgeindex-postgres-backup-offsite.service
  surgeindex-postgres-backup-verify.service
)

timer_units=(
  surgeindex-traffic-aggregation.timer
  surgeindex-scoring.timer
  surgeindex-ga4-core.timer
  surgeindex-ga4-realtime.timer
  surgeindex-ga4-health.timer
  surgeindex-ga4-backfill.timer
  surgeindex-boost-pace.timer
  surgeindex-boost-aggregate.timer
  surgeindex-boost-complete.timer
  surgeindex-boost-underdelivery.timer
  surgeindex-boost-reconcile-payments.timer
  surgeindex-boost-release-reservations.timer
  surgeindex-higuppy-revenue.timer
  surgeindex-postgres-backup.timer
  surgeindex-postgres-backup-offsite.timer
  surgeindex-postgres-backup-verify.timer
)

script_assets=(
  surgeindex-postgres-backup
  surgeindex-postgres-backup-offsite
  surgeindex-postgres-backup-verify
  surgeindex-postgres-restore
)

printf '%s\n' "SurgeIndex VPS readiness (read-only)"
printf '%s\n' "base_url=${base_url}"
printf '%s\n' "release_sha=${GITHUB_SHA:-unknown}"

missing_assets=0
for unit in "${service_units[@]}" "${timer_units[@]}"; do
  [[ -f "$repo_root/deploy/vps/$unit" ]] || missing_assets=$((missing_assets + 1))
done
if [[ "$missing_assets" -eq 0 ]]; then
  record "repository VPS assets" "PASS" "all expected service/timer files present"
else
  record "repository VPS assets" "FAIL" "missing_files=${missing_assets}"
fi

missing_scripts=0
for script in "${script_assets[@]}"; do
  [[ -f "$repo_root/deploy/vps/$script" ]] || missing_scripts=$((missing_scripts + 1))
done
if [[ "$missing_scripts" -eq 0 ]]; then
  record "repository backup assets" "PASS" "backup and restore helpers present"
else
  record "repository backup assets" "FAIL" "missing_scripts=${missing_scripts}"
fi

if contains_pattern 'SURGEINDEX_DB_BIND_ADDRESS:-127\.0\.0\.1' "$repo_root/docker-compose.yml"; then
  record "database bind configuration" "PASS" "Compose default is loopback-only"
else
  record "database bind configuration" "FAIL" "loopback-only Compose default not found"
fi

if contains_pattern 'proxy_set_header X-Forwarded-For ""' "$repo_root/deploy/vps/surgeindex.nginx.conf" && contains_pattern 'proxy_set_header X-Real-IP' "$repo_root/deploy/vps/surgeindex.nginx.conf"; then
  record "proxy header policy" "PASS" "Nginx clears client XFF and sets trusted X-Real-IP"
else
  record "proxy header policy" "FAIL" "expected proxy header policy not found"
fi

for command_name in docker systemctl journalctl ss ufw nft curl df pg_restore age aws; do
  command_status "$command_name"
done
if [[ -n "$nginx_bin" && -x "$nginx_bin" ]]; then
  record "command:nginx" "PASS" "available"
else
  record "command:nginx" "BLOCKED" "not installed on this host"
fi

if command -v docker >/dev/null 2>&1; then
  if docker info >/dev/null 2>&1; then
    record "docker daemon" "PASS" "daemon read-back completed"
  else
    record "docker daemon" "BLOCKED" "Docker CLI is present but the daemon is not readable"
  fi
fi

if [[ -n "$nginx_bin" && -x "$nginx_bin" ]]; then
  if "$nginx_bin" -t >/dev/null 2>&1; then
    record "nginx -t" "PASS" "effective syntax accepted"
  else
    record "nginx -t" "FAIL" "Nginx rejected the effective configuration"
  fi
  if "$nginx_bin" -T >/dev/null 2>&1; then
    record "nginx -T" "PASS" "effective configuration read-back completed"
  else
    record "nginx -T" "FAIL" "effective configuration read-back failed"
  fi
else
  record "nginx configuration" "BLOCKED" "nginx command unavailable"
fi

if command -v ss >/dev/null 2>&1; then
  app_listener="$(ss -ltnH 2>/dev/null | awk '$4 ~ /(^|:)3211$/ {print $4}' | tr '\n' ' ')"
  if [[ "$app_listener" == *"127.0.0.1:3211"* || "$app_listener" == *"[::1]:3211"* ]]; then
    if printf '%s\n' "$app_listener" | grep -Eq '(^|[[:space:]])(0\.0\.0\.0|\*):3211([[:space:]]|$)'; then
      record "application listener" "FAIL" "non-loopback listener observed"
    else
      record "application listener" "PASS" "loopback-only listener observed"
    fi
  elif [[ -n "$app_listener" ]]; then
    record "application listener" "FAIL" "non-loopback listener observed"
  else
    record "application listener" "PENDING" "port 3211 is not listening at probe time"
  fi
else
  record "application listener" "BLOCKED" "ss command unavailable"
fi

if command -v ss >/dev/null 2>&1; then
  listener="$(ss -ltnH 2>/dev/null | awk '$4 ~ /(^|:)55433$/ {print $4}' | tr '\n' ' ')"
  if [[ "$listener" == *"127.0.0.1:55433"* || "$listener" == *"[::1]:55433"* ]]; then
    if printf '%s\n' "$listener" | grep -Eq '(^|[[:space:]])(0\.0\.0\.0|\*):55433([[:space:]]|$)'; then
      record "PostgreSQL listener" "FAIL" "non-loopback listener observed"
    else
      record "PostgreSQL listener" "PASS" "loopback-only listener observed"
    fi
  elif [[ -n "$listener" ]]; then
    record "PostgreSQL listener" "FAIL" "non-loopback listener observed"
  else
    record "PostgreSQL listener" "PENDING" "port 55433 is not listening at probe time"
  fi
else
  record "PostgreSQL listener" "BLOCKED" "ss command unavailable"
fi

if command -v ufw >/dev/null 2>&1; then
  if ufw status 2>/dev/null | grep -q 'Status: active'; then
    record "UFW" "PASS" "active status read back"
  else
    record "UFW" "FAIL" "UFW is not reported active"
  fi
else
  record "UFW" "BLOCKED" "ufw command unavailable"
fi

if command -v nft >/dev/null 2>&1; then
  if nft list ruleset >/dev/null 2>&1; then
    record "nftables" "PASS" "ruleset read-back completed"
  else
    record "nftables" "BLOCKED" "ruleset could not be read without changing it"
  fi
else
  record "nftables" "BLOCKED" "nft command unavailable"
fi

if command -v systemctl >/dev/null 2>&1; then
  timer_readback="PASS"
  for unit in "${timer_units[@]}"; do
    if ! systemctl show "$unit" --property=LoadState --value >/dev/null 2>&1; then
      timer_readback="PENDING"
    fi
  done
  record "systemd timer inventory" "$timer_readback" "expected timer set inspected; no unit was changed"

  service_readback="PASS"
  for unit in "${service_units[@]}"; do
    if ! systemctl show "$unit" --property=LoadState,ActiveState,Result,ExecMainStatus --value >/dev/null 2>&1; then
      service_readback="PENDING"
    fi
  done
  record "systemd service inventory" "$service_readback" "expected service set inspected; no unit was changed"

  if systemctl is-active --quiet surgeindex.service; then
    record "application restart state" "PASS" "surgeindex.service is active"
  else
    record "application restart state" "PENDING" "surgeindex.service is not active at probe time"
  fi

  if command -v journalctl >/dev/null 2>&1; then
    journal_count=0
    for unit in "${service_units[@]}"; do
      if journalctl -u "$unit" -n 1 --no-pager >/dev/null 2>&1; then journal_count=$((journal_count + 1)); fi
    done
    if [[ "$journal_count" -eq "${#service_units[@]}" ]]; then
      record "systemd journal evidence" "PASS" "journal presence read for all expected services"
    else
      record "systemd journal evidence" "PENDING" "journal presence=${journal_count}/${#service_units[@]}"
    fi
  else
    record "systemd journal evidence" "BLOCKED" "journalctl command unavailable"
  fi
else
  record "systemd inventory" "BLOCKED" "systemctl command unavailable"
fi

if command -v curl >/dev/null 2>&1; then
  if curl --fail --silent --show-error --max-time 10 --output /dev/null "${base_url%/}/api/health/live"; then
    record "health live" "PASS" "HTTP endpoint responded successfully"
  else
    record "health live" "PENDING" "endpoint could not be read at probe time"
  fi
  if curl --fail --silent --show-error --max-time 10 --output /dev/null "${base_url%/}/api/health/ready"; then
    record "health ready" "PASS" "HTTP endpoint responded successfully"
  else
    record "health ready" "PENDING" "readiness endpoint requires release-host evidence"
  fi
else
  record "health endpoints" "BLOCKED" "curl command unavailable"
fi

if command -v df >/dev/null 2>&1; then
  read -r free_kb used_pct < <(df -Pk / 2>/dev/null | awk 'NR == 2 {gsub(/%/, "", $5); print $4, $5}')
  if [[ "$free_kb" =~ ^[0-9]+$ && "$used_pct" =~ ^[0-9]+$ ]]; then
    free_pct=$((100 - used_pct))
    if ((free_pct >= 20)); then
      record "disk headroom" "PASS" "root_free_kb=${free_kb}; free_percent=${free_pct}"
    else
      record "disk headroom" "FAIL" "root_free_kb=${free_kb}; free_percent=${free_pct}; minimum=20"
    fi
  else
    record "disk headroom" "PENDING" "numeric root filesystem read-back unavailable"
  fi
else
  record "disk headroom" "BLOCKED" "df command unavailable"
fi

record "admin jobs health" "PENDING" "requires an authenticated admin read-back; no cookie is accepted by default"
record "backup and restore evidence" "PENDING" "requires host backup, off-site verification, and disposable restore drill"
record "job failure behavior" "PENDING" "requires a controlled host failure/readiness exercise and safe journal reference"

if [[ -n "$evidence_file" ]]; then
  evidence_dir="$(dirname -- "$evidence_file")"
  mkdir -p "$evidence_dir"
  {
    printf 'schema_version=1\n'
    printf 'result=%s\n' "$overall"
    printf 'generated_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'release_sha=%s\n' "${GITHUB_SHA:-unknown}"
    printf 'base_url=%s\n' "$base_url"
    printf 'mode=read-only\n'
    printf 'secrets_printed=false\n'
    for item in "${results[@]}"; do printf 'gate=%s\n' "$item"; done
  } > "$evidence_file"
  printf '%s\n' "Evidence written to ${evidence_file}"
fi

printf '%s\n' "Overall: ${overall}"
if [[ "$overall" == "FAIL" ]]; then exit 1; fi
if [[ "$overall" == "BLOCKED" ]]; then exit 2; fi
