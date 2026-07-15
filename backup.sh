#!/usr/bin/env bash
set -euo pipefail

# ─── backup.sh: sync all app data from the old Supabase DB → the lupp DB ─────
# Full-snapshot copy, re-runnable. What it does, in one transaction on the
# target:
#   1. TRUNCATEs every app table on the target (never _prisma_migrations)
#   2. rebuilds `users` from Supabase `public.profiles ⋈ auth.users`
#      (bcrypt password hashes survive, emails lowercased to match the API's
#      sign-in normalization, email_confirmed_at carried over)
#   3. loads a data-only pg_dump of the 20 shared tables
# then verifies row counts table-by-table.
#
# ⚠ DESTRUCTIVE ON THE TARGET: everything written through the new API since
# the last sync is lost. Only makes sense while Supabase is still the source
# of truth (i.e. before cutover). Requires --yes (or typing "yes").
#
# Credentials come from the SRC_DB / DST_DB env vars (full postgres URLs) —
# never hardcode them here; this file lives in a public repo. Either export
# them, or put the two exports in a gitignored `backup.env` next to this
# script and it will be sourced automatically:
#   export SRC_DB='postgresql://user:pass@host:5432/db?sslmode=require'
#   export DST_DB='postgres://user:pass@host:5432/db'
#
# Usage:  ./backup.sh [--yes]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/backup.env" ]]; then
  # shellcheck source=/dev/null
  source "${SCRIPT_DIR}/backup.env"
fi
[[ -n "${SRC_DB:-}" ]] || { echo "error: SRC_DB is not set (source postgres URL)." >&2; exit 1; }
[[ -n "${DST_DB:-}" ]] || { echo "error: DST_DB is not set (target postgres URL)." >&2; exit 1; }

# The 20 tables with identical column sets in both databases, plus the
# users/auth_tokens pair that only exists on the target.
TABLES=(
  analytics_events comments custom_page_videos custom_pages discount_coupons
  feed_settings integration_secrets integration_webhook_events integrations
  master_console_audit_logs plans product_variants products store_members
  stores subscriptions video_likes video_products videos widgets
)

C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_BLUE=$'\033[34m'
C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'
log()  { printf '%s\n' "${C_BLUE}▸${C_RESET} $*"; }
ok()   { printf '%s\n' "${C_GREEN}✓${C_RESET} $*"; }
warn() { printf '%s\n' "${C_YELLOW}⚠${C_RESET} $*" >&2; }
err()  { printf '%s\n' "${C_RED}✗${C_RESET} $*" >&2; exit 1; }

command -v pg_dump >/dev/null 2>&1 || err "pg_dump not found — install postgresql-client."
command -v psql   >/dev/null 2>&1 || err "psql not found — install postgresql-client."

psql "$SRC_DB" -Atc "select 1" >/dev/null || err "cannot reach the source (Supabase) database."
psql "$DST_DB" -Atc "select 1" >/dev/null || err "cannot reach the target (lupp) database."
ok "both databases reachable"

# ── preflight summary + confirmation ─────────────────────────────────────────
src_users="$(psql "$SRC_DB" -Atc "select count(*) from public.profiles")"
dst_users="$(psql "$DST_DB" -Atc "select count(*) from public.users")"
src_events="$(psql "$SRC_DB" -Atc "select count(*) from public.analytics_events")"
dst_events="$(psql "$DST_DB" -Atc "select count(*) from public.analytics_events")"
log "${C_BOLD}source${C_RESET}: ${src_users} profiles, ${src_events} analytics_events"
log "${C_BOLD}target${C_RESET}: ${dst_users} users, ${dst_events} analytics_events"

warn "this OVERWRITES the target with the source snapshot — data created on"
warn "the target since the last sync (new users, videos, analytics…) is LOST."
if [[ "${1:-}" != "--yes" ]]; then
  read -r -p "Type 'yes' to continue: " answer
  [[ "$answer" == "yes" ]] || err "aborted (target untouched)."
fi

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

# ── export from the source ───────────────────────────────────────────────────
log "Exporting users (profiles ⋈ auth.users) from the source"
psql "$SRC_DB" -c "\copy (
    select p.id, p.name, lower(u.email), u.encrypted_password, 'agent',
           p.avatar_url, p.created_at, p.updated_at, u.email_confirmed_at
    from public.profiles p
    join auth.users u on u.id = p.id
    order by p.created_at
  ) to '${WORKDIR}/users.csv' with (format csv)" >/dev/null
ok "$(wc -l < "${WORKDIR}/users.csv") users exported"

log "Dumping data of the ${#TABLES[@]} shared tables (pg_dump --data-only)"
DUMP_ARGS=()
for t in "${TABLES[@]}"; do DUMP_ARGS+=(-t "public.${t}"); done
pg_dump "$SRC_DB" --data-only --no-owner --no-privileges "${DUMP_ARGS[@]}" \
  -f "${WORKDIR}/data.sql"
ok "dump written ($(du -h "${WORKDIR}/data.sql" | cut -f1))"

# ── load into the target (single transaction) ────────────────────────────────
# TRUNCATE first so the load is a clean full snapshot; CASCADE covers FKs.
# users go in before data.sql (stores/store_members/audit logs reference them);
# pg_dump orders the remaining tables to satisfy their mutual FKs.
TRUNCATE_LIST="public.users, public.auth_tokens"
for t in "${TABLES[@]}"; do TRUNCATE_LIST+=", public.${t}"; done

cat > "${WORKDIR}/pre.sql" <<EOF
truncate table ${TRUNCATE_LIST} cascade;
\\copy public.users (id, name, email, password_hash, role, avatar_url, created_at, updated_at, email_confirmed_at) from '${WORKDIR}/users.csv' with (format csv)
EOF

log "Loading into the target (single transaction)"
psql "$DST_DB" --single-transaction -v ON_ERROR_STOP=1 \
  -f "${WORKDIR}/pre.sql" -f "${WORKDIR}/data.sql" >/dev/null
ok "load committed"

# ── verify row counts ────────────────────────────────────────────────────────
# The target holds the dump's snapshot; a live source keeps growing while we
# verify, so src > tgt is expected drift (re-run at cutover picks it up).
# Only tgt > src — impossible for a clean truncate+load — is a real failure.
log "Verifying row counts (source vs target)"
fail=0
check() { # label src_query dst_query
  local s d
  s="$(psql "$SRC_DB" -Atc "$2")"
  d="$(psql "$DST_DB" -Atc "$3")"
  if [[ "$s" == "$d" ]]; then
    ok "$(printf '%-28s %s' "$1" "$s")"
  elif (( s > d )); then
    warn "$(printf '%-28s src=%s tgt=%s (source grew after the snapshot — re-run at cutover)' "$1" "$s" "$d")"
  else
    warn "$(printf '%-28s src=%s tgt=%s MISMATCH' "$1" "$s" "$d")"
    fail=1
  fi
}
check "profiles→users" "select count(*) from public.profiles" "select count(*) from public.users"
for t in "${TABLES[@]}"; do
  check "$t" "select count(*) from public.${t}" "select count(*) from public.${t}"
done

[[ "$fail" -eq 0 ]] || err "row-count mismatches found — review above."
ok "${C_BOLD}Sync complete${C_RESET} — target now mirrors the source snapshot."
