#!/usr/bin/env bash
# =============================================================================
# HUFRA (حفرة) - one-command deploy to YOUR OWN Cloudflare account.
#
# What it does (safe to re-run):
#   1. Checks you are authenticated (API token or `wrangler login`)
#   2. Finds or creates: R2 bucket, D1 database, KV namespace in YOUR account
#   3. Writes the real D1 / KV ids into wrangler.jsonc
#   4. Applies D1 migrations
#   5. Creates the Pages project, sets JWT_SECRET once, builds and deploys
#   6. Optionally creates / resets your super admin (ADMIN_EMAIL=...)
#
# Auth (pick one):
#   export CLOUDFLARE_API_TOKEN=...   # recommended, works in WSL/CI
#   npx wrangler login                # interactive browser login
#
# Optional env vars:
#   PROJECT=hufra            Pages project name (-> https://<PROJECT>.pages.dev)
#   CLOUDFLARE_ACCOUNT_ID=.. required only if your login has several accounts
#   RUN_TESTS=1              run the test suite first
#   ADMIN_EMAIL=you@x.com    create (or reset the password of) this super admin;
#                            the password is prompted for, or read from ADMIN_PASSWORD
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")"

PROJECT="${PROJECT:-hufra}"
DB_NAME="hufra-production"
BUCKET="hufra-photos"
KV_TITLE="hufra-cache"

step() { printf '\n=== %s ===\n' "$*"; }
die()  { printf '\nERROR: %s\n' "$*" >&2; exit 1; }
wr()   { npx --yes wrangler "$@"; }

# Pull the first JSON array out of mixed CLI output and print one field of the
# item whose <key> contains <needle>.  usage: pick_json <key> <needle> <field>
pick_json() {
  node -e '
    const [key, needle, field] = process.argv.slice(1);
    let s = require("fs").readFileSync(0, "utf8");
    const a = s.indexOf("["), b = s.lastIndexOf("]");
    if (a < 0 || b < a) process.exit(0);
    let arr; try { arr = JSON.parse(s.slice(a, b + 1)); } catch { process.exit(0); }
    const hit = arr.find(x => String(x[key] || "").includes(needle));
    if (hit) process.stdout.write(String(hit[field] || ""));
  ' "$@"
}

step "[1/8] Dependencies"
if [ ! -d node_modules ]; then npm install --legacy-peer-deps; else echo "node_modules present"; fi
if [ "${RUN_TESTS:-0}" = "1" ]; then npm test; fi

step "[2/8] Checking Cloudflare authentication"
# The old script hardcoded someone else's account id. Never reuse it.
if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "No CLOUDFLARE_API_TOKEN set; relying on 'wrangler login' session."
fi
WHO="$(wr whoami 2>&1 || true)"
if echo "$WHO" | grep -qi "not authenticated"; then
  die "Not authenticated. Set CLOUDFLARE_API_TOKEN (see header of deploy.sh) or run: npx wrangler login"
fi
echo "$WHO" | sed -n '1,25p'

if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  ACCOUNT_IDS="$(echo "$WHO" | grep -oE '[0-9a-f]{32}' | sort -u || true)"
  COUNT="$(echo "$ACCOUNT_IDS" | grep -c . || true)"
  if [ "$COUNT" = "1" ]; then
    export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_IDS"
    echo "Using account $CLOUDFLARE_ACCOUNT_ID"
  elif [ "$COUNT" -gt 1 ]; then
    die "Several accounts found. Re-run with: CLOUDFLARE_ACCOUNT_ID=<id> bash deploy.sh  (ids are listed above)"
  fi
else
  echo "Using account $CLOUDFLARE_ACCOUNT_ID"
fi

step "[3/8] R2 bucket '$BUCKET'"
if wr r2 bucket list 2>&1 | grep -q "$BUCKET"; then
  echo "exists"
else
  wr r2 bucket create "$BUCKET" || die "Could not create R2 bucket. Is R2 enabled in your Cloudflare dashboard (R2 -> Overview -> activate)? Token needs 'Workers R2 Storage: Edit'."
