#!/bin/bash
# post-edit-verify.sh
# Runs after every Write/Edit/MultiEdit. Blocks the agent from proceeding
# if lint fails on the modified file. Type-checking runs only at Stop
# (via stop-verify.sh) to avoid 10-30s tsc delays on every single edit.
#
# How it works:
# - Reads the tool event JSON from stdin
# - Extracts the file path that was just modified
# - Runs eslint (JS/TS) or ruff (Python) on the specific file
# - If lint fails, returns exit 2 with a block decision + the error output
# - The agent sees the errors and must fix them before continuing

INPUT=$(cat)

# Extract the file path from the tool event
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0  # No file path found, skip
fi

# Only check code files
if ! echo "$FILE_PATH" | grep -qE '\.(ts|tsx|js|jsx|py|rs)$'; then
  exit 0
fi

ERRORS=""

# --- TypeScript / JavaScript projects ---
if echo "$FILE_PATH" | grep -qE '\.(ts|tsx|js|jsx)$'; then

  # Run eslint on the specific file (fast, per-file)
  if [ -f ".eslintrc" ] || [ -f ".eslintrc.js" ] || [ -f ".eslintrc.json" ] || [ -f ".eslintrc.yml" ] || [ -f "eslint.config.js" ] || [ -f "eslint.config.mjs" ] || [ -f "eslint.config.ts" ]; then
    ESLINT_OUTPUT=$(npx eslint --quiet "$FILE_PATH" 2>&1)
    ESLINT_EXIT=$?
    if [ $ESLINT_EXIT -ne 0 ]; then
      ERRORS="${ERRORS}eslint errors in ${FILE_PATH}:\n${ESLINT_OUTPUT}\n\n"
    fi
  fi
fi

# --- Python projects ---
if echo "$FILE_PATH" | grep -qE '\.py$'; then
  # Run ruff on the specific file (fast, per-file)
  if command -v ruff &> /dev/null; then
    RUFF_OUTPUT=$(ruff check "$FILE_PATH" 2>&1)
    RUFF_EXIT=$?
    if [ $RUFF_EXIT -ne 0 ]; then
      ERRORS="${ERRORS}ruff errors in ${FILE_PATH}:\n${RUFF_OUTPUT}\n\n"
    fi
  fi
fi

# If errors found, block and report
if [ -n "$ERRORS" ]; then
  TRUNCATED=$(echo -e "$ERRORS" | head -50)
  echo "{\"decision\": \"block\", \"reason\": \"Lint failed. Fix before continuing:\n${TRUNCATED}\"}"
  exit 2
fi

exit 0
