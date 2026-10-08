"""Verify the installed worker graph is fully covered by its exact pins."""

from importlib import metadata
from pathlib import Path
import re

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name


def read_pins(text):
    pins = {}
    for line in text.splitlines():
        line = line.partition("#")[0].strip()
        if not line:
            continue
        requirement = Requirement(line)
        name = canonicalize_name(requirement.name)
        specifiers = list(requirement.specifier)
        if (name in pins or requirement.url or requirement.marker
                or len(specifiers) != 1 or specifiers[0].operator != "=="
                or "*" in specifiers[0].version):
            raise ValueError(f"Worker lock requires one exact, unconditional pin for {name}")
        pins[name] = requirement
    if not pins:
        raise ValueError("Worker lock is empty")
    return pins


def verify_lock(text, distribution=metadata.distribution):
    pins = read_pins(text)
    pending = [(name, frozenset(pin.extras)) for name, pin in pins.items()]
    visited = set()
    while pending:
        name, extras = pending.pop()
        if (name, extras) in visited:
            continue
        visited.add((name, extras))
        installed = distribution(name)
        if name in pins and not pins[name].specifier.contains(installed.version):
            raise ValueError(f"{name}=={installed.version} differs from committed {pins[name]}")
        for entry in installed.requires or []:
            required = Requirement(entry)
            if required.marker and not any(required.marker.evaluate({"extra": extra})
                                          for extra in {"", *extras}):
                continue
            child = canonicalize_name(required.name)
            # CUDA/triton wheels are installed by the GPU base image, absent in
            # CPU CI. They must be exact dependencies of that pinned runtime.
            base_runtime = (name == "torch" or re.fullmatch(r"nvidia-[a-z0-9-]+-cu12", name))
            specifiers = list(required.specifier)
            image_owned = (base_runtime and (child == "triton" or re.fullmatch(r"nvidia-[a-z0-9-]+-cu12", child))
                           and len(specifiers) == 1 and specifiers[0].operator == "=="
                           and "*" not in specifiers[0].version)
            if child not in pins and not image_owned:
                raise ValueError(f"Unpinned dependency: {name} requires {required}; add it to the worker lock")
            resolved = distribution(child)
            if required.url or not required.specifier.contains(resolved.version):
                raise ValueError(f"{name} requires {required}, installed {child}=={resolved.version}")
            pending.append((child, frozenset(required.extras)))


def verify_worker(kind):
    directory = "infra/avatar-worker" if kind == "avatar" else f"infra/runpod/{kind}-worker"
    path = Path(__file__).resolve().parents[1] / directory / "requirements.txt"
    verify_lock(path.read_text())