fi

step "[4/8] D1 database '$DB_NAME'"
DB_ID="$(wr d1 list --json 2>/dev/null | pick_json name "$DB_NAME" uuid || true)"
if [ -z "$DB_ID" ]; then
  wr d1 create "$DB_NAME" || die "Could not create D1 database (token needs 'D1: Edit')."
  DB_ID="$(wr d1 list --json 2>/dev/null | pick_json name "$DB_NAME" uuid || true)"
fi
[ -n "$DB_ID" ] || die "Could not determine the D1 database id."
echo "D1 id: $DB_ID"

step "[5/8] KV namespace '$KV_TITLE'"
KV_ID="$(wr kv namespace list 2>/dev/null | pick_json title "$KV_TITLE" id || true)"
if [ -z "$KV_ID" ]; then
  wr kv namespace create "$KV_TITLE" || die "Could not create KV namespace (token needs 'Workers KV Storage: Edit')."
  KV_ID="$(wr kv namespace list 2>/dev/null | pick_json title "$KV_TITLE" id || true)"
fi
[ -n "$KV_ID" ] || die "Could not determine the KV namespace id."
echo "KV id: $KV_ID"

step "[6/8] Writing ids into wrangler.jsonc"
DB_ID="$DB_ID" KV_ID="$KV_ID" node -e '
  const fs = require("fs");
  let s = fs.readFileSync("wrangler.jsonc", "utf8");
  s = s.replace(/("database_id"\s*:\s*")[^"]*(")/, "$1" + process.env.DB_ID + "$2");
  s = s.replace(/("kv_namespaces"\s*:\s*\[\s*\{[^}]*?"id"\s*:\s*")[^"]*(")/, "$1" + process.env.KV_ID + "$2");
  fs.writeFileSync("wrangler.jsonc", s);
'
grep -nE '"database_id"|"id"' wrangler.jsonc

step "[7/8] Applying D1 migrations"
wr d1 migrations apply "$DB_NAME" --remote

step "[8/8] Pages project '$PROJECT': create, secret, build, deploy"
if wr pages project list 2>&1 | grep -qw "$PROJECT"; then
  echo "Pages project exists"
else
  wr pages project create "$PROJECT" --production-branch main \
    || die "Could not create Pages project '$PROJECT'. If the name is taken, re-run with PROJECT=<other-name>."
fi

if wr pages secret list --project-name "$PROJECT" 2>&1 | grep -q "JWT_SECRET"; then
  echo "JWT_SECRET already set (kept)"
else
  SECRET="$(node -e 'process.stdout.write(require("crypto").randomBytes(32).toString("hex"))')"
  printf '%s' "$SECRET" | wr pages secret put JWT_SECRET --project-name "$PROJECT"
  echo "JWT_SECRET generated and stored in Cloudflare (not printed)."
fi

npm run build
wr pages deploy dist --project-name "$PROJECT" --branch main --commit-dirty=true

URL="https://${PROJECT}.pages.dev"

if [ -n "${ADMIN_EMAIL:-}" ]; then
  step "Super admin account '$ADMIN_EMAIL'"
  node scripts/set-admin-password.mjs --email "$ADMIN_EMAIL" --remote
  ADMIN_LINE="Admin login:  $ADMIN_EMAIL / the password you just set"
else
  ADMIN_LINE="Admin login:  none created. Run: npm run admin:set-password -- --email you@example.com"
fi

cat <<EOF

=============================================================================
DONE. Site:   $URL
$ADMIN_LINE
Admin panel:  $URL/admin

iOS app: GitHub -> Actions -> Mobile Build -> Run workflow -> server_url = $URL
=============================================================================
EOF

echo "Smoke test (may take ~20s for the first request to warm up):"
sleep 8
curl -s -o /dev/null -w "home: HTTP %{http_code}\n" "$URL/" || true
curl -s -o /dev/null -w "regions API: HTTP %{http_code}\n" "$URL/api/regions" || true
