"""Verify the installed worker graph is fully covered by its exact pins."""

from importlib import metadata
from pathlib import Path

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name
from packaging.version import Version

TORCH_PACKAGES = {"torch", "torchvision"}
CPU_INDEX = "--extra-index-url https://download.pytorch.org/whl/cpu"


# Supplied by the digest-pinned CUDA image, never resolved by worker pip installs.
# PyTorch's CPU wheel has none of these. CUDA 13 uses cuda-toolkit extras and
# bounded binding/runtime requirements, so their exact snapshot is the image.
GPU_RUNTIME_PACKAGES = {
    "cuda-toolkit", "cuda-bindings", "cuda-pathfinder", "triton",
    "nvidia-cublas", "nvidia-cuda-runtime", "nvidia-cufft", "nvidia-cufile",
    "nvidia-cuda-cupti", "nvidia-curand", "nvidia-cusolver", "nvidia-cusparse",
    "nvidia-nvjitlink", "nvidia-cuda-nvrtc", "nvidia-nvtx",
    "nvidia-cudnn-cu13", "nvidia-cusparselt-cu13", "nvidia-nccl-cu13", "nvidia-nvshmem-cu13",
}


def read_pins(text, *, inputs=False):
    pins = {}
    for line in text.splitlines():
        line = line.partition("#")[0].strip()
        if not line:
            continue
        if inputs and line == CPU_INDEX:
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


def runtime_pin(pin):
    """CPU and CUDA builds share the exact locked upstream Torch release."""
    version = Version(next(iter(pin.specifier)).version)
    if canonicalize_name(pin.name) in TORCH_PACKAGES and version.local == "cpu":
        return Requirement(f"{pin.name}=={version.public}")
    return pin


def verify_inputs(inputs, lock):
    """Validate direct pins and retain their requested extras for graph checks."""
    roots, pins = read_pins(inputs, inputs=True), read_pins(lock)
    for name, root in roots.items():
        if name not in pins or not root.specifier.contains(next(iter(pins[name].specifier)).version):
            raise ValueError(f"Compiled lock differs from direct input: {root}")
    return roots


def audit_requirements(text):
    # PyPI's advisory service indexes upstream releases, not +cpu build tags.
    return "".join(f"{runtime_pin(pin)}\n" for pin in read_pins(text).values())


def verify_lock(text, distribution=metadata.distribution, *, root_extras=None):
    pins = read_pins(text)
    # pip-compile strips extras from the output lock. Preserve direct requests
    # from requirements.in as well as extras discovered through dependency edges.
    root_extras = root_extras or {}
    pending = [(name, frozenset(pin.extras) | frozenset(root_extras.get(name, ())))
               for name, pin in pins.items()]
    visited = set()
    while pending:
        name, extras = pending.pop()
        if (name, extras) in visited:
            continue
        visited.add((name, extras))
        installed = distribution(name)
        if name in pins and not runtime_pin(pins[name]).specifier.contains(installed.version):
            raise ValueError(f"{name}=={installed.version} differs from committed {pins[name]}")
        for entry in installed.requires or []:
            required = Requirement(entry)
            if required.marker and not any(required.marker.evaluate({"extra": extra})
                                          for extra in {"", *extras}):
                continue
            child = canonicalize_name(required.name)
            # cuDNN declares cuBLAS without a version specifier. Both are
            # fixed by the image digest; Torch's entry into this graph must
            # still be constrained, and application packages get no exception.
            image_owned = child in GPU_RUNTIME_PACKAGES and (
                name in GPU_RUNTIME_PACKAGES
                or (name == "torch" and bool(required.specifier))
            )
            if child not in pins and not image_owned:
                raise ValueError(f"Unpinned dependency: {name} requires {required}; add it to the worker lock")
            resolved = distribution(child)
            if required.url or not required.specifier.contains(resolved.version):
                raise ValueError(f"{name} requires {required}, installed {child}=={resolved.version}")
            pending.append((child, frozenset(required.extras)))


def verify_worker(kind):
    directory = "infra/avatar-worker" if kind == "avatar" else f"infra/runpod/{kind}-worker"
    path = Path(__file__).resolve().parents[1] / directory / "requirements.txt"
    text = path.read_text()
    roots = verify_inputs(path.with_suffix(".in").read_text(), text)
    verify_lock(text, root_extras={name: pin.extras for name, pin in roots.items()})


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Prepare a worker lock for upstream-release vulnerability auditing")
    parser.add_argument("kind", choices=("image", "video", "avatar"))
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    directory = "infra/avatar-worker" if args.kind == "avatar" else f"infra/runpod/{args.kind}-worker"
    lock = Path(__file__).resolve().parents[1] / directory / "requirements.txt"
    args.output.write_text(audit_requirements(lock.read_text()))
