#!/usr/bin/env python3
"""Repository-local Codex hook guards, implemented with the Python stdlib."""

from __future__ import annotations

import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
from typing import Any

MAX_UNTRACKED_BYTES = 10 * 1024 * 1024
TRUNCATION_PATTERNS = (
    re.compile(r"\boutput (?:was |is )?truncated\b", re.IGNORECASE),
    re.compile(r"\btruncated output\b", re.IGNORECASE),
    re.compile(r"\bshowing (?:the )?(?:first|last) .{0,30}\bof\b", re.IGNORECASE),
)


def repo_root() -> Path:
    result = subprocess.run(["git", "rev-parse", "--show-toplevel"], check=True, capture_output=True, text=True)
    return Path(result.stdout.strip()).resolve()


def read_event() -> dict[str, Any]:
    try:
        value = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError):
        return {}
    return value if isinstance(value, dict) else {}


def emit(value: dict[str, Any]) -> None:
    print(json.dumps(value, separators=(",", ":")))


def tool_input(event: dict[str, Any]) -> dict[str, Any]:
    value = event.get("tool_input", {})
    return value if isinstance(value, dict) else {}


def shell_command(event: dict[str, Any]) -> str:
    data = tool_input(event)
    value = data.get("command", data.get("cmd", ""))
    return value if isinstance(value, str) else ""


def shell_tokens(command: str) -> list[str]:
    try:
        return shlex.split(command, posix=True)
    except ValueError:
        return command.split()


def destructive_reason(command: str, root: Path) -> str | None:
    tokens = shell_tokens(command)
    lowered = [token.lower() for token in tokens]
    joined = " ".join(lowered)
    if re.search(r"(?:^|[;&|]\s*)git\s+reset\s+--hard(?:\s|$)", command, re.I):
        return "git reset --hard can discard work; use a non-destructive inspection or a disposable copy"
    if re.search(r"(?:^|[;&|]\s*)git\s+(?:checkout|restore)\s+--(?:\s|$)", command, re.I):
        return "bulk Git restoration can overwrite unrelated work; target a disposable copy instead"
    if re.search(r"(?:^|[;&|]\s*)git\s+clean\b[^;&|]*(?:\s-[a-z]*f|\s--force)", command, re.I):
        return "git clean with force can permanently delete untracked work"
    rm_positions = [index for index, token in enumerate(lowered) if token == "rm" or token.endswith("/rm")]
    for position in rm_positions:
        tail = lowered[position + 1 :]
        flags = "".join(token.lstrip("-") for token in tail if token.startswith("-") and token != "--")
        protected = {"/", ".", "..", "~", "$home", "${home}", str(root).lower()}
        normalized = {item.rstrip("/") for item in protected}
        if "r" in flags and "f" in flags and any(token.rstrip("/") in normalized for token in tail):
            return "recursive forced deletion targets a broad or protected directory"
    if re.search(r"(?:^|[;&|]\s*)git\s+add\s+(?:-a|--all|\.)(?:\s|$)", joined, re.I):
        oversized = oversized_untracked(root)
        if oversized:
            return "broad staging would include oversized untracked files: " + ", ".join(oversized[:3])
    return None


def oversized_untracked(root: Path) -> list[str]:
    result = subprocess.run(["git", "ls-files", "--others", "--exclude-standard", "-z"], cwd=root, check=True, capture_output=True)
    large: list[str] = []
    for raw in result.stdout.split(b"\0"):
        if not raw:
            continue
        relative = os.fsdecode(raw)
        candidate = root / relative
        try:
            if candidate.is_file() and candidate.stat().st_size > MAX_UNTRACKED_BYTES:
                large.append(relative)
        except OSError:
            continue
    return sorted(large)


def edited_paths(event: dict[str, Any], root: Path) -> list[Path]:
    data = tool_input(event)
    candidates = [data[key] for key in ("file_path", "path") if isinstance(data.get(key), str)]
    patch = data.get("patch") or data.get("input")
    if isinstance(patch, str):
        candidates.extend(re.findall(r"^\*\*\* (?:Add|Update) File: (.+)$", patch, re.MULTILINE))
    resolved: list[Path] = []
    for candidate in candidates:
        path = Path(candidate)
        path = (root / path).resolve() if not path.is_absolute() else path.resolve()
        if path.is_relative_to(root) and path.is_file() and path not in resolved:
            resolved.append(path)
    return resolved


def run_check(command: list[str], cwd: Path) -> str | None:
    try:
        result = subprocess.run(command, cwd=cwd, capture_output=True, text=True)
    except OSError as exc:
        return f"could not run {' '.join(command)}: {exc}"
    if result.returncode == 0:
        return None
    output = (result.stdout + result.stderr).strip()
    return output[-8000:] or f"{' '.join(command)} exited {result.returncode}"


