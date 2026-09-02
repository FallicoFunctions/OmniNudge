#!/bin/bash
# Tests for block-destructive.sh.
#
# Two lists that matter equally. A guard that stops nothing is useless; a guard
# that stops ordinary work gets worked around, and then it stops nothing either.
#
# Run: .claude/hooks/block-destructive.test.sh

set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1
HOOK=.claude/hooks/block-destructive.sh
PASS=0; FAIL=0

# An allowed command produces no output at all, so an empty answer is "allow".
# Reading it as anything else made every allowed case look blocked, which is
# how the first run of this file reported 22 failures that were its own.
verdict() {
  local out
  out=$(printf '{"tool_input":{"command":%s}}' "$(printf '%s' "$1" | jq -Rs .)" | "$HOOK")
  if [ -z "$out" ]; then echo "allow"; return; fi
  printf '%s' "$out" | jq -r '.hookSpecificOutput.permissionDecision // "allow"'
}

blocks() {
  if [ "$(verdict "$1")" = "deny" ]; then PASS=$((PASS+1)); printf '  ok    blocks   %s\n' "$1"
  else FAIL=$((FAIL+1)); printf '  FAIL  ALLOWED  %s\n' "$1"; fi
}
allows() {
  if [ "$(verdict "$1")" = "allow" ]; then PASS=$((PASS+1)); printf '  ok    allows   %s\n' "$1"
  else FAIL=$((FAIL+1)); printf '  FAIL  BLOCKED  %s\n' "$1"; fi
}

echo "block-destructive.sh"
echo
echo "deleting something catastrophic"
blocks 'rm -rf /'
blocks 'rm -rf /*'
blocks 'rm -rf ~'
blocks 'rm -rf ~/'
blocks 'rm -rf $HOME'
blocks 'rm -rf ..'
blocks 'rm -rf ../..'
blocks 'rm -rf /usr'
blocks 'rm -rf /etc'
blocks 'rm -rf ~/Documents'
blocks 'rm -fr /'
blocks 'sudo rm -rf /'

echo
echo "deleting one ordinary file"
allows 'rm -f /tmp/scratch.txt'
allows 'rm -rf /tmp/review-replay.abc123'
allows 'rm -f /private/tmp/claude-501/session/notes.json'
allows 'rm -f .review/active'
allows 'rm -rf node_modules'
allows 'rm -f backend/internal/services/zz_probe_test.go'
allows 'rm -f "$TMPDIR/probe.log"'

echo
echo "running a destructive statement against a database"
blocks 'psql -c "DROP TABLE users"'
blocks 'psql $DATABASE_URL -c "DELETE FROM media_files"'
blocks 'psql -c "TRUNCATE TABLE omnichat_generation_jobs"'
blocks 'mysql -e "DROP DATABASE omninudge"'
blocks 'echo "DROP TABLE users" | psql'
blocks 'dropdb omninudge'
blocks 'sqlite3 app.db "DELETE FROM sessions"'

echo
echo "writing or reading SQL that is only ever text"
allows 'grep -rn "DELETE FROM" backend/internal/models/'
allows 'cat backend/internal/models/omnichat_omniai_likeness_reroll.go'
allows "cat > /tmp/x.go <<'EOF'
tx.Exec(ctx, \`DELETE FROM omnichat_omniai_likeness_candidates WHERE persona_id = \$1\`)
EOF"
allows 'git commit -m "fix: stop the DELETE FROM running twice"'
# The shape that actually got blocked while writing this feature: the table
# name ends the line and the clauses that bound it are on the next one. Built
# from parts so this file can be edited without tripping the guard it tests.
DESTRUCTIVE_VERB="DELETE FROM"
allows "cat > /tmp/probe.go <<'EOF'
	rows, err := tx.Query(ctx, \`
		${DESTRUCTIVE_VERB} omnichat_omniai_likeness_candidates
		 WHERE persona_id = \$1 AND owner_user_id = \$2
		RETURNING media_file_id
	\`)
EOF"
allows "grep -rn '${DESTRUCTIVE_VERB}' backend/internal/models/"
allows "printf 'DROP TABLE IF EXISTS scratch;\n' > /tmp/rollback.sql"
allows 'go test ./internal/models/ -run TestDiscarding'

echo
echo "rewriting published history"
blocks 'git push --force origin main'
blocks 'git push -f'
blocks 'git reset --hard origin/main'
allows 'git push origin main'
allows 'git reset --soft HEAD~1'
allows 'git log --oneline -5'

echo
echo "reading credentials"
blocks 'cat .env'
blocks 'cat backend/.env'
blocks 'head -5 frontend/.env.local'
blocks 'source .env'
blocks 'grep SECRET backend/.env'
allows 'cat backend/.env.example'
allows 'ls -la backend | grep env'
allows 'grep -rn "OMNICHAT_EXPLICIT" backend/internal/config/'

echo
printf '%s passed, %s failed\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
