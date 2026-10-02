#!/bin/bash
# Tests for upload-stage-tracks.sh. node, rsync and curl are replaced by
# stand-ins on PATH, and the beat analysis's Python by one named in
# OMNIRAVE_BEAT_PYTHON, so nothing is built for real and nothing is uploaded.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$ROOT/scripts/upload-stage-tracks.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

STUBS="$WORK/stubs"
CALLS="$WORK/calls"
mkdir -p "$STUBS"

# node <build script> <mp3>: writes the two files next to the MP3 with the
# tag in BEATS_TAG (a wrong tag must stop the upload).
cat > "$STUBS/node" <<'EOF'
#!/bin/bash
echo "node $*" >> "$CALLS"
base="${2%.mp3}"
printf 'OMSP-spectrum' > "$base.spectrum"
printf '%s-beats' "${BEATS_TAG:-OMB4}" > "$base.beats"
EOF
# python <analysis script> <mp3>: writes the beat grid next to the MP3.
cat > "$STUBS/beat-python" <<'EOF'
#!/bin/bash
echo "python $*" >> "$CALLS"
printf '{}' > "${2%.mp3}.beatgrid.json"
EOF
# rsync: records its arguments.
cat > "$STUBS/rsync" <<'EOF'
#!/bin/bash
echo "rsync $*" >> "$CALLS"
exit "${RSYNC_EXIT:-0}"
EOF
# curl -sS -I <url>: answers like the site, with the local file's size plus
# SIZE_DELTA, and CURL_STATUS as the status.
cat > "$STUBS/curl" <<'EOF'
#!/bin/bash
url="${@: -1}"
echo "curl $url" >> "$CALLS"
name="${url##*/}"
size=$(wc -c < "$TRACKS/$name" | tr -d ' ')
printf 'HTTP/2 %s\r\ncontent-type: application/octet-stream\r\ncontent-length: %s\r\n\r\n' "${CURL_STATUS:-200}" "$((size + ${SIZE_DELTA:-0}))"
EOF
chmod +x "$STUBS"/*

failures=0
pass() { printf 'ok   %s\n' "$1"; }
fail() { printf 'FAIL %s\n' "$1"; failures=$((failures + 1)); }

# run <args...>: runs the script with the stand-ins; output in $OUT, status in $STATUS.
run() {
  : > "$CALLS"
  OUT="$(PATH="$STUBS:$PATH" CALLS="$CALLS" TRACKS="$TRACKS" SERVER="deploy@example.test" \
    OMNIRAVE_BEAT_PYTHON="${BEAT_PYTHON_STUB:-$STUBS/beat-python}" \
    SITE_ORIGIN="https://example.test" OMNIRAVE_BASE_PATH="/games/omnirave/play/" \
    bash "$SCRIPT" "$@" 2>&1)"
  STATUS=$?
}

new_tracks() {
  TRACKS="$WORK/tracks-$1"
  mkdir -p "$TRACKS"
  printf 'fake mp3 audio' > "$TRACKS/set-a.mp3"
  printf 'another fake mp3' > "$TRACKS/set-b.mp3"
}

new_tracks usage
run
[ "$STATUS" -ne 0 ] && grep -q "Usage" <<<"$OUT" && pass "refuses to run with no track" || fail "refuses to run with no track: $OUT"

run "$TRACKS/missing.mp3"
[ "$STATUS" -ne 0 ] && grep -q "Not found" <<<"$OUT" && pass "refuses a file that does not exist" || fail "missing file: $OUT"

printf 'x' > "$TRACKS/set-a.wav"
run "$TRACKS/set-a.wav"
[ "$STATUS" -ne 0 ] && grep -q "Not an .mp3" <<<"$OUT" && pass "refuses a file that is not an MP3" || fail "not an mp3: $OUT"

printf 'x' > "$TRACKS/bad name.mp3"
run "$TRACKS/set-a.mp3" "$TRACKS/bad name.mp3"
[ "$STATUS" -ne 0 ] && grep -q "track id 'bad name'" <<<"$OUT" && ! grep -q "^python\|^node\|^rsync" "$CALLS" \
  && pass "checks every track id before building or uploading anything" || fail "bad id: $OUT / $(cat "$CALLS")"

new_tracks happy
run "$TRACKS/set-a.mp3" "$TRACKS/set-b.mp3"
if [ "$STATUS" -eq 0 ] \
  && [ "$(grep -c '^python .*analyze-track-beats.py' "$CALLS")" = 2 ] \
  && [ "$(grep -c '^node .*build-track-spectrum.mjs' "$CALLS")" = 2 ] \
  && [ "$(grep -m1 -o '^[a-z]*' "$CALLS")" = python ] \
  && grep -q "^rsync -a --partial $TRACKS/set-a.mp3 $TRACKS/set-a.spectrum $TRACKS/set-a.beats deploy@example.test:/var/www/omnirave-audio/$" "$CALLS" \
  && grep -q "^curl https://example.test/games/omnirave/play/audio/set-b.beats$" "$CALLS" \
  && [ "$(grep -c '^curl ' "$CALLS")" = 6 ] \
  && grep -q "Uploaded and checked: set-a set-b" <<<"$OUT"; then
  pass "analyzes and builds, uploads the three files of each track and reads each one back from the site"
else
  fail "happy path: $OUT / $(cat "$CALLS")"
fi

# The built files are newer than the beat grid, and the grid newer than the
# MP3 (dated 2020 here; a real build comes minutes after each, a test within
# the same second).
touch -t 202001010000 "$TRACKS/set-a.mp3"
touch -t 202001010100 "$TRACKS/set-a.beatgrid.json"
run "$TRACKS/set-a.mp3"
[ "$STATUS" -eq 0 ] && ! grep -q "^python\|^node" "$CALLS" && grep -q "Beat grid is up to date" <<<"$OUT" \
  && pass "does not rebuild files newer than the MP3" || fail "up to date: $OUT / $(cat "$CALLS")"

# A new beat grid (the analysis rerun by hand): the beat file is rebuilt.
touch -t 202001010000 "$TRACKS/set-a.spectrum" "$TRACKS/set-a.beats"
run "$TRACKS/set-a.mp3"
[ "$STATUS" -eq 0 ] && ! grep -q "^python" "$CALLS" && grep -q "^node" "$CALLS" \
  && pass "rebuilds the beat file when the beat grid is newer" || fail "newer grid: $OUT / $(cat "$CALLS")"

touch "$TRACKS/set-a.mp3"
run "$TRACKS/set-a.mp3"
[ "$STATUS" -eq 0 ] && grep -q "^node" "$CALLS" && pass "rebuilds when the MP3 is newer" || fail "rebuild: $OUT"

new_tracks size
SIZE_DELTA=-3 run "$TRACKS/set-a.mp3"
[ "$STATUS" -ne 0 ] && grep -q "set-a.mp3 is .* bytes on the site but .* here" <<<"$OUT" \
  && pass "reports a file whose size on the site differs" || fail "size mismatch: $OUT"

new_tracks missing
CURL_STATUS=404 run "$TRACKS/set-a.mp3"
[ "$STATUS" -ne 0 ] && grep -q "answered 404" <<<"$OUT" && pass "reports a file the site does not serve" || fail "404: $OUT"

new_tracks upload
RSYNC_EXIT=12 run "$TRACKS/set-a.mp3"
[ "$STATUS" -ne 0 ] && grep -q "The upload of set-a failed" <<<"$OUT" && ! grep -q "^curl" "$CALLS" \
  && pass "stops when the upload fails" || fail "rsync failure: $OUT"

new_tracks tag
BEATS_TAG=OMB3 run "$TRACKS/set-a.mp3"
[ "$STATUS" -ne 0 ] && grep -q "is not a beat file (OMB4)" <<<"$OUT" && ! grep -q "^rsync" "$CALLS" \
  && pass "refuses to upload a beat file of an older format" || fail "old beats format: $OUT"

new_tracks python
BEAT_PYTHON_STUB="$WORK/no-such-python" run "$TRACKS/set-a.mp3"
[ "$STATUS" -ne 0 ] && grep -q "No Python for the beat analysis" <<<"$OUT" && ! grep -q "^node\|^rsync" "$CALLS" \
  && pass "stops with the setup step when the analysis Python is missing" || fail "no python: $OUT"

echo "$failures failed"
[ "$failures" -eq 0 ]