def check_file(path: Path, root: Path) -> str | None:
    relative = path.relative_to(root)
    suffix = path.suffix.lower()
    if suffix == ".go":
        result = subprocess.run(["gofmt", "-d", str(path)], capture_output=True, text=True)
        if result.returncode != 0 or result.stdout:
            return result.stderr.strip() or f"{relative} is not gofmt-clean\n{result.stdout[-6000:]}"
    elif suffix in {".js", ".mjs", ".cjs"}:
        return run_check(["node", "--check", str(path)], root)
    elif suffix == ".py":
        try:
            compile(path.read_bytes(), str(relative), "exec")
        except (OSError, SyntaxError) as exc:
            return str(exc)
    elif suffix == ".json":
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            return str(exc)
    elif suffix in {".ts", ".tsx"} and relative.parts[0] == "frontend":
        eslint = root / "frontend/node_modules/.bin/eslint"
        if eslint.is_file():
            return run_check([str(eslint), str(path)], root / "frontend")
    return None


def cache_path(root: Path) -> Path:
    return root / ".codex/cache/touched.json"


def mark_touched(paths: list[Path], root: Path) -> None:
    target = cache_path(root)
    target.parent.mkdir(parents=True, exist_ok=True)
    existing: set[str] = set()
    if target.is_file():
        try:
            value = json.loads(target.read_text(encoding="utf-8"))
            if isinstance(value, list):
                existing.update(item for item in value if isinstance(item, str))
        except (OSError, json.JSONDecodeError):
            pass
    for path in paths:
        head = path.relative_to(root).parts[0]
        existing.add(head if head in {"frontend", "backend", "omnirave-babylon", "omnirave-web"} else "guardrails")
    target.write_text(json.dumps(sorted(existing)) + "\n", encoding="utf-8")


def find_truncation(value: Any) -> bool:
    if isinstance(value, dict):
        if value.get("truncated") is True:
            return True
        return any(find_truncation(item) for item in value.values())
    if isinstance(value, list):
        return any(find_truncation(item) for item in value)
    if isinstance(value, str):
        return any(pattern.search(value) for pattern in TRUNCATION_PATTERNS)
    return False


def pre_shell_response(event: dict[str, Any], root: Path) -> dict[str, Any]:
    reason = destructive_reason(shell_command(event), root)
    if not reason:
        return {}
    return {"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": reason}}


def post_output_response(event: dict[str, Any]) -> dict[str, Any]:
    if not find_truncation(event.get("tool_response")):
        return {}
    return {"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": "Tool output was truncated. Read the full artifact directly or narrow the command before drawing conclusions."}}


GATES = {
    "guardrails": [["python3", "-m", "unittest", "discover", "-s", ".codex/guards/tests", "-v"]],
    "frontend": [["npm", "run", "lint"], ["npm", "test", "--", "--run"], ["npm", "run", "build"]],
    "omnirave-babylon": [["npm", "test", "--", "--run"], ["npm", "run", "build"]],
    "omnirave-web": [["npm", "test", "--", "--run"], ["npm", "run", "build"]],
    "backend": [["go", "vet", "./..."], ["go", "test", "./..."]],
}


def run_stop_gates(root: Path) -> list[str]:
    target = cache_path(root)
    if not target.is_file():
        return []
    try:
        value = json.loads(target.read_text(encoding="utf-8"))
        if not isinstance(value, list):
            raise TypeError("touched ledger must be a list")
        components = [item for item in value if isinstance(item, str) and item in GATES]
    except (OSError, json.JSONDecodeError, TypeError):
        components = ["guardrails"]
    failures: list[str] = []
    for component in sorted(set(components)):
        cwd = root if component == "guardrails" else root / component
        for command in GATES[component]:
            if failure := run_check(command, cwd):
                failures.append(f"[{component}] {' '.join(command)}\n{failure}")
                break
    if not failures:
        target.unlink(missing_ok=True)
    return failures


def stop_response(event: dict[str, Any], root: Path) -> dict[str, Any]:
    if event.get("stop_hook_active") is True:
        return {}
    failures = run_stop_gates(root)
    if not failures:
        return {}
    return {"decision": "block", "reason": "Affected-project completion gates failed:\n\n" + "\n\n".join(failures)}


def main() -> int:
    if len(sys.argv) != 2:
        return 2
    mode = sys.argv[1]
    event = read_event()
    root = repo_root()
    if mode == "pre-shell":
        emit(pre_shell_response(event, root))
        return 0
    if mode == "post-edit":
        paths = edited_paths(event, root)
        failures = [f"{path.relative_to(root)}: {failure}" for path in paths if (failure := check_file(path, root))]
        mark_touched(paths, root)
        emit({"decision": "block", "reason": "Edited-file check failed:\n" + "\n".join(failures)} if failures else {})
        return 0
    if mode == "post-output":
        emit(post_output_response(event))
        return 0
    if mode == "stop":
        emit(stop_response(event, root))
        return 0
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
