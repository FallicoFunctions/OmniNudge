#!/bin/bash
# Runs, on what is being committed, the checks CI requires before a merge.
#
# Commits here go straight to main, and CI sees them only when they are pushed.
# Lint and formatting drifted that way: 27 lint problems and 34 unformatted
# files reached main unseen, so "Backend (Go)" and "Frontend (TypeScript)" --
# both required -- failed on main itself. Every Dependabot pull request
# inherited the failure and stayed open, blocked, however harmless its update.
# The checks existed the whole time; nothing ran them before the code landed.
#
# The same tools and arguments as .github/workflows/ci.yml, pointed at the
# changed files and packages only, so a commit pays for what it touches.
#
# CI_CHECKS_FILES replaces the staged list, one repo-relative path per line.
# The test uses it; a commit never sets it.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

failed=0
if [ -n "${CI_CHECKS_FILES:-}" ]; then
  files=$CI_CHECKS_FILES
else
  files=$(git diff --cached --name-only --diff-filter=ACMR)
fi

go_files=$(printf '%s\n' "$files" | grep -E '^backend/.+\.go$' | sed 's#^backend/##')
if [ -n "$go_files" ]; then
  unformatted=$(cd backend && gofmt -l $go_files)
  if [ -n "$unformatted" ]; then
    echo "FAIL: not gofmt-formatted (CI's backend 'Check formatting' step):"
    printf '  %s\n' $unformatted
    failed=$((failed+1))
  fi

  if ! command -v golangci-lint >/dev/null 2>&1; then
    # Skipping would pass exactly the commits this exists to stop.
    echo "FAIL: golangci-lint is not installed; CI runs v2.12.2 on every push"
    failed=$((failed+1))
  else
    packages=$(printf '%s\n' $go_files | xargs -n1 dirname | sort -u | sed 's#^#./#')
    if ! (cd backend && golangci-lint run --timeout=10m $packages); then
      echo "FAIL: golangci-lint (CI's required 'Backend (Go)' check)"
      failed=$((failed+1))
    fi
  fi
fi

frontend_files=$(printf '%s\n' "$files" | grep -E '^frontend/src/.+\.(ts|tsx|css)$' | sed 's#^frontend/##')
if [ -n "$frontend_files" ]; then
  if ! (cd frontend && npx prettier --check $frontend_files --log-level warn); then
    echo "FAIL: prettier (CI's required 'Frontend (TypeScript)' check); run: npx prettier --write <files>"
    failed=$((failed+1))
  fi
fi

echo "$failed failed (CI checks on the commit)"
[ "$failed" -eq 0 ]
