#!/usr/bin/env bash
set -euo pipefail

REPO_NAME="${GITHUB_REPO:?Set GITHUB_REPO like owner/repo}"

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI not found. Install gh to auto-create repo." >&2
  exit 1
fi

cd /home/r/coding/eth/agentic-token-lab

git init

git add .
git commit -m "Initial experimental protocol scaffold"

gh repo create "$REPO_NAME" --source=. --remote=origin --public --push
