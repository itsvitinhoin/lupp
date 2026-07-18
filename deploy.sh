#!/usr/bin/env bash
set -euo pipefail

# ─── Deploy: pull, build & (re)start ─────────────────────────────────────────
# Runs on the PRODUCTION server, inside this repo (build-on-server model):
#   pnpm install → build server + client → prisma migrate → restart.
# It does NOT pull — check out the desired commit yourself before running.
# Self-contained: no external lib scripts. It (re)writes an idempotent systemd
# unit for the API plus a single nginx vhost + certbot TLS for the public URL.
#
# Run model:
#   server         → node dist/server.js  (Fastify; 127.0.0.1:3333, systemd)
#   client → static Vite SPA built to dist/public, published to /var/www
#            and served by nginx from there (worker can't read /home/<user>)
# Both live on one domain: nginx proxies /api/ (+ /health, /docs) to the API
# and serves everything else as static SPA files with an index.html fallback.
#
# Deploy config (service name, domain, port, TLS email) is hardcoded below —
# this script reads nothing from the apps' .env. The server's runtime .env
# (server/.env) is loaded into the service by systemd via EnvironmentFile, and
# by prisma (dotenv) during migrations.
#
# Note: the API binds 0.0.0.0:3333 (src/server.ts) while nginx proxies to
# 127.0.0.1 — make sure the VPS firewall blocks direct access to :3333.
#
# Usage (from the repo root):  ./deploy.sh   (or `pnpm deploy:prod`).
# Self-elevates with sudo if not already root.

# ── Deploy config (hardcoded) ────────────────────────────────────────────────
SERVICE_NAME=luup-server
DOMAIN=luup.dzns.net            # single vhost: SPA + /api proxy
SERVER_PORT=3333                # matches the server default (src/env.ts)

LETSENCRYPT_EMAIL=""

# Space-separated client IPs exempt from the NGINX per-IP rate limit — e.g. a
# trusted integration server calling the API from a fixed IP. Inject via the
# deploy environment (keeps the actual IP out of source); empty = limit everyone.
RATE_LIMIT_ALLOWLIST_IPS="${RATE_LIMIT_ALLOWLIST_IPS:-}"

# ── UI helpers (inlined — this repo has no scripts/lib) ──────────────────────
C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_BLUE=$'\033[34m'
C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_GREEN=$'\033[32m'
log()  { printf '%s\n' "${C_BLUE}▸${C_RESET} $*"; }
ok()   { printf '%s\n' "${C_GREEN}✓${C_RESET} $*"; }
warn() { printf '%s\n' "${C_YELLOW}⚠${C_RESET} $*" >&2; }
err()  { printf '%s\n' "${C_RED}✗${C_RESET} $*" >&2; exit 1; }

# Capture the invoking user + their node/pnpm BEFORE self-elevating — sudo's
# env_reset drops $SUDO_USER and user-local (nvm/corepack) binaries, but the
# git pull, builds and migrations must run as this user, and systemd's
# ExecStart needs node's absolute path.
APP_USER="${APP_USER:-${SUDO_USER:-$(id -un)}}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"
PNPM_BIN="${PNPM_BIN:-$(command -v pnpm || true)}"

# Need root for systemd / nginx / certbot. Re-exec under sudo, forwarding the
# captured user + binaries (sudo would otherwise reset them). Already root → skip.
if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
  if command -v sudo >/dev/null 2>&1 && { sudo -n true 2>/dev/null || sudo -v; }; then
    exec sudo APP_USER="$APP_USER" NODE_BIN="$NODE_BIN" PNPM_BIN="$PNPM_BIN" \
      RATE_LIMIT_ALLOWLIST_IPS="$RATE_LIMIT_ALLOWLIST_IPS" bash "${BASH_SOURCE[0]}" "$@"
  fi
  echo "error: deploy needs root or sudo (systemd, nginx, TLS)." >&2
  exit 1
fi
[[ -n "$NODE_BIN" ]] || NODE_BIN="$(command -v node || true)"
[[ -n "$PNPM_BIN" ]] || PNPM_BIN="$(command -v pnpm || true)"

