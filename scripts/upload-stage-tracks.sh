#!/bin/bash
# Uploads stage tracks for OmniRave, with the two files the lights need.
#
#   bash scripts/upload-stage-tracks.sh path/to/<trackId>.mp3 [more.mp3 ...]
#
# For each track:
#   1. Builds <trackId>.spectrum and <trackId>.beats next to the MP3
#      (omnirave-babylon/scripts/build-track-spectrum.mjs; needs node and
#      ffmpeg). Skipped when both are newer than the MP3.
#   2. Checks that each built file starts with its format tag.
#   3. Uploads the three files to the server's audio folder.
#   4. Reads each file back from the public site and compares its size, so a
#      failed or partial upload is reported here, not found later as a silent
#      stage or lights that guess.
#
# The file name is the track id: a playlist entry plays <trackId>.mp3, so the
# id in the setlist must match the name exactly. Adding the setlist entry is
# a separate step (RUNBOOK.md, "Stage audio").
#
# Settings come from deploy-lib.sh (SERVER, SITE_ORIGIN, OMNIRAVE_BASE_PATH).
# OMNIRAVE_AUDIO_REMOTE_PATH sets the server folder.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/deploy-lib.sh"

OMNIRAVE_AUDIO_REMOTE_PATH="${OMNIRAVE_AUDIO_REMOTE_PATH:-/var/www/omnirave-audio}"
BUILD_SCRIPT="$PROJECT_ROOT/omnirave-babylon/scripts/build-track-spectrum.mjs"
PUBLIC_AUDIO_URL="${SITE_ORIGIN%/}${OMNIRAVE_BASE_PATH%/}/audio"

fail() {
  printf "${RED}%s${NC}\n" "$1" >&2
  exit 1
}

file_size() { stat -f %z "$1" 2>/dev/null || stat -c %s "$1"; }

# The first four bytes of a file, as text.
file_tag() { head -c 4 "$1"; }

[ $# -gt 0 ] || fail "Usage: bash scripts/upload-stage-tracks.sh path/to/<trackId>.mp3 [more.mp3 ...]"

# Check every argument before building or uploading anything.
for mp3 in "$@"; do
  [ -f "$mp3" ] || fail "Not found: $mp3"
  case "$mp3" in
    *.mp3) ;;
    *) fail "Not an .mp3 file: $mp3" ;;
  esac
  track_id="$(basename "$mp3" .mp3)"
  [[ "$track_id" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] \
    || fail "The track id '$track_id' has characters a URL does not keep as they are. Use letters, digits, '.', '_' and '-'."
done

uploaded=()
for mp3 in "$@"; do
  track_id="$(basename "$mp3" .mp3)"
  folder="$(cd "$(dirname "$mp3")" && pwd)"
  spectrum="$folder/$track_id.spectrum"
  beats="$folder/$track_id.beats"
  printf "${BLUE}== %s${NC}\n" "$track_id"

  if [ -f "$spectrum" ] && [ -f "$beats" ] && [ "$spectrum" -nt "$mp3" ] && [ "$beats" -nt "$mp3" ]; then
    echo "Spectrum and beat files are up to date."
  else
    node "$BUILD_SCRIPT" "$mp3" || fail "Could not build the spectrum and beat files for $track_id."
  fi
  [ "$(file_tag "$spectrum")" = "OMSP" ] || fail "$spectrum is not a spectrum file."
  [ "$(file_tag "$beats")" = "OMB3" ] || fail "$beats is not a beat file (OMB3)."

  rsync -a --partial "$folder/$track_id.mp3" "$spectrum" "$beats" "$SERVER:$OMNIRAVE_AUDIO_REMOTE_PATH/" \
    || fail "The upload of $track_id failed."

  for file in "$folder/$track_id.mp3" "$spectrum" "$beats"; do
    name="$(basename "$file")"
    expected="$(file_size "$file")"
    # Header lines end in CR LF; drop the CR before reading any value.
    headers="$(curl -sS -I "$PUBLIC_AUDIO_URL/$name" | tr -d '\r')" || fail "Could not read $PUBLIC_AUDIO_URL/$name."
    status="$(printf '%s\n' "$headers" | awk 'toupper($1) ~ /^HTTP/ {code=$2} END {print code}')"
    length="$(printf '%s\n' "$headers" | awk -F': ' 'tolower($1) == "content-length" {print $2}' | tail -1)"
    [ "$status" = "200" ] || fail "$PUBLIC_AUDIO_URL/$name answered $status, not 200."
    [ "$length" = "$expected" ] || fail "$PUBLIC_AUDIO_URL/$name is $length bytes on the site but $expected here."
    echo "Live: $name ($expected bytes)"
  done
  uploaded+=("$track_id")
done

printf "${GREEN}Uploaded and checked: %s${NC}\n" "${uploaded[*]}"
echo "Next: add each track id to a stage setlist (RUNBOOK.md, \"Stage audio\")."
