"""Validation and output helpers shared by the OmniChat GPU workers.

This module has no torch/diffusers dependency.  It is used both by the
serverless worker and by the local contract tests, so malformed requests are
rejected before a model is loaded or a network fetch is attempted.
"""

from __future__ import annotations

import ipaddress
import os
import re
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlparse


MAX_PROMPT_CHARS = 8_000
MAX_NEGATIVE_PROMPT_CHARS = 2_000
MAX_REFERENCE_IMAGES = 8
MAX_NUM_IMAGES = 4
MAX_DURATION_SECONDS = 10
MIN_DURATION_SECONDS = 1
DEFAULT_FPS = 16
MAX_SCENE_TEXT_CHARS = 300
MAX_SCENE_LIST_ITEMS = 8
MAX_SCENE_LIST_ITEM_CHARS = 220

ASPECT_RATIOS: dict[str, tuple[int, int]] = {
    "1:1": (1024, 1024),
    "3:4": (896, 1152),
    "4:3": (1152, 896),
    "4:5": (896, 1120),
    "5:4": (1120, 896),
    "9:16": (768, 1344),
    "16:9": (1344, 768),
}

_SAFE_MODEL_ID = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$")
_SAFE_WEIGHT_NAME = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}(?:/[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127})*$")


class ContractError(ValueError):
    """A client-visible request contract violation."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class GenerationRequest:
    kind: str
    mode: str
    prompt: str
    negative_prompt: str
    width: int
    height: int
    num_images: int
    duration_seconds: int
    source_image_url: str | None
    reference_image_urls: tuple[str, ...]
    scene: dict[str, Any]
    identity_mode: str
    identity_adapter: str
    identity_adapter_scale: float
    lora_model_id: str | None
    lora_weight_name: str | None
    lora_scale: float
    seed: int | None


def _text(value: Any, field: str, limit: int, *, required: bool = False) -> str:
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise ContractError("invalid_input", f"{field} must be text")
    value = " ".join(value.split())
    if required and not value:
        raise ContractError("invalid_input", f"{field} is required")
    if len(value) > limit:
        raise ContractError("invalid_input", f"{field} is too long")
    return value


def _private_or_loopback(hostname: str) -> bool:
    normalized = hostname.lower().rstrip(".")
    try:
        address = ipaddress.ip_address(normalized)
    except ValueError:
        return normalized in {"localhost", "localhost.localdomain"} or normalized.endswith(".local")
    return (
        address.is_private
        or address.is_loopback
        or address.is_link_local
        or address.is_reserved
        or address.is_multicast
        or address.is_unspecified
    )


def validate_https_url(value: Any, field: str) -> str:
    if not isinstance(value, str):
        raise ContractError("invalid_input", f"{field} must be an HTTPS URL")
    parsed = urlparse(value.strip())
    if (
        parsed.scheme.lower() != "https"
        or not parsed.hostname
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or len(value) > 2_048
        or _private_or_loopback(parsed.hostname)
    ):
        raise ContractError("invalid_input", f"{field} must be a public HTTPS URL")

    configured_hosts = {
        host.strip().lower().rstrip(".")
        for host in os.getenv("OMNICHAT_INPUT_HOSTS", "storage.googleapis.com").split(",")
        if host.strip()
    }
    if configured_hosts and parsed.hostname.lower().rstrip(".") not in configured_hosts:
        raise ContractError("invalid_input", f"{field} host is not configured")
    return value.strip()


def _seed(value: Any) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool) or not isinstance(value, int) or value < 0 or value > 2**63 - 1:
        raise ContractError("invalid_input", "seed must be a non-negative integer")
    return value


def _bounded_float(value: Any, field: str, default: float) -> float:
    if value is None or value == "":
        return default
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ContractError("invalid_input", f"{field} must be a number")
    value = float(value)
    if value != value or value in (float("inf"), float("-inf")) or not 0.1 <= value <= 1.5:
        raise ContractError("invalid_input", f"{field} is outside the supported range")
    return value


def _lora_model_allowed(model_id: str) -> bool:
    configured = {item.strip() for item in os.getenv("OMNICHAT_LORA_MODEL_ALLOWLIST", "").split(",") if item.strip()}
    # LoRA is an operator-controlled feature. Requiring an explicit allowlist
    # prevents a forged provider request from turning the worker into an
    # arbitrary Hugging Face model downloader.
    return bool(configured) and model_id in configured


def _scene(raw: Any) -> dict[str, Any]:
    """Normalize the provider-neutral scene snapshot without trusting it."""
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise ContractError("invalid_input", "scene must be an object")
    # This whitelist is the scene contract. A field the backend computes but
    # that is absent here is dropped silently, with no error and no log, and
    # simply never reaches the renderer. Every field added on the server must
    # be added here in the same change.
    allowed_text = {
        "location", "time_of_day", "weather", "lighting", "activity",
        "outfit", "pose", "expression", "mood", "camera_direction",
        # Where the user's body is, which decides the camera's viewpoint.
        "viewer_position",
        # The persona's stable physical description, resolved from the persona
        # record rather than from conversation state.
        "subject_appearance",
    }
    normalized: dict[str, Any] = {}
    for key in allowed_text:
        value = raw.get(key)
        if value is None:
            continue
        normalized[key] = _text(value, f"scene.{key}", MAX_SCENE_TEXT_CHARS)
    # Server-derived boolean: whether the tracked interaction actually puts the
    # viewer's body in frame. Without it every scene defaults to persona-only.
    include_user_body = raw.get("include_user_body")
    if include_user_body is not None:
        if not isinstance(include_user_body, bool):
            raise ContractError("invalid_input", "scene.include_user_body must be a boolean")
        normalized["include_user_body"] = include_user_body
    for key in ("other_characters", "recent_events", "accessories"):
        value = raw.get(key, [])
        if value is None:
            continue
        if not isinstance(value, list) or len(value) > MAX_SCENE_LIST_ITEMS:
            raise ContractError("invalid_input", f"scene.{key} is invalid")
        items = []
        for index, item in enumerate(value):
            items.append(_text(item, f"scene.{key}[{index}]", MAX_SCENE_LIST_ITEM_CHARS, required=True))
        normalized[key] = items
    return normalized


def validate_input(raw: Any, expected_kind: str | None = None) -> GenerationRequest:
    if not isinstance(raw, dict):
        raise ContractError("invalid_input", "input must be an object")
    kind = _text(raw.get("kind"), "kind", 16, required=True).lower()
    if kind not in {"image", "video"}:
        raise ContractError("invalid_input", "kind must be image or video")
    if expected_kind and kind != expected_kind:
        raise ContractError("invalid_input", "request kind does not match this endpoint")

    mode = _text(raw.get("mode", "create"), "mode", 24, required=True).lower()
    if mode not in {"create", "contextual", "image_to_video"}:
        raise ContractError("invalid_input", "mode is invalid")
    if kind == "image" and mode == "image_to_video":
        raise ContractError("invalid_input", "image_to_video is only valid for video")

    prompt = _text(raw.get("prompt"), "prompt", MAX_PROMPT_CHARS, required=True)
    negative_prompt = _text(raw.get("negative_prompt"), "negative_prompt", MAX_NEGATIVE_PROMPT_CHARS)
    aspect_ratio = _text(raw.get("aspect_ratio", "1:1"), "aspect_ratio", 8, required=True)
    if aspect_ratio not in ASPECT_RATIOS:
        raise ContractError("invalid_input", "aspect_ratio is invalid")
    width, height = ASPECT_RATIOS[aspect_ratio]

    num_images = raw.get("num_images", 1)
    if isinstance(num_images, bool) or not isinstance(num_images, int) or not 1 <= num_images <= MAX_NUM_IMAGES:
        raise ContractError("invalid_input", "num_images must be between 1 and 4")

    duration = raw.get("duration_seconds", 5 if kind == "video" else 0)
    if isinstance(duration, bool) or not isinstance(duration, int):
        raise ContractError("invalid_input", "duration_seconds must be an integer")
    if kind == "video" and not MIN_DURATION_SECONDS <= duration <= MAX_DURATION_SECONDS:
        raise ContractError("invalid_input", "duration_seconds is outside the supported range")
    if kind == "image" and duration != 0:
        raise ContractError("invalid_input", "duration_seconds is only valid for video")

    source = raw.get("source_image_url")
    source_url = validate_https_url(source, "source_image_url") if source else None
    references_raw = raw.get("reference_image_urls", [])
    if not isinstance(references_raw, list) or len(references_raw) > MAX_REFERENCE_IMAGES:
        raise ContractError("invalid_input", "too many reference images")
    references = tuple(validate_https_url(item, "reference_image_urls") for item in references_raw)
    scene = _scene(raw.get("scene"))
    if mode == "image_to_video" and not source_url:
        raise ContractError("invalid_input", "source_image_url is required for image_to_video")

    identity_mode = _text(raw.get("identity_mode", "reference"), "identity_mode", 16, required=True).lower()
    if identity_mode not in {"reference", "lora"}:
        raise ContractError("invalid_input", "identity_mode is invalid")
    identity_adapter = _text(raw.get("identity_adapter", "ip_adapter"), "identity_adapter", 32, required=True).lower()
    if identity_adapter != "ip_adapter":
        raise ContractError("invalid_input", "identity_adapter is invalid")
    identity_adapter_scale = _bounded_float(raw.get("identity_adapter_scale"), "identity_adapter_scale", 0.65)
    lora_model_id: str | None = None
    lora_weight_name: str | None = None
    lora_scale = _bounded_float(raw.get("lora_scale"), "lora_scale", 0.8)
    if identity_mode == "lora":
        lora_model_id = _text(raw.get("lora_model_id"), "lora_model_id", 256, required=True)
        lora_weight_name = _text(raw.get("lora_weight_name"), "lora_weight_name", 256, required=True)
        if not _SAFE_MODEL_ID.fullmatch(lora_model_id) or not _lora_model_allowed(lora_model_id):
            raise ContractError("invalid_input", "lora_model_id is not allowed")
        if not _SAFE_WEIGHT_NAME.fullmatch(lora_weight_name) or ".." in lora_weight_name:
            raise ContractError("invalid_input", "lora_weight_name is invalid")

    return GenerationRequest(
        kind=kind,
        mode=mode,
        prompt=prompt,
        negative_prompt=negative_prompt,
        width=width,
        height=height,
        num_images=num_images,
        duration_seconds=duration,
        source_image_url=source_url,
        reference_image_urls=references,
        scene=scene,
        identity_mode=identity_mode,
        identity_adapter=identity_adapter,
        identity_adapter_scale=identity_adapter_scale,
        lora_model_id=lora_model_id,
        lora_weight_name=lora_weight_name,
        lora_scale=lora_scale,
        seed=_seed(raw.get("seed")),
    )


def output_image(url: str, *, content_type: str, width: int, height: int, file_size: int) -> dict[str, Any]:
    return {
        "url": url,
        "content_type": content_type,
        "width": width,
        "height": height,
        "file_size": file_size,
    }


def output_video(url: str, *, duration: float, file_size: int) -> dict[str, Any]:
    return {
        "url": url,
        "content_type": "video/mp4",
        "duration": duration,
        "file_size": file_size,
    }