[[ -n "$NODE_BIN" ]] || err "node not found — install Node ≥ 24 on the server (server/package.json engines)."
[[ -n "$PNPM_BIN" ]] || err "pnpm not found — the build runs on the server and needs pnpm."
NODE_MAJOR="$("$NODE_BIN" -v | sed 's/^v//' | cut -d. -f1)"
[[ "$NODE_MAJOR" -ge 24 ]] || err "node ${NODE_MAJOR} is too old — the server requires Node ≥ 24."

# Repo root = this script's dir. Sanity-check the two apps this script deploys.
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[[ -d "$ROOT_DIR/server" && -d "$ROOT_DIR/client" ]] \
  || err "expected server/ and client/ under ${ROOT_DIR} — run this from the lupp repo root."

CLIENT_DIST="${ROOT_DIR}/client/dist/public"

# nginx serves the SPA from /var/www, NOT from the build dir: the worker
# (www-data) cannot traverse /home/<user> (0750 on modern Ubuntu), which
# surfaces as 403 Forbidden on every static file while the proxied /api
# keeps working. Publishing to a root-owned, world-readable tree avoids
# touching home-directory permissions.
WEB_ROOT="/var/www/${SERVICE_NAME}"

# Run a command as the app user with their node/pnpm on PATH (we're root here).
APP_PATH="$(dirname "$NODE_BIN"):$(dirname "$PNPM_BIN"):/usr/local/bin:/usr/bin:/bin"
run_as_app() { sudo -u "$APP_USER" env "PATH=${APP_PATH}" "$@"; }

# ── nginx conf.d fragments (http context, regenerated each deploy) ───────────
# Rate-limit zones. `geo` flags allow-listed IPs (0); `map` turns that into an
# empty key for them so limit_req/limit_conn skip those requests, while
# everyone else is keyed per-IP.
write_ratelimit_conf() {
  command -v nginx >/dev/null 2>&1 || return 0
  local conf="/etc/nginx/conf.d/ratelimit.conf" ip exempt=""
  for ip in $RATE_LIMIT_ALLOWLIST_IPS; do exempt+="    ${ip} 0;"$'\n'; done
  cat > "$conf" <<EOF
# Managed by deploy.sh — do not edit (regenerated on every deploy).
geo \$rl_limited {
    default 1;
${exempt}}
map \$rl_limited \$rl_key {
    0 "";
    1 \$binary_remote_addr;
}
limit_req_zone  \$rl_key zone=req_per_ip:10m rate=20r/s;
limit_conn_zone \$rl_key zone=conn_per_ip:10m;
limit_req_status  429;
limit_conn_status 429;
EOF
  return 0
}

# Response compression. JSON API payloads compress ~10-20x, so this is a
# large, behavior-neutral win for the heavy reads.
write_gzip_conf() {
  command -v nginx >/dev/null 2>&1 || return 0
  cat > "/etc/nginx/conf.d/gzip.conf" <<'EOF'
# Managed by deploy.sh — do not edit (regenerated on every deploy).
gzip on;
gzip_proxied any;
gzip_comp_level 5;
gzip_min_length 1024;
gzip_vary on;
gzip_types
    application/json
    application/javascript
    application/xml
    application/rss+xml
    text/plain
    text/css
    text/javascript
    image/svg+xml;
EOF
  return 0
}

