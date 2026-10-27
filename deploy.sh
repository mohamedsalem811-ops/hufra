#!/usr/bin/env bash
# =============================================================================
# HUFRA (حفرة) — One-Command Cloudflare Shell Deployment Script
# Pre-configured with your exact Cloudflare IDs:
#   - Account / R2 ID: 58e029f210710e960c440658719af807
#   - D1 Database ID:  1a28d545-16ac-4062-ac5f-4348d9edf6cc
#   - KV Namespace ID: e926e97015c54e1e979ff8eb3ba0e92c
#   - Admin Login:     admin@hufra.ly / Hufra@Admin2026!
# =============================================================================
set -euo pipefail

export CLOUDFLARE_ACCOUNT_ID="58e029f210710e960c440658719af807"

echo "=== [1/7] Installing dependencies ==="
npm install --legacy-peer-deps

echo "=== [2/7] Running test suite ==="
npm test

echo "=== [3/7] Ensuring R2 bucket 'hufra-photos' exists ==="
npx wrangler r2 bucket create hufra-photos 2>/dev/null || echo "R2 bucket 'hufra-photos' already exists."

echo "=== [4/7] Applying all D1 database migrations to production ==="
npx wrangler d1 migrations apply hufra-production --remote

echo "=== [5/7] Ensuring super_admin (admin@hufra.ly / Hufra@Admin2026!) is active in D1 ==="
npx wrangler d1 execute hufra-production --remote --command "INSERT INTO users (email, password_hash, role, code, locale, display_name, consent_at) VALUES ('admin@hufra.ly', 'pbkdf2\$100000\$MDEyMzQ1Njc4OWFiY2RlZg==\$lPahV731SKJt5rMZA80HBOQmAH8lO/34xSztRjUiKL0=', 'super_admin', '', 'ar', 'إدارة حفرة', strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, role = 'super_admin', deleted_at = NULL;"

echo "=== [6/7] Ensuring Cloudflare Pages project 'hufra' exists ==="
npx wrangler pages project create hufra --production-branch main 2>/dev/null || echo "Pages project 'hufra' already exists."

echo "=== [7/7] Building and deploying HUFRA to Cloudflare Pages ==="
npm run deploy

echo ""
echo "============================================================================="
echo "✅ HUFRA is deployed!"
echo "Admin Login: admin@hufra.ly"
echo "Password:    Hufra@Admin2026!"
echo "============================================================================="
