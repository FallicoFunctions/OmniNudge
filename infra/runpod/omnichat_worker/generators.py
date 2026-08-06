"""Lazy-loaded diffusers implementations for image and video jobs."""

from __future__ import annotations

import io
import ipaddress
import math
import os
import re
import socket
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import HTTPErrorProcessor, HTTPRedirectHandler, Request, build_opener

from .contract import GenerationRequest


class ModelError(RuntimeError):
    pass


DEFAULT_IMAGE_NEGATIVE_PROMPT = (
    "text, captions, words, letters, subtitles, speech bubbles, logo, watermark, signature, "
    "collage, contact sheet, multiple panels, distorted face, "
    "deformed hands, blurry, low quality, overexposed, underexposed, compression artifacts, "
    "close-up portrait, headshot, selfie, avatar framing, copied reference background, "
    "reference image background, double face, split face, duplicate head, cloned person, "
    "double exposure"
)

DEFAULT_IP_ADAPTER_MODEL_ID = "h94/IP-Adapter"
DEFAULT_IP_ADAPTER_SUBFOLDER = "sdxl_models"
DEFAULT_IP_ADAPTER_WEIGHT = "ip-adapter_sdxl.bin"
DEFAULT_CONTROLNET_MODEL_ID = "thibaud/controlnet-openpose-sdxl-1.0"


def _positive_int_env(name: str, default: int, *, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, value))


