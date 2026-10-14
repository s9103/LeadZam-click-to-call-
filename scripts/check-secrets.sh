#!/usr/bin/env bash
# Fails if anything that looks like a Firebase/Google credential is tracked by git.
# Run before every push:  ./scripts/check-secrets.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

status=0

# 1. File names that must never be tracked.
bad_files=$(git ls-files | grep -E '(^|/)(google-services\.json|\.env|service-account.*\.json|.*firebase-adminsdk.*\.json)$' || true)
if [ -n "$bad_files" ]; then
  echo "ERROR: credential files are tracked:"; echo "$bad_files"; status=1
fi

# 2. Content that looks like a private key or a Google API key.
hits=$(git grep -nE 'BEGIN (RSA )?PRIVATE KEY|"private_key"|AIza[0-9A-Za-z_-]{35}' -- . ':!scripts/check-secrets.sh' || true)
if [ -n "$hits" ]; then
  echo "ERROR: possible secrets found in tracked files:"; echo "$hits"; status=1
fi

# 3. Also check the full git history (a secret committed once and deleted is still leaked).
hist=$(git log --all -p -S'BEGIN PRIV''ATE KEY' --oneline | head -1 || true)
if [ -n "$hist" ]; then
  echo "ERROR: a private key appears in git history"; status=1
fi

[ "$status" -eq 0 ] && echo "OK: no credentials found in tracked files or history."
exit "$status"
