#!/usr/bin/env bash
set -euo pipefail

run_guard_case() {
  local mode=$1
  bash --noprofile --norc -c '
    set -euo pipefail
    promotion_complete=0
    restore_boundary() { printf "RESTORE\n"; }
    promotion_guard() {
      local original_status=$?
      trap - EXIT HUP INT TERM
      if (( promotion_complete == 0 )); then
        restore_boundary
        exit 90
      fi
      exit "$original_status"
    }
    trap promotion_guard EXIT
    trap "exit 129" HUP
    trap "exit 130" INT
    trap "exit 143" TERM
    case "$1" in
      failure) false; printf "SURVIVED\n" ;;
      signal) kill -TERM "$$"; printf "SURVIVED\n" ;;
      success)
        promotion_complete=1
        trap - EXIT HUP INT TERM
        printf "PROMOTED\n"
        ;;
      *) exit 2 ;;
    esac
  ' guard-smoke "$mode"
}

for smoke_mode in failure signal; do
  set +e
  smoke_output="$(run_guard_case "$smoke_mode" 2>&1)"
  smoke_status=$?
  set -e
  test "$smoke_status" = '90'
  test "$smoke_output" = 'RESTORE'
done

success_output="$(run_guard_case success 2>&1)"
test "$success_output" = 'PROMOTED'

printf 'PASS nginx-promotion-guard: failures and signals restore once; success promotes without restore.\n'
