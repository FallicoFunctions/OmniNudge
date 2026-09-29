"""Prune disposable binary snapshots from completed character hair passes.

Top-level editable sources and the original `before/` build baseline are never
eligible. Pass scripts, reports, images, and textures are retained. Dry run is
the default; --apply is required to remove files. Recently written binaries
are protected so a concurrent authoring pass can finish safely.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
HAIR = REPO / 'assets-src/avatars/complete-pair-study/hair-likeness-20260921'
LFS_OBJECTS = REPO.parent / '.git-lfs' / 'objects'
DISPOSABLE_SUFFIXES = ('.blend', '.glb', '.glb.gz', '-vertex-mapping.json', 'candidate-mapping.json')


def candidates(root: Path, older_than: float, now: float | None = None) -> list[Path]:
    root = root.resolve(strict=True)
    cutoff = (time.time() if now is None else now) - older_than
    result = []
    for path in root.rglob('*'):
        if path.is_symlink() or not path.is_file():
            continue
        parts = path.relative_to(root).parts
        if len(parts) < 2 or parts[0] == 'before':
            continue
        if not path.name.endswith(DISPOSABLE_SUFFIXES):
            continue
        if path.stat().st_mtime >= cutoff:
            continue
        result.append(path)
    return sorted(result)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=HAIR)
    parser.add_argument('--older-than-hours', type=float, default=2)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--manifest', type=Path)
    parser.add_argument('--check-max-gib', type=float,
                        help='fail if all pass snapshots exceed this limit, regardless of age')
    parser.add_argument('--check-lfs-max-gib', type=float,
                        help='fail if this worktree Git LFS cache exceeds this limit')
    parser.add_argument('--lfs-root', type=Path, default=LFS_OBJECTS,
                        help='Git LFS object directory to check')
    args = parser.parse_args()
    if args.older_than_hours < 0:
        parser.error('--older-than-hours must be non-negative')
    if args.check_max_gib is not None and args.check_max_gib < 0:
        parser.error('--check-max-gib must be non-negative')
    if args.check_lfs_max_gib is not None and args.check_lfs_max_gib < 0:
        parser.error('--check-lfs-max-gib must be non-negative')
    if args.check_max_gib is not None or args.check_lfs_max_gib is not None:
        if args.apply:
            parser.error('storage checks cannot be combined with --apply')
        failed = False
        if args.check_max_gib is not None:
            limit = args.check_max_gib * 2**30
            # A fresh checkout may not include local study artifacts at all.
            all_snapshots = candidates(args.root, 0) if args.root.is_dir() else []
            usage = sum(path.stat().st_size for path in all_snapshots)
            print(f'Hair pass snapshots: {usage / 2**30:.2f} GiB across {len(all_snapshots)} files; limit {args.check_max_gib:g} GiB')
            if usage > limit:
                print('Run prune_hair_pass_snapshots.py to review and remove superseded pass copies', file=sys.stderr)
                failed = True
        if args.check_lfs_max_gib is not None:
            objects = (path for path in args.lfs_root.rglob('*') if path.is_file()) if args.lfs_root.is_dir() else ()
            usage = sum(path.stat().st_size for path in objects)
            print(f'Git LFS cache: {usage / 2**30:.2f} GiB; limit {args.check_lfs_max_gib:g} GiB')
            if usage > args.check_lfs_max_gib * 2**30:
                print('Run git lfs prune --dry-run, then git lfs prune to remove unneeded cache objects', file=sys.stderr)
                failed = True
        if failed:
            raise SystemExit(1)
        return
    root = args.root.resolve(strict=True)
    selected = candidates(root, args.older_than_hours * 3600)
    records = [{'path': str(p.relative_to(root)), 'bytes': p.stat().st_size} for p in selected]
    total = sum(item['bytes'] for item in records)
    if args.manifest:
        args.manifest.parent.mkdir(parents=True, exist_ok=True)
        args.manifest.write_text(json.dumps({
            'root': str(root), 'applied': args.apply,
            'olderThanHours': args.older_than_hours,
            'files': records, 'totalBytes': total,
        }, indent=2) + '\n')
    if args.apply:
        for path in selected:
            # A writer might have replaced a file since the scan. Preserve it
            # if it is now recent rather than racing the other chat.
            if path.exists() and not path.is_symlink() and path.stat().st_mtime < time.time() - args.older_than_hours * 3600:
                path.unlink()
    print(f"{'Removed' if args.apply else 'Eligible'} {len(records)} pass snapshots ({total / 2**30:.2f} GiB)")
    print('Protected: top-level sources, build baseline, recent files, reports, textures, and review images')


if __name__ == '__main__':
    main()