# GeoIP2 lookups feeding $geo_* vars that the vhost forwards as X-Geo-*
# headers. Best-effort: if the ngx_http_geoip2 module or the MaxMind DB isn't
# present, fall back to empty `map`-defined vars so the vhost still validates
# (the IP still propagates via X-Real-IP / X-Forwarded-For / X-Client-IP).
# DB path overridable via GEOIP2_DB (default MaxMind GeoLite2-City).
write_geo_conf() {
  command -v nginx >/dev/null 2>&1 || return 0
  local conf="/etc/nginx/conf.d/geoip.conf"
  local db="${GEOIP2_DB:-/usr/share/GeoIP/GeoLite2-City.mmdb}"
  if nginx -V 2>&1 | grep -q 'geoip2' && [[ -f "$db" ]]; then
    cat > "$conf" <<EOF
# Managed by deploy.sh — GeoIP2 city lookups (do not edit).
geoip2 ${db} {
    \$geo_country_code source=\$remote_addr country iso_code;
    \$geo_city         source=\$remote_addr city names en;
    \$geo_region       source=\$remote_addr subdivisions 0 iso_code;
    \$geo_latitude     source=\$remote_addr location latitude;
    \$geo_longitude    source=\$remote_addr location longitude;
}
EOF
    ok "geoip2 enabled (${db})"
  else
    cat > "$conf" <<EOF
# Managed by deploy.sh — GeoIP2 unavailable; X-Geo-* resolve empty.
map \$host \$geo_country_code { default ""; }
map \$host \$geo_city         { default ""; }
map \$host \$geo_region       { default ""; }
map \$host \$geo_latitude     { default ""; }
map \$host \$geo_longitude    { default ""; }
EOF
    warn "geoip2 module/DB not found — X-Geo-* headers will be empty (IP still propagates)"
  fi
  return 0
}

# Single vhost: /api/ (+ /health, /docs) proxy to the Fastify server, all
# other paths serve the static SPA with an index.html fallback. Browsers hit
# this vhost directly, so it stamps the real client IP + GeoIP (X-Client-IP /
# X-Geo-*) on proxied requests. Best-effort: warns (doesn't abort) on problems.
setup_nginx_tls() {
  command -v nginx >/dev/null 2>&1 || { warn "nginx not installed — skipping vhost/TLS for ${DOMAIN}"; return 0; }
  local site="/etc/nginx/sites-available/${SERVICE_NAME}.conf"

  # Shared proxy directives for the API locations.
  local proxy_block
  IFS= read -r -d '' proxy_block <<PROXYEOF || true
        limit_req  zone=req_per_ip burst=40 nodelay;
        limit_conn conn_per_ip 20;
        proxy_pass http://127.0.0.1:${SERVER_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port \$server_port;
        proxy_set_header X-Request-ID \$request_id;
        proxy_set_header X-Client-IP \$remote_addr;
        proxy_set_header X-Geo-Country \$geo_country_code;
        proxy_set_header X-Geo-City \$geo_city;
        proxy_set_header X-Geo-Region \$geo_region;
        proxy_set_header X-Geo-Lat \$geo_latitude;
        proxy_set_header X-Geo-Lon \$geo_longitude;
        proxy_cache_bypass \$http_upgrade;
PROXYEOF

  cat > "$site" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    root ${WEB_ROOT};
    index index.html;

    location /api/ {
${proxy_block}
    }
    location = /health {
${proxy_block}
    }
    location /docs {
${proxy_block}
    }

    # Hashed Vite build assets — safe to cache forever.
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
        try_files \$uri =404;
    }

    # SPA entry point must revalidate so new deploys are picked up.
    location = /index.html {
        add_header Cache-Control "no-cache";
    }

    location / {
        limit_req  zone=req_per_ip burst=40 nodelay;
        limit_conn conn_per_ip 20;
        try_files \$uri \$uri/ /index.html;
    }
}
EOF
  mkdir -p /etc/nginx/sites-enabled
  ln -sf "$site" "/etc/nginx/sites-enabled/${SERVICE_NAME}.conf"
  if ! nginx -t >/dev/null 2>&1; then warn "nginx config test failed — leaving ${DOMAIN} unconfigured"; return 0; fi
  systemctl reload nginx || warn "nginx reload failed"
  if command -v certbot >/dev/null 2>&1; then
    local email_arg=(--register-unsafely-without-email)
    [[ -n "$LETSENCRYPT_EMAIL" ]] && email_arg=(-m "$LETSENCRYPT_EMAIL")
    # --keep-until-expiring keeps redeploys from hitting Let's Encrypt rate limits.
    certbot --nginx --non-interactive --agree-tos --redirect --keep-until-expiring "${email_arg[@]}" -d "$DOMAIN" \
      || warn "certbot failed for ${DOMAIN} (serving HTTP only for now)"
  else
    warn "certbot not installed — serving ${DOMAIN} over HTTP only"
  fi
  return 0
}

