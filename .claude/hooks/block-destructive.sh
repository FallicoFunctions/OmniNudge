#!/bin/bash
# block-destructive.sh
# PreToolUse hook for Bash commands.
# Blocks obviously destructive operations before they execute.
#
# Precision is the whole job here. A guard that stops nothing is useless, and a
# guard that stops ordinary work gets worked around -- at which point it also
# stops nothing. Every rule below is paired with a case in
# block-destructive.test.sh saying what it must catch and what it must not.

INPUT=$(cat)

COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

deny() {
  printf '{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": %s}}' \
    "$(printf '%s' "$1" | jq -Rs .)"
  exit 0
}

# One spelling before any rule looks at it.
#
# Every rule below is about a path, and a rule that depends on how the path was
# written is not a rule about the path. Asking the guard about shapes nobody had
# listed found the same directory refused as ~/Documents and allowed as
# /Users/somebody/Documents, and $HOME refused bare but allowed in quotes.
#
# Only for matching. The command that runs is the one the caller wrote.
TARGET=$COMMAND
TARGET=${TARGET//\"/}
TARGET=${TARGET//\'/}
TARGET=${TARGET//\$\{HOME\}/\~}
TARGET=${TARGET//\$HOME/\~}
TARGET=${TARGET//\$\{PWD\}/.}
TARGET=${TARGET//\$PWD/.}
[ -n "${HOME:-}" ] && TARGET=${TARGET//$HOME/\~}
# A path that climbs back out is the place it climbs out to.
while [[ $TARGET == *"/../"* || $TARGET == *"/.."[[:space:]]* || $TARGET == *"/.." ]]; do
  before=$TARGET
  TARGET=$(printf '%s' "$TARGET" | sed -E 's#/[^/[:space:]]+/\.\.(/|$|[[:space:]])#\1#g; s#/\.\./#/#g; s#/\.\.$#/#')
  [ "$TARGET" = "$before" ] && break
done

# --- deleting something catastrophic ----------------------------------------
#
# What matters is the target, not the flags. The old rule fired on any rm whose
# argument merely began with "/", so deleting one named file under /tmp was
# refused exactly as hard as "rm -rf /", constantly, in ordinary work.
#
# A target with no name in it is a root, not a file: "/", "~", "..", "../.."
# and "/*" are made of nothing but separators and dots. The moment a real path
# component appears, somebody is naming something they meant -- so a named path
# two levels under home is left alone, deliberately. Deleting your own project
# directory is a real thing to do.
if echo "$TARGET" | grep -qE '(^|[;&|]|\s)rm\s+(-[a-zA-Z]+\s+)*(\$\{?HOME\}?|~|/|\.\.|\.)[/.*~]*(\s|[;&|]|$)'; then
  deny "Blocked: rm targeting the root of the filesystem, your home directory, or the working directory itself. Deleting a named path under one is fine; this names none. If intentional, run it manually."
fi

# One level under home is still somebody's whole Documents folder.
if echo "$TARGET" | grep -qE '(^|[;&|]|\s)rm\s+(-[a-zA-Z]+\s+)*(~|\$\{?HOME\}?)/[^/[:space:]]+/?(\s|[;&|]|$)'; then
  deny "Blocked: rm targeting a directory directly under your home. If intentional, run it manually."
fi

if echo "$TARGET" | grep -qE '(^|[;&|]|\s)rm\s+(-[a-zA-Z]+\s+)*/(usr|etc|bin|sbin|var|opt|Library|System|Applications|Users|Volumes)(/[^/[:space:]]+)?/?(\s|[;&|]|$)'; then
  deny "Blocked: rm targeting a system directory. If intentional, run it manually."
fi

# A glob is harmless where you are and fatal where a cd has just put you, so
# the pair is what matters rather than either half. "rm -rf *" on its own is
# somebody clearing a directory they are already in and know about.
if echo "$TARGET" | grep -qE '(^|[;&|]|\s)cd\s+(/|~|\.\.)[/~.]*\s*(;|&&|\|\|)\s*.*(^|[;&|]|\s)rm\s'; then
  deny "Blocked: a cd to the root of the filesystem or your home directory, followed by an rm in the same command. If intentional, run it manually."
fi

# --- running a destructive statement against a database ---------------------
#
# Only when something is actually going to run it. The old rule matched the SQL
# text anywhere in the command, so writing a migration, writing a repository
# method, grepping for a statement, or naming one in a commit message were all
# refused -- while `dropdb`, which needs no SQL at all, went through.
#
# The text alone is just text. A client is what makes it a command.
DB_CLIENT='psql|mysql|mariadb|sqlite3|pg_restore|mongosh|mongo|cockroach|clickhouse-client'
if echo "$COMMAND" | grep -qE "(^|[;&|]|\s)($DB_CLIENT)(\s|$)" \
  && echo "$COMMAND" | grep -qiE 'DROP\s+(TABLE|DATABASE|SCHEMA)|TRUNCATE\s+(TABLE\s+)?\S|DELETE\s+FROM\s+\S'; then
  deny "Blocked: a destructive SQL statement being run against a database. If intentional, run it manually."
fi
if echo "$COMMAND" | grep -qE '(^|[;&|]|\s)(dropdb|dropuser)(\s|$)'; then
  deny "Blocked: dropping a database or role. If intentional, run it manually."
fi

# --- rewriting published history --------------------------------------------
# +ref is a force push written as a refspec, and --mirror is one that can
# delete branches nobody asked it to.
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*(--force|--force-with-lease|--mirror)|git\s+push\s+-f\b|git\s+push\s+\S+\s+\+|git\s+reset\s+--hard\s+(HEAD~|origin)'; then
  deny "Blocked force push or hard reset. If intentional, run it manually."
fi

# --- reading credentials -----------------------------------------------------
#
# Anywhere, not only in the working directory. The old rule required whitespace
# immediately before ".env", so backend/.env and frontend/.env.local -- the two
# that actually hold anything -- were not covered at all.
#
# .env.example and .env.sample are templates and are deliberately readable.
# Asked as two questions rather than one pattern: is something here capable of
# reading a file, and is a .env named anywhere in the command. Trying to match
# both in one expression is what made the old rule depend on the flags sitting
# between them.
if echo "$TARGET" | grep -qE '(^|[;&|]|\s)(cat|less|more|head|tail|source|\.|grep|rg|sed|awk|bat|xxd|od|strings|cp|scp|rsync|open)(\s|$)' \
  && echo "$TARGET" | grep -qE '(^|[[:space:]"'"'"'=(])([^[:space:]"'"'"';|&]*/)?\.env([.-][a-zA-Z0-9_]+)*($|[[:space:]"'"'"';|&)])' \
  && ! echo "$TARGET" | grep -qE '\.env\.(example|sample|template|dist)'; then
  deny "Blocked .env file access. Credentials should not be read by the agent."
fi

exit 0
