#!/bin/bash
# Tests for ci-checks-on-staged.sh. Each case is a way the gate could pass a
# commit CI would fail: not wired in, blind to a file type, or silently
# skipping when its linter is missing.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

gate=scripts/ci-checks-on-staged.sh
pass=0
fail=0
ts_fixture=frontend/src/__ci_checks_fixture__.ts
go_dir=backend/internal/cichecksfixture
trap 'rm -rf "$ts_fixture" "$go_dir"' EXIT

expect() { # name, want (pass|fail), command...
  local name=$1 want=$2
  shift 2
  if "$@" >/tmp/ci-checks-test.out 2>&1; then got=pass; else got=fail; fi
  if [ "$got" = "$want" ]; then
    pass=$((pass+1))
  else
    fail=$((fail+1))
    echo "FAIL: $name: wanted $want, got $got"
    sed 's/^/    /' /tmp/ci-checks-test.out | tail -8
  fi
}

# A guard nobody runs is no guard: the hook must call it.
expect "the pre-commit hook runs the gate" pass grep -q "bash $gate" frontend/.husky/pre-commit

# The gate and CI must lint the same files. Dropping --build-tags=integration
# from CI alone would pass every commit here while CI saw none of
# internal/integration again.
ci_lint_args=$(sed -n '/golangci-lint-action/,/args:/s/^ *args: *//p' .github/workflows/ci.yml)
gate_lint_args=$(sed -n 's/.*golangci-lint run \(.*\) \$packages.*/\1/p' "$gate")
expect "the gate lints with CI's golangci-lint arguments" pass \
  test -n "$ci_lint_args" -a "$ci_lint_args" = "$gate_lint_args"

# Formatting, the check that blocked every frontend pull request.
printf 'export const   fixture = {a:1}\n' >"$ts_fixture"
expect "unformatted TypeScript is refused" fail env CI_CHECKS_FILES="$ts_fixture" bash "$gate"
printf 'export const fixture = { a: 1 };\n' >"$ts_fixture"
expect "formatted TypeScript passes" pass env CI_CHECKS_FILES="$ts_fixture" bash "$gate"

# The other two steps of the same required check. Each fixture is formatted,
# so it is the check named here that refuses it, not prettier.
printf 'export const fixture = 1;\nconst unused = 2;\n' >"$ts_fixture"
expect "an eslint error is refused" fail env CI_CHECKS_FILES="$ts_fixture" bash "$gate"
printf "export const fixture: number = 'not a number';\n" >"$ts_fixture"
expect "a type error is refused by tsc -b" fail env CI_CHECKS_FILES="$ts_fixture" bash "$gate"
rm -f "$ts_fixture"

# Lint, the check that blocked every Go pull request.
mkdir -p "$go_dir"
cat >"$go_dir/fixture.go" <<'EOF'
package cichecksfixture

import "os"

// Leak drops the error from Close, which errcheck refuses.
func Leak() {
	f, err := os.Open("missing")
	if err != nil {
		return
	}
	f.Close()
}
EOF
expect "an unchecked Close is refused by golangci-lint" fail env CI_CHECKS_FILES="$go_dir/fixture.go" bash "$gate"

# internal/integration's files all carry //go:build integration, and a linter
# run without that tag saw none of them. The clean untagged file keeps the
# package lintable without the tag, so only a linter that reads tagged files
# can refuse this.
cat >"$go_dir/fixture.go" <<'EOF'
package cichecksfixture

// Fine is formatted and lint-clean.
func Fine() int { return 1 }
EOF
cat >"$go_dir/fixture_integration.go" <<'EOF'
//go:build integration

package cichecksfixture

import "os"

// LeakTagged drops the error from Close, behind the integration tag.
func LeakTagged() {
	f, err := os.Open("missing")
	if err != nil {
		return
	}
	f.Close()
}
EOF
expect "an unchecked Close behind the integration tag is refused" fail env CI_CHECKS_FILES="$go_dir/fixture_integration.go" bash "$gate"
rm -f "$go_dir/fixture_integration.go"

cat >"$go_dir/fixture.go" <<'EOF'
package cichecksfixture

// Fine is formatted and lint-clean.
func Fine() int { return 1 }
EOF
expect "clean Go passes" pass env CI_CHECKS_FILES="$go_dir/fixture.go" bash "$gate"

printf 'package cichecksfixture\nfunc  Fine() int { return 1 }\n' >"$go_dir/fixture.go"
expect "unformatted Go is refused by gofmt" fail env CI_CHECKS_FILES="$go_dir/fixture.go" bash "$gate"

# Missing the linter must refuse, not skip: a skip passes exactly the commits
# this gate exists to stop.
printf 'package cichecksfixture\n\n// Fine is formatted and lint-clean.\nfunc Fine() int { return 1 }\n' >"$go_dir/fixture.go"
go_bin=$(dirname "$(command -v go)")
expect "a missing golangci-lint refuses the commit" fail env PATH="$go_bin:/usr/bin:/bin" CI_CHECKS_FILES="$go_dir/fixture.go" bash "$gate"

# Nothing relevant staged: nothing to check, nothing refused.
expect "a commit touching neither tree passes" pass env CI_CHECKS_FILES="README.md" bash "$gate"

echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
