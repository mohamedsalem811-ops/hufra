#!/usr/bin/env bash
# =============================================================================
# HUFRA (حفرة) — Automated GitHub iOS (.ipa) & Android (.apk) Cloud Build Script
# Pushes your project to GitHub, triggers the macOS Xcode (.ipa) and Ubuntu
# Gradle (.apk) GitHub Actions workflow, watches it live, and downloads the
# finished mobile packages into ./mobile-builds/
# =============================================================================
set -euo pipefail

LIVE_URL="${1:-https://hufra.pages.dev}"
REPO_NAME="${2:-hufra}"

echo "=== [1/4] Checking GitHub CLI (gh) authentication ==="
if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI (gh) is not installed. Install it from https://cli.github.com/ or push manually to GitHub and click Actions -> Mobile Build -> Run workflow."
  exit 1
fi

gh auth status || gh auth login

echo "=== [2/4] Committing code and syncing with GitHub repository '$REPO_NAME' ==="
if [ ! -d ".git" ]; then
  git init
fi
git branch -M main
git add .
git commit -m "chore: update mobile build" || true

if ! git remote get-url origin >/dev/null 2>&1; then
  gh repo create "$REPO_NAME" --private --source=. --remote=origin --push
else
  git push -u origin main
fi

echo "=== [3/4] Triggering iOS (.ipa) & Android (.apk) Cloud Build for $LIVE_URL ==="
gh workflow run mobile-build.yml -f server_url="$LIVE_URL"
sleep 4

RUN_ID=$(gh run list --workflow=mobile-build.yml --limit 1 --json databaseId --jq '.[0].databaseId')
echo "Watching workflow run #$RUN_ID (takes ~4-6 minutes on GitHub's macOS runner)..."
gh run watch "$RUN_ID" --exit-status

echo "=== [4/4] Downloading built iOS (.ipa) and Android (.apk) into ./mobile-builds ==="
rm -rf ./mobile-builds
mkdir -p ./mobile-builds
gh run download "$RUN_ID" --dir ./mobile-builds

echo ""
echo "============================================================================="
echo "✅ Mobile builds downloaded to ./mobile-builds:"
find ./mobile-builds -type f
echo "============================================================================="
