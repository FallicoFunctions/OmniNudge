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

from .generators import build_image_negative_prompt, build_image_prompt


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
    prompt = str(payload.get("prompt", ""))
    mode = str(payload.get("mode", "create"))
    scene = payload.get("scene")
    scene = scene if isinstance(scene, dict) else None
    negative = str(payload.get("negative_prompt", ""))

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


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    print(render(_load(argv[1])))
    return 0


if __name__ == "__main__":  # pragma: no cover
    raise SystemExit(main(sys.argv))