# Copy the built SPA into WEB_ROOT (running as root here) and make sure the
# whole tree is world-readable so the nginx worker can serve it.
publish_client_dist() {
  mkdir -p "$WEB_ROOT"
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete "${CLIENT_DIST}/" "${WEB_ROOT}/"
  else
    rm -rf "${WEB_ROOT:?}"/*
    cp -a "${CLIENT_DIST}/." "${WEB_ROOT}/"
  fi
  chmod -R a+rX "$WEB_ROOT"
  ok "client published to ${WEB_ROOT}"
  return 0
}

# ── systemd unit for the API (idempotent: rewrite + reload only on change) ───
deploy_server_service() {
  # EnvironmentFile first, then our Environment= lines, so NODE_ENV/PORT set
  # here win — the app listens where nginx proxies it, regardless of its .env.
  local unit="/etc/systemd/system/${SERVICE_NAME}.service" content
  content="$(cat <<EOF
[Unit]
Description=${SERVICE_NAME} (lupp API)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${ROOT_DIR}/server
EnvironmentFile=-${ROOT_DIR}/server/.env
Environment=NODE_ENV=production
Environment=PORT=${SERVER_PORT}
ExecStart=${NODE_BIN} dist/server.js
Restart=on-failure
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF
)"
  if [[ -f "$unit" ]] && diff -q <(printf '%s\n' "$content") "$unit" >/dev/null 2>&1; then
    ok "${SERVICE_NAME}.service unchanged"
  else
    printf '%s\n' "$content" > "$unit"
    systemctl daemon-reload
    systemctl enable "${SERVICE_NAME}.service" >/dev/null 2>&1 || true
    ok "${SERVICE_NAME}.service unit written"
  fi
  systemctl restart "${SERVICE_NAME}.service"
  ok "${SERVICE_NAME}.service (re)started"
  return 0
}

# Run the server's forward-only migrations as the app user (never root).
# prisma.config.ts loads dotenv, so DATABASE_URL comes from server/.env.
run_server_migrations() {
  local prisma="${ROOT_DIR}/server/node_modules/.bin/prisma"
  [[ -x "$prisma" ]] || { warn "prisma binary missing in server/node_modules — skipping migrations"; return 0; }
  log "Running prisma migrate deploy (as ${APP_USER})"
  ( cd "${ROOT_DIR}/server" && run_as_app "$prisma" migrate deploy ) \
    || warn "prisma migrate deploy reported errors (review above)"
  return 0
}

# ─── run ─────────────────────────────────────────────────────────────────────
log "${C_BOLD}Deploying lupp${C_RESET} in ${ROOT_DIR} (apps run as ${APP_USER}, node ${NODE_BIN})"

# Install + build as the app user (never root). The client gets its API/app
# origin baked in at build time (single-domain: both live on https://DOMAIN).
log "Installing dependencies (pnpm install --frozen-lockfile)"
( cd "$ROOT_DIR" && run_as_app "$PNPM_BIN" install --frozen-lockfile ) \
  || err "pnpm install failed"

log "Building server (@workspace/server → dist/server.js)"
( cd "$ROOT_DIR" && run_as_app "$PNPM_BIN" --filter @workspace/server build ) \
  || err "server build failed"

log "Building client (@workspace/lupp → client/dist/public)"
( cd "$ROOT_DIR" && run_as_app env "VITE_API_URL=https://${DOMAIN}" "VITE_APP_URL=https://${DOMAIN}" \
    "$PNPM_BIN" --filter @workspace/lupp build ) \
  || err "client build failed"
[[ -f "${CLIENT_DIST}/index.html" ]] || err "client build produced no ${CLIENT_DIST}/index.html"

# Rate-limit + geo zones must exist (http context) before the vhost references them.
write_ratelimit_conf
write_gzip_conf
write_geo_conf

# Server first (migrations + API), then publish the SPA where nginx can read
# it, then the vhost serving SPA + API proxy.
run_server_migrations
deploy_server_service
publish_client_dist
setup_nginx_tls

ok "Deploy complete (${SERVICE_NAME} API on :${SERVER_PORT} + static SPA at https://${DOMAIN})."
