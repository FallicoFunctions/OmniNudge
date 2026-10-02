"""Finds every beat, bar and drop of a stage track, for build-track-spectrum.mjs.

    python scripts/analyze-track-beats.py public/audio/<trackId>.mp3

Writes <trackId>.beatgrid.json next to the input. build-track-spectrum.mjs
puts its beats and drops into the track's .beats file (src/media/trackBeats.ts).

The lights used to find kicks and drops with rules of their own (a strong
rise in the bass band; a kick after 6 s without one). Those rules held in
120-130 BPM house and missed most beats and drops in the faster parts of a
set: at 176 BPM fewer than a third of the beats had a kick, and 26 minutes
went by without a drop. Here:

  - Beats and bar starts come from Beat This! (Foscarin, Schlueter and
    Widmer, ISMIR 2024; https://github.com/CPJKU/beat_this), a trained beat
    and downbeat tracker that holds across genres and tempo changes.
  - A drop is a bar start where the low end (30-150 Hz) and the whole mix
    get much louder: the mean level, in decibels, of the DROP_WINDOW_BARS
    bars after it against the DROP_WINDOW_BARS bars before it. Decibels are
    averaged rather than power, so a loud bar does not outweigh a quiet one
    and the jump peaks on the drop itself, not bars before it. The jump has
    to be the largest within DROP_SPACING_BARS bars each side, and at least
    DROP_MIN_JUMP_DB.

Each beat gets a count aligned to the bars: 4 x the bars started before it,
plus its place in its bar (0 on a bar start, at most 3). So "every 16th
beat" lands on every fourth bar start, as a tracker that misses a beat or
hears a 5-beat bar does not shift it for the rest of the track.

Needs ffmpeg, and Python with Beat This! and its dependencies:

    pip install torch soundfile "git+https://github.com/CPJKU/beat_this.git"
"""

import json
import os
import subprocess
import sys

import numpy as np
import torch
from beat_this.inference import Audio2Beats

SAMPLE_RATE = 22050
FFT_SIZE = 4096
HOP = 512
LOW_BAND_HZ = (30, 150)
# A jump in the low end counts fully, one in the whole mix half.
FULL_MIX_WEIGHT = 0.5
DROP_WINDOW_BARS = 4
DROP_SPACING_BARS = 8
DROP_MIN_JUMP_DB = 10
# Weaker jumps are kept as candidates, so a listening review can judge them.
CANDIDATE_MIN_JUMP_DB = 6


def decode(path):
    raw = subprocess.run(
        ['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(SAMPLE_RATE), '-f', 'f32le', '-'],
        capture_output=True, check=True,
    ).stdout
    return np.frombuffer(raw, np.float32)


def levels(signal):
    """Low-band and whole-mix level in decibels per hop, and the hop times."""
    freqs = np.fft.rfftfreq(FFT_SIZE, 1 / SAMPLE_RATE)
    low_bins = (freqs >= LOW_BAND_HZ[0]) & (freqs < LOW_BAND_HZ[1])
    window = np.hanning(FFT_SIZE).astype(np.float32)
    frames = np.lib.stride_tricks.sliding_window_view(signal, FFT_SIZE)[::HOP]
    low = np.empty(len(frames))
    full = np.empty(len(frames))
    for start in range(0, len(frames), 4096):  # in blocks: the whole set at once is gigabytes
        power = np.abs(np.fft.rfft(frames[start:start + 4096] * window, axis=1)) ** 2
        low[start:start + 4096] = power[:, low_bins].sum(1)
        full[start:start + 4096] = power.sum(1)
    times = np.arange(len(frames)) * HOP / SAMPLE_RATE
    return times, 10 * np.log10(low + 1e-10), 10 * np.log10(full + 1e-10)


def bar_counts(beats, downbeats):
    """Each beat's count; the beats before the first bar start count 0."""
    counts = np.zeros(len(beats), dtype=np.int64)
    bars, place = 0, 0
    for i, is_bar in enumerate(np.isin(beats, downbeats)):
        if is_bar:
            bars, place = bars + 1, 0
        else:
            place += 1
        if bars:
            counts[i] = 4 * (bars - 1) + min(place, 3)
    return counts


def drop_jumps(bar_times, times, low_db, full_db):
    """Each bar start's jump in decibels (NaN near the ends)."""
    sums = [np.concatenate([[0], np.cumsum(v)]) for v in (low_db, full_db)]

    def mean(values, start, end):
        i, j = np.searchsorted(times, start), np.searchsorted(times, end)
        return (values[j] - values[i]) / max(1, j - i)

    jumps = np.full(len(bar_times), np.nan)
    w = DROP_WINDOW_BARS
    for k in range(w, len(bar_times) - w):
        before, at, after = bar_times[k - w], bar_times[k], bar_times[k + w]
        low = mean(sums[0], at, after) - mean(sums[0], before, at)
        full = mean(sums[1], at, after) - mean(sums[1], before, at)
        jumps[k] = low + FULL_MIX_WEIGHT * full
    return jumps


def main():
    path = sys.argv[1]
    signal = decode(path)
    device = 'mps' if torch.backends.mps.is_available() else 'cpu'
    beats, downbeats = Audio2Beats(device=device)(signal, SAMPLE_RATE)
    beats, downbeats = np.asarray(beats, float), np.asarray(downbeats, float)
    counts = bar_counts(beats, downbeats)

    times, low_db, full_db = levels(signal)
    bar_index = np.flatnonzero(np.isin(beats, downbeats))
    jumps = drop_jumps(beats[bar_index], times, low_db, full_db)
    s = DROP_SPACING_BARS
    peaks = [k for k in range(len(jumps))
             if np.isfinite(jumps[k]) and jumps[k] == np.nanmax(jumps[max(0, k - s):k + s + 1])]
    drops = [int(bar_index[k]) for k in peaks if jumps[k] >= DROP_MIN_JUMP_DB]
    candidates = [[round(float(beats[bar_index[k]]), 3), round(float(jumps[k]), 2)]
                  for k in peaks if jumps[k] >= CANDIDATE_MIN_JUMP_DB]

    out = os.path.splitext(path)[0] + '.beatgrid.json'
    with open(out, 'w') as f:
        json.dump({
            'version': 1,
            'beats': [[round(float(t), 4), int(c)] for t, c in zip(beats, counts)],
            'drops': drops,
            'candidates': candidates,
        }, f)
    print(f'{out}: {len(beats)} beats, {len(bar_index)} bars, {len(drops)} drops, {len(candidates)} candidates')


if __name__ == '__main__':
    main()
