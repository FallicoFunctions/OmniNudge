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

# --- deleting something catastrophic ----------------------------------------
#
# What matters is the target, not the flags. The old rule fired on any rm whose
# argument merely began with "/", so deleting one named file under /tmp was
# refused exactly as hard as "rm -rf /" -- and the refusal turned up constantly
# in ordinary work.
#
# Three shapes are worth stopping, and nothing else:
#   the root of something  -- /, ~, $HOME, ., .., or those with a trailing slash
#   a bare glob at a root  -- /*, ~/*, $HOME/*
#   a system directory     -- /usr, /etc, /bin, /Library, /Users/someone, and
#                             anything one level under them
#
# A named path deeper than that is somebody deleting a file they meant to
# delete.
# A target with no name in it is a root, not a file. "/", "~", "..", "../..",
# "/*" and "$HOME/" are all made of nothing but separators and dots; the moment
# a real path component appears, somebody is naming something they meant.
if echo "$COMMAND" | grep -qE '(^|[;&|]|\s)rm\s+(-[a-zA-Z]+\s+)*(\$\{?HOME\}?|~|/|\.\.|\.)[/.*~]*(\s|[;&|]|$)'; then
  deny "Blocked: rm targeting the root of the filesystem, your home directory, or the working directory itself. Deleting a named path under one is fine; this names none. If intentional, run it manually."
fi

# One level under home is still somebody's whole Documents folder.
if echo "$COMMAND" | grep -qE '(^|[;&|]|\s)rm\s+(-[a-zA-Z]+\s+)*(~|\$\{?HOME\}?)/[^/[:space:]]+/?(\s|[;&|]|$)'; then
  deny "Blocked: rm targeting a directory directly under your home. If intentional, run it manually."
fi

if echo "$COMMAND" | grep -qE '(^|[;&|]|\s)rm\s+(-[a-zA-Z]+\s+)*/(usr|etc|bin|sbin|var|opt|Library|System|Applications|Users|Volumes)(/[^/[:space:]]+)?/?(\s|[;&|]|$)'; then
  deny "Blocked: rm targeting a system directory. If intentional, run it manually."
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
if echo "$COMMAND" | grep -qE 'git\s+push\s+.*(--force|--force-with-lease)|git\s+push\s+-f\b|git\s+reset\s+--hard\s+(HEAD~|origin)'; then
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
if echo "$COMMAND" | grep -qE '(^|[;&|]|\s)(cat|less|more|head|tail|source|\.|grep|rg|sed|awk|bat|xxd|od|strings|cp|scp|rsync|open)(\s|$)' \
  && echo "$COMMAND" | grep -qE '(^|[[:space:]"'"'"'=(])([^[:space:]"'"'"';|&]*/)?\.env([.-][a-zA-Z0-9_]+)*($|[[:space:]"'"'"';|&)])' \
  && ! echo "$COMMAND" | grep -qE '\.env\.(example|sample|template|dist)'; then
  deny "Blocked .env file access. Credentials should not be read by the agent."
fi

exit 0
