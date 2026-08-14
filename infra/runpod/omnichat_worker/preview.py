"""Render a provider payload's final prompts without a GPU.

The backend prompt and the worker prompt are two halves of one contract, and
only the worker's half reaches the diffusion model. Inspecting it previously
required a RunPod cold start, so prompt regressions were expensive to see.

This module takes the exact payload emitted by
``go run ./cmd/omnichat_prompt_preview -json`` and prints what the worker would
build from it. It imports nothing from torch or diffusers, so it runs on any
machine.

Usage:
    python -m omnichat_worker.preview payload.json
    go run ./cmd/omnichat_prompt_preview ... -json | python -m omnichat_worker.preview -
"""

from __future__ import annotations

import json
import sys
from typing import Any

from .contract import validate_input
from .generators import (
    build_image_negative_prompt,
    build_image_prompt,
    build_video_negative_prompt,
    video_fps,
    video_frame_count,
    video_max_frames,
)


def _load(source: str) -> dict[str, Any]:
    raw = sys.stdin.read() if source == "-" else open(source, encoding="utf-8").read()
    payload = json.loads(raw)
    if not isinstance(payload, dict):
        raise SystemExit("payload must be a JSON object")
    # Accept either the bare provider input or a full RunPod {"input": {...}}
    # envelope, so a payload copied straight out of a RunPod job also works.
    inner = payload.get("input")
    return inner if isinstance(inner, dict) else payload


def render(payload: dict[str, Any]) -> str:
    # Validate exactly as the worker does. Calling build_image_prompt on the raw
    # payload bypasses the scene whitelist in contract._scene, which silently
    # drops any field the contract does not know about. That made this tool
    # report fields -- accessories, viewer_position, subject_appearance,
    # include_user_body -- that the real worker was discarding at the door.
    request = validate_input(payload)
    prompt = request.prompt
    mode = request.mode
    scene = request.scene
    negative = request.negative_prompt

    dropped = sorted(set(payload.get("scene") or {}) - set(scene or {}))
    if dropped:
        raise SystemExit(
            "scene fields rejected by the worker contract: "
            + ", ".join(dropped)
            + "\nAdd them to contract._scene or they will never reach the renderer."
        )

    if request.kind == "video":
        return _render_video(request)

    lines = [
        f"mode:             {mode}",
        f"aspect_ratio:     {payload.get('aspect_ratio', '')}",
        f"identity_mode:    {payload.get('identity_mode', '')}",
        f"identity_adapter: {payload.get('identity_adapter', '')}"
        f" @ {payload.get('identity_adapter_scale', '')}",
        f"references:       {len(payload.get('reference_image_urls') or [])}",
    ]
    if payload.get("lora_model_id"):
        lines.append(
            f"lora:             {payload['lora_model_id']} /"
            f" {payload.get('lora_weight_name', '')} @ {payload.get('lora_scale', '')}"
        )
    lines.append("")
    lines.append("--- rendered prompt ---")
    lines.append(build_image_prompt(prompt, mode, scene))
    lines.append("")
    lines.append("--- rendered negative prompt ---")
    lines.append(build_image_negative_prompt(negative, mode, prompt, scene))
    return "\n".join(lines)


def _render_video(request: Any) -> str:
    """Show what the video worker would do with an animation payload.

    Rendering this through build_image_prompt would be actively misleading: the
    video worker never calls it, and the whole point of the two-phase split is
    that the video prompt carries motion and nothing else.
    """
    if request.mode != "image_to_video" or not request.source_image_url:
        raise SystemExit(
            "a video payload must carry mode=image_to_video and source_image_url.\n"
            "There is no text-to-video path; the queue renders the still first."
        )
    fps = video_fps()
    frames = video_frame_count(request.duration_seconds, fps, video_max_frames())
    lines = [
        f"mode:             {request.mode}",
        f"source frame:     {request.source_image_url}",
        f"duration:         {request.duration_seconds}s requested",
        f"sampled:          {frames} frames at {fps}fps ({frames / fps:.2f}s)",
        "frame size:       derived from the source still, not from aspect_ratio",
        f"references:       {len(request.reference_image_urls)} (the still already carries identity)",
        "",
        "--- motion prompt ---",
        request.prompt,
        "",
        "--- rendered negative prompt ---",
        build_video_negative_prompt(request.negative_prompt),
    ]
    if frames < request.duration_seconds * fps:
        lines.insert(4, "note:             clamped to the trained clip length; quality degrades past it")
    return "\n".join(lines)


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    print(render(_load(argv[1])))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv))