def _bounded_float_env(name: str, default: float, *, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        return default
    if not math.isfinite(value):
        return default
    return max(minimum, min(maximum, value))


def image_pipeline_settings(model_id: str) -> tuple[int, float, float]:
    """Return safe quality settings for the selected diffusers image model.

    SDXL Turbo is a few-step distilled model. Its classifier-free guidance must
    be disabled; leaving diffusers' normal 7.5 default enabled produces washed
    out, duplicated, and otherwise incoherent images. Other models use a
    conventional quality-first baseline and may override each setting through
    the endpoint environment.
    """
    normalized = model_id.strip().lower()
    is_distilled = "turbo" in normalized or "schnell" in normalized
    default_steps = 4 if is_distilled else 25
    default_guidance = 0.0 if is_distilled else 7.5
    # A reference is identity guidance, not a composition lock. A slightly
    # stronger denoise lets the requested location and action replace the
    # avatar's original background while retaining recognizable features.
    default_strength = 0.65 if is_distilled else 0.55
    steps = _positive_int_env("OMNICHAT_IMAGE_STEPS", default_steps, minimum=1, maximum=60)
    guidance = _bounded_float_env("OMNICHAT_IMAGE_GUIDANCE_SCALE", default_guidance, minimum=0.0, maximum=20.0)
    strength = _bounded_float_env("OMNICHAT_IMAGE_STRENGTH", default_strength, minimum=0.05, maximum=0.95)
    return steps, guidance, strength


def build_image_negative_prompt(
    request_negative_prompt: str,
    mode: str = "",
    request_prompt: str = "",
    scene: dict[str, Any] | None = None,
) -> str:
    """Keep common rendering defects out of every generated image."""
    custom = " ".join(request_negative_prompt.split()).strip()
    parts = [DEFAULT_IMAGE_NEGATIVE_PROMPT]
    if mode.strip().lower() == "contextual":
        location_match = re.search(r"\bLocation:\s*([^\.]+)", request_prompt, flags=re.IGNORECASE)
        location = location_match.group(1).strip().lower() if location_match else ""
        if scene:
            location = str(scene.get("location", location)).strip().lower() or location
        indoor_terms = (
            "dungeon", "room", "bedroom", "bathroom", "kitchen", "office", "studio",
            "bar", "club", "cellar", "castle", "prison", "interior", "indoors",
        )
        if any(term in location for term in indoor_terms):
            parts.append("forest, trees, foliage, outdoor landscape, sky, campsite, park background")
        scene_text = " ".join(
            str(value)
            for key, value in (scene or {}).items()
            if key in {"location", "activity", "outfit", "pose", "mood", "recent_events"}
        )
        intimate_text = f"{request_prompt} {scene_text}"
        intimate = _is_intimate_scene(intimate_text)
        if intimate:
            direct_oral = "dick" in intimate_text.lower() and "mouth" in intimate_text.lower()
            parts.append(
                "casual street clothes, blouse, sweater, jeans, pajamas, solitary standing pose, "
                "shirt, dress, trousers, fabric covering the character, standing alone, empty hallway, "
                "ordinary speaking portrait, fashion catalog, "
                "third person, duplicate character, twin, extra duplicate body, extra limbs, extra legs, fused bodies"
            )
            if direct_oral:
                # This cue describes one persona and one male user. Explicitly
                # suppressing an additional woman prevents adult checkpoints
                # from turning a two-person pose into a group composition.
                parts.append(
                    "second woman, extra woman, additional female, multiple women, threesome, group scene, "
                    "female user, third adult, fourth adult"
                )
        else:
            # A contextual intimate scene intentionally contains two people.
            # Keep duplicate suppression for ordinary portraits without asking
            # the model to remove the user's required body from the frame.
            parts.append("duplicate person, extra faces")
    if custom:
        parts.append(custom)
    return ", ".join(parts)


def _is_intimate_scene(value: str) -> bool:
    lowered = value.lower()
    return any(
        cue in lowered
        for cue in (
            "bdsm", "dungeon", "dominant", "submissive", "restraint", "restrained",
            "bound", "collar", "cuffs", "handcuff", "blindfold", "whip", "chain",
            "naked", "nude", "undress", "dick", "cock", "pussy", "cum", "semen",
            "fingers deep", "thrust hard", "rub my", "on my knees",
        )
    )


def _scene_recent_context(scene: dict[str, Any], fallback: str) -> str:
    values = scene.get("recent_events") if isinstance(scene, dict) else None
    if isinstance(values, list):
        cleaned = [_clean_scene_event(value) for value in values]
        cleaned = [value for value in cleaned if value]
        if cleaned:
            # The list is chronological. Put the latest physical beat first so
            # the diffusion model does not spend its limited context on stale
            # earlier action.
            recent = "; ".join(reversed(cleaned[-3:]))
            if len(recent) > 420:
                recent = recent[:420].rsplit(" ", 1)[0]
            return recent
    return fallback


def _clean_scene_event(value: Any) -> str:
    """Keep visual action from a stored transcript, never dialogue metadata."""
    text = " ".join(str(value).split()).strip()
    if not text:
        return ""
    role = ""
    match = re.match(r"^(user|character|persona)\s*:\s*", text, flags=re.IGNORECASE)
    if match:
        role = match.group(1).lower()
        text = text[match.end():].strip()

    narrated = re.findall(r"\*([^*]+)\*", text)
    if not narrated:
        # Scene events are bounded before they reach the worker. A long
        # narration can therefore end after an opening asterisk. The tail is
        # still the physical direction and must not be discarded, otherwise
        # the renderer falls back to a generic standing portrait.
        marker = text.find("*")
        if marker >= 0 and text[marker + 1 :].strip():
            narrated = [text[marker + 1 :]]
    if narrated:
        text = " ".join(" ".join(segment.split()) for segment in narrated).strip()
    elif role == "user":
        # A user turn is useful only when it contains a concrete physical
        # direction. Ordinary speech must not become a caption-like prompt.
        lower = text.lower()
        cues = (
            "hand", "arm", "leg", "knee", "foot", "body", "skin", "mouth", "lips", "face", "hair",
            "touch", "hold", "grab", "move", "place", "put", "press", "slide", "stroke", "rub",
            "lean", "stand", "sit", "walk", "kneel", "lie", "bend", "turn", "pull", "push",
            "undress", "naked", "nude", "kiss", "lick", "moan", "trembl",
        )
        if not any(cue in lower for cue in cues):
            return ""

    # Quoted dialogue is not a visual instruction. Strip it even when it is
    # adjacent to narration so the diffusion model cannot render text.
    text = re.sub(r"\"[^\"]*\"|“[^”]*”", " ", text)
    text = re.sub(r"\s+", " ", text).strip(" .")
    return text[:220].rsplit(" ", 1)[0] if len(text) > 220 else text


def _visual_scene_composition(recent: str) -> str:
    """Translate transcript action into a concrete camera composition."""
    lowered = recent.lower()
    if not lowered:
        return ""
    if "dick" in lowered and "mouth" in lowered:
        return (
            "Exactly two adults are in frame: one adult man (the user) and one adult woman (the persona), with no other people. "
            "The adult man's torso, hips, legs, and one arm are clearly visible across the lower foreground, "
            "with only his face cropped out; the woman kneels between his legs and leans forward with her mouth close "
            "to his groin in a clearly intimate interaction, with her face and hands visible. Show the connected pose, "
            "not a standing portrait, and do not create a second woman or duplicate body."
        )
    intimate_cues = (
        "dick", "cock", "pussy", "fingers deep", "thrust", "rub", "mouth", "naked",
        "nude", "restrain", "cuff", "collar", "straddle", "blindfold",
    )
    if any(cue in lowered for cue in intimate_cues):
        return (
            "The adult user's torso, hips, legs, and arms are clearly visible on padded dungeon furniture, with the "
            "user's face outside the frame, while the character kneels or straddles them and leans over with her "
            "hands visibly engaged in the interaction; show the connected pose and do not show the character alone "
            "or create a duplicate character."
        )
    return ""


_OPENPOSE_LIMBS = (
    (0, 1), (1, 2), (2, 3), (3, 4), (1, 5), (5, 6), (6, 7),
    (1, 8), (8, 9), (9, 10), (8, 11), (11, 12), (8, 13), (13, 14),
    (0, 15), (15, 17), (0, 16), (16, 18),
)
_OPENPOSE_COLORS = (
    (255, 0, 0), (255, 85, 0), (255, 170, 0), (255, 255, 0),
    (170, 255, 0), (85, 255, 0), (0, 255, 0), (0, 255, 85),
    (0, 255, 170), (0, 255, 255), (0, 170, 255), (0, 85, 255),
    (0, 0, 255), (85, 0, 255), (170, 0, 255), (255, 0, 255),
    (255, 0, 170), (255, 0, 85),
)


def _draw_openpose_person(
    draw: Any,
    points: list[tuple[float, float]],
    width: int,
    height: int,
    *,
    include_head: bool = True,
) -> None:
    """Draw an OpenPose-style skeleton for the scene layout ControlNet."""
    scaled = [(int(x * width), int(y * height)) for x, y in points]
    limb_width = max(8, round(min(width, height) * 0.012))
    joint_radius = max(10, round(min(width, height) * 0.018))
    excluded = {0, 15, 16, 17, 18} if not include_head else set()
    for index, (start, end) in enumerate(_OPENPOSE_LIMBS):
        if start >= len(scaled) or end >= len(scaled) or start in excluded or end in excluded:
            continue
        color = _OPENPOSE_COLORS[index % len(_OPENPOSE_COLORS)]
        draw.line((scaled[start], scaled[end]), fill=color, width=limb_width)
    for index, (x, y) in enumerate(scaled):
        if index in excluded:
            continue
        color = _OPENPOSE_COLORS[index % len(_OPENPOSE_COLORS)]
        draw.ellipse(
            (x - joint_radius, y - joint_radius, x + joint_radius, y + joint_radius),
            fill=color,
        )


def build_pose_control_image(width: int, height: int, recent: str):
    """Create a deterministic two-person pose map for intimate scene images.

    The fallback identity adapter supplies appearance, while OpenPose supplies
    the missing spatial constraint. The user's face is deliberately kept out
    of the layout so the adapter has only one face to identify as the persona.
    """
    try:
        from PIL import Image, ImageDraw  # type: ignore
    except ImportError as exc:  # pragma: no cover - exercised in image
        raise ModelError("Pillow is not installed") from exc
    if width <= 0 or height <= 0:
        raise ModelError("pose control dimensions are invalid")
    image = Image.new("RGB", (width, height), (0, 0, 0))
    draw = ImageDraw.Draw(image)
    lowered = recent.lower()
    if "dick" in lowered and "mouth" in lowered:
        # Persona kneels and leans toward the user's lower body. The user is
        # a partial horizontal skeleton; this leaves their face out of frame.
        persona = [
            (0.53, 0.64), (0.50, 0.69), (0.40, 0.70), (0.35, 0.77), (0.42, 0.82),
            (0.60, 0.70), (0.65, 0.77), (0.58, 0.82), (0.50, 0.82), (0.40, 0.92),
            (0.28, 1.02), (0.56, 1.02), (0.68, 0.92), (0.78, 1.02),
            (0.50, 0.64), (0.56, 0.64), (0.46, 0.65), (0.60, 0.65),
        ]
        user = [
            (0.10, 0.78), (0.22, 0.80), (0.31, 0.75), (0.31, 0.86), (0.42, 0.88),
            (0.31, 0.75), (0.42, 0.76), (0.53, 0.80), (0.58, 0.84), (0.68, 0.72),
            (0.80, 0.62), (0.94, 0.58), (0.58, 0.88), (0.72, 0.83), (0.92, 0.78),
            (0.11, 0.77), (0.15, 0.77), (0.06, 0.78), (0.19, 0.80),
        ]
    else:
        persona = [
            (0.50, 0.28), (0.50, 0.37), (0.40, 0.40), (0.35, 0.53), (0.32, 0.62),
            (0.60, 0.40), (0.65, 0.53), (0.68, 0.62), (0.50, 0.61), (0.45, 0.64),
            (0.36, 0.79), (0.31, 0.91), (0.55, 0.64), (0.64, 0.79), (0.69, 0.91),
            (0.47, 0.28), (0.53, 0.28), (0.43, 0.30), (0.57, 0.30),
        ]
        user = [
            (0.10, 0.78), (0.22, 0.80), (0.31, 0.75), (0.31, 0.86), (0.42, 0.88),
            (0.31, 0.75), (0.42, 0.76), (0.53, 0.80), (0.58, 0.84), (0.68, 0.72),
            (0.80, 0.62), (0.94, 0.58), (0.58, 0.88), (0.72, 0.83), (0.92, 0.78),
            (0.11, 0.77), (0.15, 0.77), (0.06, 0.78), (0.19, 0.80),
        ]
    _draw_openpose_person(draw, persona, width, height)
    # The user's face must remain outside the frame. A nose/eye skeleton here
    # makes OpenPose invent a second face even when the text prompt excludes
    # it, so render only the user's neck, torso, limbs, and hips.
    _draw_openpose_person(draw, user, width, height, include_head=False)
    return image


def _pose_control_enabled(request: GenerationRequest, *, image_to_image: bool = False) -> bool:
    if image_to_image or request.mode.strip().lower() != "contextual":
        return False
    configured = os.getenv("OMNICHAT_POSE_CONTROL_ENABLED", "1").strip().lower()
    if configured in {"0", "false", "no", "off"}:
        return False
    recent = _scene_recent_context(request.scene, "")
    return bool(_visual_scene_composition(recent))


def build_image_prompt(
    request_prompt: str,
    mode: str = "create",
    scene: dict[str, Any] | None = None,
) -> str:
    """Turn scene direction into an environment-forward photographic shot.

    A persona reference is supplied through identity conditioning for identity,
    not composition. Contextual requests must explicitly prioritize the scene;
    otherwise a close-up avatar can overpower the prompt and be returned nearly
    unchanged.
    """
    prompt = " ".join(request_prompt.split()).strip()
    # Provider prompts can contain conversation prose. The explicit visual
    # framing makes the image model treat it as direction rather than as text
    # to draw, while the negative prompt handles residual typography artifacts.
    if mode.strip().lower() == "contextual":
        # The backend prompt contains a long, provider-neutral scene contract.
        # SDXL Turbo has a short effective text window; putting that contract
        # before the actual location causes the model to truncate the scene
        # and reuse the reference composition. Extract the structured fields
        # and put the visual anchors first instead of sending the contract
        # twice.
        def field(*labels: str) -> str:
            for label in labels:
                match = re.search(
                    rf"\b{label}:\s*(.*?)(?=\.\s+(?:[A-Za-z][A-Za-z ]*):|\.\s+Requested view:|$)",
                    prompt,
                    flags=re.IGNORECASE,
                )
                if match:
                    value = " ".join(match.group(1).split()).strip(" .")
                    if value:
                        return value
            return ""

        scene = scene or {}
        location = str(scene.get("location", "")).strip() or field("Location visual direction", "Location")
        location = location.lower()
        indoor_terms = (
            "dungeon", "room", "bedroom", "bathroom", "kitchen", "office", "studio",
            "bar", "club", "cellar", "castle", "prison", "interior", "indoors",
        )
        if "dungeon" in location or "underground" in location:
            location = (
                "an enclosed underground stone-walled room with rough masonry, "
                "a low ceiling, iron fixtures, and warm practical lamps"
            )
        elif any(term in location for term in indoor_terms):
            location = (
                "an enclosed interior room with visible walls, floor, ceiling, "
                "and practical indoor lighting"
            )
        elif not location:
            location = "the requested setting"

        activity = str(scene.get("activity", "")).strip() or field("Current activity", "Activity")
        outfit = str(scene.get("outfit", "")).strip() or field("Character outfit", "Outfit")
        pose = str(scene.get("pose", "")).strip() or field("Pose")
        expression = str(scene.get("expression", "")).strip() or field("Expression")
        mood = str(scene.get("mood", "")).strip() or field("Mood")
        lighting = str(scene.get("lighting", "")).strip() or field("Lighting")
        camera = str(scene.get("camera_direction", "")).strip() or field("Camera direction")
        requested_view = field("Requested view")
        recent = _scene_recent_context(scene, field("Recent physical context"))
        scene_text = " ".join([location, activity, outfit, pose, expression, mood, recent])
        intimate = _is_intimate_scene(scene_text)
        explicit = _is_intimate_scene(f"{recent} {outfit} {pose}")

        composition = _visual_scene_composition(recent)
        # Keep the high-value action in the first SDXL text window. A verbose
        # masonry description can otherwise consume the tokens that describe
        # the connected bodies and clothing state.
        prompt_location = "an enclosed stone dungeon" if intimate else location
        parts = [f"Photorealistic environmental photograph in {prompt_location}."]
        if intimate:
            if explicit:
                if "dick" in recent.lower() and "mouth" in recent.lower():
                    parts.append(
                        "Exactly two adults only: one adult woman, the persona, and one adult man, the user; no other people. "
                        "Private BDSM dungeon scene. The nude persona is the only woman in frame and kneels between the man's legs "
                        "with her mouth close to his unclothed groin. The man's torso, hips, legs, and one arm fill the foreground; "
                        "his penis is directed toward the persona's mouth; crop his face out. Persona face and hands visible; "
                        "one persona; no clothing; do not add a second woman."
                    )
                else:
                    parts.append(
                        "Adult BDSM roleplay scene: two connected nude adults; persona kneels or straddles the user "
                        "in the active interaction. User's unclothed torso, hips, legs, and one arm fill the foreground; "
                        "crop the user's face out; one persona; no clothing."
                    )
            else:
                parts.append(
                    "Adult BDSM roleplay scene in a private dungeon: two connected adults; the persona physically "
                    "engages the user in the described pose, never standing alone."
                )
            parts.append(
                "Use the reference only for the persona's face, hair, and distinctive appearance; never duplicate "
                "the persona and never copy the reference background, crop, lighting, or pose."
            )
        else:
            parts.append(
                "Show one coherent character matching the supplied identity reference; "
                "use the reference for face, hair, and distinctive appearance only."
            )
        if composition and not intimate:
            # Raw transcript prose often describes several sequential beats
            # and can pull a diffusion model toward an incoherent pose. Keep
            # the decisive visual composition, while using the raw events only
            # for cue detection and continuity bookkeeping.
            parts.append(f"Primary visual action that must be visible in the frame: {composition}")
        elif recent and not intimate:
            parts.append(f"Primary visual action that must be visible in the frame: {recent}.")
        generic_activity = activity.lower() in {
            "speaks to", "talks to", "converses with", "stands nearby", "looks at", "interacts with",
        }
        if activity and not (intimate and recent and generic_activity):
            if intimate:
                parts.append(f"Current physical activity: {activity}, continuing the intimate interaction.")
            else:
                parts.append(f"The character {activity}.")
        if pose:
            parts.append(f"Pose: {pose}.")
        if outfit:
            parts.append(f"Outfit: {outfit}.")
        if expression:
            parts.append(f"Expression: {expression}.")
        if mood:
            parts.append(f"Mood: {mood}.")
        if lighting:
            parts.append(f"Lighting: {lighting}.")
        if camera:
            parts.append(f"Camera: {camera}.")
        if requested_view:
            parts.append(f"Requested view: {requested_view}.")
        parts.append(
            "Use medium or full-body framing so the setting and action are visible. "
            "The requested setting must fill the frame; do not copy the reference background, "
            "crop, lighting, or pose. Do not make a headshot, selfie, collage, duplicate, "
            "or split character."
        )
        if any(term in location for term in indoor_terms) or "underground" in location:
            parts.append("Interior-only: show walls, floor, ceiling, and practical indoor lighting; do not place trees, foliage, sky, or outdoor landscape.")
        return " ".join(parts)
    return (
        "A single coherent photorealistic image. Use the supplied reference only "
        "for the character's identity, face, hair, and appearance; do not copy "
        f"its background, crop, lighting, or framing. {prompt}."
    )


def contextual_image_strength(model_id: str) -> float:
    """Use stronger denoising for scene requests so the setting can change."""
    _, _, baseline = image_pipeline_settings(model_id)
    return _bounded_float_env("OMNICHAT_CONTEXT_IMAGE_STRENGTH", max(0.72, baseline), minimum=0.05, maximum=0.95)


def _fit_reference_image(image: Any, width: int, height: int) -> Any:
    """Crop a reference to the requested frame before image-to-image sampling."""
    try:
        from PIL import Image, ImageOps  # type: ignore
    except ImportError as exc:  # pragma: no cover - exercised in image
        raise ModelError("Pillow is not installed") from exc
    if width <= 0 or height <= 0:
        raise ModelError("image dimensions are invalid")
    return ImageOps.fit(image, (width, height), method=Image.Resampling.LANCZOS, centering=(0.5, 0.45))


def _device_dtype():
    try:
        import torch  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise ModelError("torch is not installed") from exc
    if not torch.cuda.is_available():
        raise ModelError("a CUDA GPU is required for this worker")
    return torch, torch.float16


def _configured_hosts() -> set[str]:
    return {
        item.strip().lower().rstrip(".").lstrip(".")
        for item in os.getenv("OMNICHAT_INPUT_HOSTS", "storage.googleapis.com").split(",")
        if item.strip()
    }


def _validate_download_url(raw_url: str) -> str:
    parsed = urlparse(raw_url.strip())
    host = (parsed.hostname or "").lower().rstrip(".")
    try:
        port = parsed.port
    except ValueError as exc:
        raise ModelError("reference image URL is not configured") from exc
    if (
        parsed.scheme.lower() != "https"
        or not host
        or parsed.username is not None
        or parsed.password is not None
        or parsed.fragment
        or (port not in (None, 443))
        or not any(host == allowed for allowed in _configured_hosts())
    ):
        raise ModelError("reference image URL is not configured")
    try:
        addresses = socket.getaddrinfo(host, port or 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ModelError("reference image host could not be resolved") from exc
    if not addresses:
        raise ModelError("reference image host has no addresses")
    for _, _, _, _, sockaddr in addresses:
        address = ipaddress.ip_address(sockaddr[0])
        if not address.is_global or address.is_private or address.is_loopback or address.is_link_local or address.is_reserved or address.is_multicast:
            raise ModelError("reference image host resolved to a forbidden network")
    return raw_url.strip()


class _NoRedirectProcessor(HTTPErrorProcessor):
    def http_response(self, request, response):  # type: ignore[no-untyped-def]
        return response

    https_response = http_response


class _NoRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):  # type: ignore[no-untyped-def]
        return None


def _download_image(url: str):
    try:
        from PIL import Image  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise ModelError("Pillow is not installed") from exc
    request = Request(
        _validate_download_url(url),
        headers={
            "Accept": "image/png,image/jpeg,image/webp",
            # Some CDNs reject urllib's default Python user agent even for a
            # public image. Identify the worker explicitly while retaining
            # the strict host and redirect checks above.
            "User-Agent": "OmniChatMediaWorker/1.0",
        },
    )
    opener = build_opener(_NoRedirectHandler(), _NoRedirectProcessor())
    try:
        with opener.open(request, timeout=30) as response:
            if response.status < 200 or response.status >= 300:
                raise ModelError("reference image request failed")
            content_length = int(response.headers.get("content-length", "0") or 0)
            if content_length > 25 * 1024 * 1024:
                raise ModelError("reference image is too large")
            data = bytearray()
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > 25 * 1024 * 1024:
                    raise ModelError("reference image is too large")
    except ModelError:
        raise
    except Exception as exc:
        raise ModelError("reference image request failed") from exc
    image = Image.open(io.BytesIO(data))
    image.load()
    return image.convert("RGB")


def _download_images(urls: tuple[str, ...]) -> list[Any]:
    if not urls:
        return []
    return [_download_image(url) for url in urls]


def _resize_image(image: Any, width: int, height: int) -> Any:
    """Normalize provider output to the contract's requested dimensions."""
    if image.width == width and image.height == height:
        return image
    try:
        from PIL import Image  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise ModelError("Pillow is not installed") from exc
    return image.resize((width, height), Image.Resampling.LANCZOS)


def _focus_identity_reference(image: Any) -> Any:
    """Remove most reference background before IP-Adapter sees the identity.

    A normal avatar often contains a recognizable location (for example a
    forest portrait). Feeding that entire frame to IP-Adapter makes the adapter
    treat the background as part of the identity and overpower a new scene
    prompt. A centered upper-body crop keeps face, hair, and distinctive
    features while giving the text prompt control of the composition.
    """
    if not hasattr(image, "size") or not hasattr(image, "crop"):
        # Keeps contract-only tests and alternate image backends harmless; the
        # production path always supplies a Pillow image.
        return image
    try:
        from PIL import Image, ImageDraw, ImageFilter, ImageOps  # type: ignore
    except ImportError as exc:  # pragma: no cover - exercised in image
        raise ModelError("Pillow is not installed") from exc
    width, height = image.size
    if width <= 0 or height <= 0:
        raise ModelError("identity reference dimensions are invalid")
    # Keep the crop tight enough that an outdoor avatar backdrop cannot become
    # a second scene instruction. The face and hair are sufficient for the
    # reference adapter; the text prompt supplies body, clothing, and setting.
    side = max(1, int(min(width, height) * 0.62))
    left = max(0, (width - side) // 2)
    top = max(0, int((height - side) * 0.04))
    crop = image.crop((left, top, min(width, left + side), min(height, top + side)))
    focused = ImageOps.fit(crop.convert("RGB"), (768, 768), method=Image.Resampling.LANCZOS, centering=(0.5, 0.38))

    # IP-Adapter is an identity conditioner, but it also sees salient scenery
    # in the supplied pixels. Matte the outer edge of the portrait to a
    # neutral studio tone so an avatar photographed outdoors cannot become an
    # unintended scene instruction. The soft oval keeps the face and hair
    # anchor while avoiding a hard cut-out edge.
    neutral = Image.new("RGB", focused.size, (128, 128, 128))
    mask = Image.new("L", focused.size, 0)
    draw = ImageDraw.Draw(mask)
    size = focused.width
    draw.ellipse(
        (int(size * 0.04), int(-size * 0.08), int(size * 0.96), int(size * 1.08)),
        fill=255,
    )
    mask = mask.filter(ImageFilter.GaussianBlur(max(12, int(size * 0.035))))
    return Image.composite(focused, neutral, mask)


def _identity_reference_image(references: list[Any]) -> Any:
    """Select one curated identity crop for the configured IP-Adapter.

    Diffusers interprets a list passed to ``ip_adapter_image`` as one image per
    loaded adapter, not as multiple reference photos for one adapter. A contact
    sheet therefore creates duplicate people in the output. Until a true
    embedding aggregator or a persona LoRA is configured, one clean anchor is
    the only deterministic reference input.
    """
    focused = [_focus_identity_reference(image) for image in references]
    if not focused:
        raise ModelError("identity reference is unavailable")
    return focused[0]


def identity_conditioning_kwargs(request: GenerationRequest, references: list[Any]) -> dict[str, Any]:
    """Build one background-minimized IP-Adapter identity input.

    The reference image controls identity only. The scene prompt controls
    location, pose, outfit, and framing, so a portrait's original background
    cannot silently become the generated scene.
    """
    if not references:
        return {}
    return {"ip_adapter_image": _identity_reference_image(references)}


def contextual_identity_adapter_scale(request: GenerationRequest) -> float:
    """Lower identity strength for contextual scenes so composition can change."""
    requested = max(0.1, min(1.5, float(request.identity_adapter_scale)))
    configured = _bounded_float_env(
        "OMNICHAT_CONTEXT_IDENTITY_ADAPTER_SCALE",
        0.1,
        minimum=0.1,
        maximum=1.5,
    )
    if request.mode.strip().lower() != "contextual":
        return requested
    return min(requested, configured)


@dataclass
class ImageResult:
    images: list[tuple[io.BytesIO, int, int]]
    actual_prompt: str


class ImageGenerator:
    def __init__(self) -> None:
        # Keep the default publicly downloadable so a fresh endpoint can boot
        # without requiring a Hugging Face credential. A gated model can still
        # be selected explicitly through OMNICHAT_IMAGE_MODEL_ID together with
        # a read-only HF_TOKEN in the RunPod endpoint environment.
        self.model_id = os.getenv("OMNICHAT_IMAGE_MODEL_ID", "stabilityai/stable-diffusion-xl-base-1.0")
        self._pipeline = None
        self._pipeline_key: tuple[Any, ...] | None = None

    def _load(self, request: GenerationRequest, *, image_to_image: bool = False):
        has_references = bool(request.reference_image_urls) and not image_to_image
        use_pose_control = _pose_control_enabled(request, image_to_image=image_to_image)
        adapter_scale = contextual_identity_adapter_scale(request)
        key = (
            "image2image" if image_to_image else "text2image",
            has_references,
            use_pose_control,
            request.identity_mode,
            request.identity_adapter,
            round(adapter_scale, 4),
            request.lora_model_id or "",
            request.lora_weight_name or "",
        )
        if self._pipeline is not None and self._pipeline_key == key:
            return self._pipeline
        torch, dtype = _device_dtype()
        try:
            if use_pose_control:
                from diffusers import ControlNetModel, StableDiffusionXLControlNetPipeline  # type: ignore

                controlnet = ControlNetModel.from_pretrained(
                    os.getenv("OMNICHAT_CONTROLNET_MODEL_ID", DEFAULT_CONTROLNET_MODEL_ID),
                    torch_dtype=dtype,
                )
                self._pipeline = StableDiffusionXLControlNetPipeline.from_pretrained(
                    self.model_id,
                    controlnet=controlnet,
                    torch_dtype=dtype,
                    use_safetensors=True,
                )
            else:
                from diffusers import AutoPipelineForImage2Image, AutoPipelineForText2Image  # type: ignore

                cls = AutoPipelineForImage2Image if image_to_image else AutoPipelineForText2Image
                self._pipeline = cls.from_pretrained(self.model_id, torch_dtype=dtype, use_safetensors=True)
            if has_references:
                self._pipeline.load_ip_adapter(
                    os.getenv("OMNICHAT_IP_ADAPTER_MODEL_ID", DEFAULT_IP_ADAPTER_MODEL_ID),
                    subfolder=os.getenv("OMNICHAT_IP_ADAPTER_SUBFOLDER", DEFAULT_IP_ADAPTER_SUBFOLDER),
                    weight_name=os.getenv("OMNICHAT_IP_ADAPTER_WEIGHT", DEFAULT_IP_ADAPTER_WEIGHT),
                )
                self._pipeline.set_ip_adapter_scale(adapter_scale)
            if request.identity_mode == "lora":
                if not request.lora_model_id or not request.lora_weight_name:
                    raise ModelError("LoRA identity profile is incomplete")
                self._pipeline.load_lora_weights(
                    request.lora_model_id,
                    weight_name=request.lora_weight_name,
                    adapter_name="omnichat_character",
                )
                if hasattr(self._pipeline, "set_adapters"):
                    self._pipeline.set_adapters(["omnichat_character"], adapter_weights=[request.lora_scale])
            self._pipeline.enable_model_cpu_offload()
            self._pipeline_key = key
        except Exception as exc:  # pragma: no cover - model/runtime specific
            raise ModelError("image model could not be loaded") from exc
        return self._pipeline

    def _render(self, request: GenerationRequest, *, image_to_image: bool = False) -> ImageResult:
        # The configured SDXL IP-Adapter consumes one image. Do not download
        # unused gallery references (or allow a later bad reference to fail an
        # otherwise valid generation) until a multi-image adapter is enabled.
        references = _download_images(request.reference_image_urls[:1])
        pipe = self._load(request, image_to_image=image_to_image)
        torch, _ = _device_dtype()
        generator = torch.Generator(device="cuda")
        if request.seed is not None:
            generator = generator.manual_seed(request.seed)
        steps, guidance_scale, strength = image_pipeline_settings(self.model_id)
        if request.mode == "contextual":
            strength = contextual_image_strength(self.model_id)
        rendered_prompt = build_image_prompt(request.prompt, request.mode, request.scene)
        rendered_negative_prompt = build_image_negative_prompt(
            request.negative_prompt,
            request.mode,
            request.prompt,
            request.scene,
        )
        kwargs: dict[str, Any] = {
            "prompt": rendered_prompt,
            "negative_prompt": rendered_negative_prompt,
            "width": request.width,
            "height": request.height,
            "num_images_per_prompt": request.num_images,
            "generator": generator,
            "num_inference_steps": steps,
            "guidance_scale": guidance_scale,
        }
        use_pose_control = _pose_control_enabled(request, image_to_image=image_to_image)
        if use_pose_control:
            kwargs["image"] = build_pose_control_image(
                request.width,
                request.height,
                _scene_recent_context(request.scene, ""),
            )
            kwargs["controlnet_conditioning_scale"] = _bounded_float_env(
                "OMNICHAT_POSE_CONTROL_SCALE",
                0.85,
                minimum=0.0,
                maximum=2.0,
            )
        if image_to_image and references:
            # Diffusers may preserve an input image's native frame when it is
            # passed to image-to-image. Fit it first so the generated asset
            # honors the request's aspect ratio instead of returning the raw
            # avatar's portrait/landscape dimensions.
            kwargs["image"] = _fit_reference_image(references[0], request.width, request.height)
            kwargs["strength"] = strength
        elif references:
            kwargs.update(identity_conditioning_kwargs(request, references))
        try:
            with torch.inference_mode():
                result = pipe(**kwargs)
        except Exception as exc:  # pragma: no cover - model/runtime specific
            raise ModelError("image model failed to render") from exc
        rendered = []
        for image in result.images:
            image = _resize_image(image, request.width, request.height)
            output = io.BytesIO()
            image.save(output, format="PNG", optimize=True)
            rendered.append((output, image.width, image.height))
        if not rendered:
            raise ModelError("image model returned no images")
        return ImageResult(rendered, rendered_prompt)

    def render(self, request: GenerationRequest) -> ImageResult:
        if request.reference_image_urls:
            try:
                return self._render(request)
            except ModelError:
                # A deployment can start before the optional IP-Adapter
                # weights are cached. Keep the service usable while exposing
                # a deterministic, operator-controlled compatibility path.
                if os.getenv("OMNICHAT_IDENTITY_FALLBACK_IMAGE2IMAGE", "0") != "1":
                    raise
                return self._render(request, image_to_image=True)
        return self._render(request)


@dataclass
class VideoResult:
    file: tempfile.NamedTemporaryFile
    duration: float


class VideoGenerator:
    def __init__(self) -> None:
        self.text_model_id = os.getenv("OMNICHAT_VIDEO_TEXT_MODEL_ID", "Wan-AI/Wan2.1-T2V-1.3B-Diffusers")
        self.image_model_id = os.getenv("OMNICHAT_VIDEO_IMAGE_MODEL_ID", "Wan-AI/Wan2.1-I2V-14B-480P-Diffusers")
        self._text_pipeline = None
        self._image_pipeline = None

    def _load(self, image_to_video: bool):
        existing = self._image_pipeline if image_to_video else self._text_pipeline
        if existing is not None:
            return existing
        torch, dtype = _device_dtype()
        try:
            if image_to_video:
                from diffusers import WanImageToVideoPipeline  # type: ignore

                pipeline = WanImageToVideoPipeline.from_pretrained(self.image_model_id, torch_dtype=dtype)
                self._image_pipeline = pipeline
            else:
                from diffusers import WanPipeline  # type: ignore

                pipeline = WanPipeline.from_pretrained(self.text_model_id, torch_dtype=dtype)
                self._text_pipeline = pipeline
            pipeline.enable_model_cpu_offload()
            return pipeline
        except Exception as exc:  # pragma: no cover - model/runtime specific
            raise ModelError("video model could not be loaded") from exc

    def render(self, request: GenerationRequest) -> VideoResult:
        import torch  # type: ignore
        from diffusers.utils import export_to_video  # type: ignore

        # A contextual/create request with persona references can use the
        # first curated reference as the initial frame. This keeps identity in
        # video even though Wan's text-to-video pipeline has no multi-image
        # adapter input.
        image_to_video = request.mode == "image_to_video" or bool(request.reference_image_urls)
        pipe = self._load(image_to_video)
        generator = torch.Generator(device="cuda")
        if request.seed is not None:
            generator = generator.manual_seed(request.seed)
        frames = max(16, min(160, request.duration_seconds * int(os.getenv("OMNICHAT_VIDEO_FPS", str(16)))))
        kwargs: dict[str, Any] = {
            "prompt": request.prompt,
            "negative_prompt": request.negative_prompt or None,
            "height": request.height,
            "width": request.width,
            "num_frames": frames,
            "generator": generator,
            "num_inference_steps": int(os.getenv("OMNICHAT_VIDEO_STEPS", "30")),
        }
        if image_to_video:
            source = request.source_image_url or (request.reference_image_urls[0] if request.reference_image_urls else "")
            kwargs["image"] = _download_image(source)
        target: tempfile.NamedTemporaryFile | None = None
        try:
            with torch.inference_mode():
                result = pipe(**kwargs)
            frames_out = getattr(result, "frames", None)
            if not frames_out:
                raise ModelError("video model returned no frames")
            frames_out = frames_out[0] if isinstance(frames_out[0], list) else frames_out
            target = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
            target.close()
            export_to_video(frames_out, target.name, fps=int(os.getenv("OMNICHAT_VIDEO_FPS", "16")))
            return VideoResult(target, float(request.duration_seconds))
        except ModelError:
            if target is not None:
                Path(target.name).unlink(missing_ok=True)
            raise
        except Exception as exc:  # pragma: no cover - model/runtime specific
            if target is not None:
                Path(target.name).unlink(missing_ok=True)
            raise ModelError("video model failed to render") from exc
