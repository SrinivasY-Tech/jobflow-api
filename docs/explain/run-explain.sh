#!/usr/bin/env bash
# Captures EXPLAIN (ANALYZE, BUFFERS) for the job-list query shapes.
#
#   bash docs/explain/run-explain.sh before
#   bash docs/explain/run-explain.sh after-indexes
#
# Each query is run twice and only the second (warm cache) plan is saved, so
# "before" and "after" compare plans, not disk-cache luck.
# Requires the compose stack to be running (uses the postgres container).
set -euo pipefail
export MSYS_NO_PATHCONV=1 # Git Bash on Windows: don't rewrite paths

LABEL="${1:?usage: run-explain.sh <label>}"
OUT="$(dirname "$0")/$LABEL"
mkdir -p "$OUT"

psql_q() { docker compose exec -T postgres psql -U "${DB_USER:-jobflow}" -d "${DB_NAME:-jobflow}" -X "$@"; }

COLS='"id", "title", "status", "priority", "created_at", "updated_at"'
ORDER='ORDER BY priority DESC, created_at ASC, id ASC'

# Cursor for keyset pagination = the last row of the page that OFFSET 10000 would return.
CURSOR=$(psql_q -At -F '|' -c "SELECT priority, created_at, id FROM jobs WHERE status = 'NEW' $ORDER OFFSET 9999 LIMIT 1")
IFS='|' read -r CP CC CI <<<"$CURSOR"

declare -A Q
Q[q1_new_first_page]="SELECT $COLS FROM jobs WHERE status = 'NEW' $ORDER LIMIT 20 OFFSET 0"
Q[q2_new_count]="SELECT COUNT(1) FROM jobs WHERE status = 'NEW'"
Q[q3_new_offset_10000]="SELECT $COLS FROM jobs WHERE status = 'NEW' $ORDER LIMIT 20 OFFSET 10000"
Q[q4_new_min_priority_4]="SELECT $COLS FROM jobs WHERE status = 'NEW' AND priority >= 4 $ORDER LIMIT 20 OFFSET 0"
Q[q5_done_first_page]="SELECT $COLS FROM jobs WHERE status = 'DONE' $ORDER LIMIT 20 OFFSET 0"
Q[q6_new_keyset_after_10000]="SELECT $COLS FROM jobs WHERE status = 'NEW' AND (priority < $CP OR (priority = $CP AND (created_at, id) > ('$CC', $CI))) $ORDER LIMIT 20"
# Same keyset page, split into two index RANGES. The mixed directions
# (priority DESC, created_at ASC) mean the OR above can't be one range; each
# UNION ALL branch is one, and Merge Append stops after 20 rows.
Q[q7_new_keyset_union_after_10000]="(SELECT $COLS FROM jobs WHERE status = 'NEW' AND priority = $CP AND (created_at, id) > ('$CC', $CI) $ORDER LIMIT 20) UNION ALL (SELECT $COLS FROM jobs WHERE status = 'NEW' AND priority < $CP $ORDER LIMIT 20) $ORDER LIMIT 20"

for name in $(printf '%s\n' "${!Q[@]}" | sort); do
  sql="EXPLAIN (ANALYZE, BUFFERS, COSTS, TIMING) ${Q[$name]}"
  psql_q -q -c "$sql" >/dev/null
  { echo "-- $name"; echo "-- ${Q[$name]}"; echo; psql_q -q -c "$sql"; } >"$OUT/$name.txt"
  printf '%-28s %s\n' "$name" "$(grep -E 'Execution Time' "$OUT/$name.txt" | sed 's/^ *//')"
done

psql_q -q -c "SELECT indexrelname AS index, pg_size_pretty(pg_relation_size(indexrelid)) AS size
              FROM pg_stat_user_indexes WHERE relname = 'jobs' ORDER BY 1" | tee "$OUT/index_sizes.txt"
