"""RunPod Serverless entry point for OmniChat image/video generation."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from .contract import output_image, output_video, validate_input
from .generators import ImageGenerator, VideoGenerator
from .storage import ObjectStore


_image_generator: ImageGenerator | None = None
_video_generator: VideoGenerator | None = None


def _worker_kind() -> str | None:
    value = os.getenv("OMNICHAT_WORKER_KIND", "").strip().lower()
    return value if value in {"image", "video"} else None


def worker_build() -> str:
    """Report the image tag this container was built from.

    A RunPod template can be pointed at any tag, and the running container
    cannot see which one. Without this, a generated asset cannot be attributed
    to the code that produced it, and prompt changes appear to have no effect
    when the endpoint is actually serving a stale image.
    """
    return os.getenv("OMNICHAT_WORKER_BUILD", "unknown").strip() or "unknown"


def handler(job: dict[str, Any]) -> dict[str, Any]:
    raw_input = job.get("input") if isinstance(job, dict) else None
    expected_kind = _worker_kind()
    request = validate_input(raw_input, expected_kind=expected_kind)
    store = ObjectStore()
    global _image_generator, _video_generator

    if request.kind == "image":
        _image_generator = _image_generator or ImageGenerator()
        result = _image_generator.render(request)
        images = []
        for file_obj, width, height in result.images:
            url, size = store.upload(file_obj, suffix=".png", content_type="image/png")
            images.append(output_image(url, content_type="image/png", width=width, height=height, file_size=size))
        return {
            "images": images,
            "actual_prompt": result.actual_prompt,
            "worker_build": worker_build(),
            # The checkpoint, for the same reason as the build tag above and
            # with a sharper edge. OMNICHAT_IMAGE_MODEL_ID is optional, so an
            # endpoint that never sets it renders the compiled default and
            # looks identical to one that sets that default on purpose.
            # Worse, editing the variable does not disturb a warm worker: a
            # comparison of two checkpoints was run, passed, and was
            # byte-identical to the run before it, because the old container
            # still held the old pipeline. Timing and a checksum caught it.
            # Neither should have been necessary.
            "model_id": _image_generator.model_id,
        }

    _video_generator = _video_generator or VideoGenerator()
    result = _video_generator.render(request)
    try:
        with open(result.file.name, "rb") as file_obj:
            url, size = store.upload(file_obj, suffix=".mp4", content_type="video/mp4")
    finally:
        Path(result.file.name).unlink(missing_ok=True)
    return {
        "video": output_video(url, duration=result.duration, file_size=size),
        "actual_prompt": result.actual_prompt,
        "worker_build": worker_build(),
        "model_id": _video_generator.model_id,
        # Stored with the asset so a slow clip can be attributed without
        # reading RunPod's logs, which are gone by the time anyone looks.
        "load_seconds": round(result.load_seconds, 3),
        "inference_seconds": round(result.inference_seconds, 3),
    }


def run() -> None:
    try:
        import runpod  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("runpod is not installed") from exc
    runpod.serverless.start({"handler": handler})


if __name__ == "__main__":  # pragma: no cover
    run()
