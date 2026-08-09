"""Lazy-loaded diffusers implementations for image and video jobs."""

from __future__ import annotations

import io
import ipaddress
import math
import os
import socket
import tempfile
import time
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
# The plus-face adapter is trained on cropped faces and is the only variant in
# this repo that reproduces a specific person. The general ip-adapter_sdxl
# transfers overall style and composition, which reads as "same vibe, different
# woman" once the scene prompt takes over.
DEFAULT_IP_ADAPTER_WEIGHT = "ip-adapter-plus-face_sdxl_vit-h.safetensors"
# Every *_vit-h adapter needs the ViT-H encoder at the repo root, not the
# ViT-bigG encoder under sdxl_models/. Loading the wrong one does not raise; it
# silently produces weak, generic identity conditioning.
DEFAULT_IP_ADAPTER_IMAGE_ENCODER = "models/image_encoder"
# The general "plus" adapter encodes the whole reference, which is where body
# shape and proportions come from. Same ViT-H encoder as the face adapter, so
# both can share one image encoder.
DEFAULT_BODY_ADAPTER_WEIGHT = "ip-adapter-plus_sdxl_vit-h.safetensors"
# Vanilla SDXL base is safety-tuned and renders a generic idealized face, which
# fights both persona likeness and the adult content this product generates.
DEFAULT_IMAGE_MODEL_ID = "SG161222/RealVisXL_V5.0"

DEFAULT_VIDEO_NEGATIVE_PROMPT = (
    "static image, no motion, frozen frame, slideshow, jitter, flicker, strobing, "
    "morphing face, changing face, distorted face, deformed hands, extra limbs, "
    "duplicate person, warping, ghosting, blurry, low quality, overexposed, "
    "compression artifacts, text, captions, watermark, signature"
)
# Wan 2.2's 5B text-and-image-to-video model. Apache-2.0, 720p at 24fps, and it
# fits a single 24GB GPU, which the 14B mixture-of-experts variants do not.
DEFAULT_VIDEO_MODEL_ID = "Wan-AI/Wan2.2-TI2V-5B-Diffusers"
DEFAULT_VIDEO_FPS = 24
# The trained clip length: 121 frames is about five seconds at 24fps.
DEFAULT_VIDEO_MAX_FRAMES = 121
DEFAULT_VIDEO_MAX_AREA = 720 * 1280


# Distinguishes "caller has not detected yet" from a genuine "no face found",
# so passing None short-circuits detection instead of retriggering it.
_UNSET_BOX: Any = object()


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
    # Photoreal SDXL finetunes are trained for lower guidance than SDXL base.
    # Running them at 7.5 oversaturates skin and hardens edges, which reads as
    # "AI render" rather than photograph.
    is_photoreal = any(name in normalized for name in ("realvis", "juggernaut", "lustify"))
    default_steps = 4 if is_distilled else (30 if is_photoreal else 25)
    default_guidance = 0.0 if is_distilled else (5.0 if is_photoreal else 7.5)
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
    """Keep common rendering defects out of every generated image.

    Scene-specific negatives are derived from structured state, never from
    substring matches on transcript text. Keyword sniffing previously appended a
    two-person BDSM negative block to any scene whose location merely contained
    the word "dungeon".
    """
    custom = " ".join(request_negative_prompt.split()).strip()
    parts = [DEFAULT_IMAGE_NEGATIVE_PROMPT]
    scene = scene or {}
    if mode.strip().lower() == "contextual":
        location = _scene_text(scene, "location").lower()
        if location and any(term in location for term in _INDOOR_TERMS):
            parts.append("forest, trees, foliage, outdoor landscape, sky, campsite, park background")
        if scene.get("include_user_body"):
            # The frame intentionally contains two people, so duplicate
            # suppression must not ask the model to remove the second body.
            parts.append("third person, extra adult, duplicate subject, twin, fused bodies, extra limbs")
        else:
            parts.append("second subject, duplicate subject, extra person, extra faces, crowd, bystander")
        # An adult-tuned checkpoint drifts to nude regardless of the positive
        # prompt, so a tracked outfit has to be defended from the negative side.
        # But only the parts the outfit actually covers: a lower-body-only
        # outfit means topless is correct, and blanket-negating "topless" told
        # the model to invent a top over an explicit g-string-only scene.
        outfit = _visible_outfit(scene)
        if outfit:
            if _covers_upper_body(outfit):
                parts.append("nude, naked, topless, undressed, exposed breasts, bare skin instead of clothing")
            else:
                parts.append("shirt, top, bra, blouse, covered chest, fully clothed")
        # An adult checkpoint's prior is a slim fitness build, which quietly
        # overrides a fuller figure stated in the positive prompt. When the
        # persona is described as full, defend that from the negative side too.
        if _describes_full_figure(_scene_text(scene, "subject_appearance")):
            parts.append("slim, skinny, thin, athletic build, toned abs, flat stomach, fitness model, petite")
        # "Smiling at camera" is a very strong portrait prior. When the scene
        # tracked a different expression, say so explicitly.
        expression = _scene_text(scene, "expression").lower()
        if expression and not any(
            cue in expression for cue in ("smil", "grin", "laugh", "happy", "beam", "playful", "joy")
        ):
            parts.append("smiling, grinning, laughing, cheerful expression")
    if custom:
        parts.append(custom)
    return ", ".join(parts)


_INDOOR_TERMS = (
    "dungeon", "room", "bedroom", "bathroom", "kitchen", "office", "studio",
    "bar", "club", "cellar", "castle", "prison", "interior", "indoors",
)


def _scene_text(scene: dict[str, Any], key: str) -> str:
    value = scene.get(key)
    if not isinstance(value, str):
        return ""
    # Values arrive as sentence fragments and are re-punctuated below, so a
    # trailing period here would double up.
    return " ".join(value.split()).strip().rstrip(".")


def _scene_list(scene: dict[str, Any], key: str) -> list[str]:
    values = scene.get(key)
    if not isinstance(values, list):
        return []
    cleaned = []
    for value in values:
        if not isinstance(value, str):
            continue
        text = " ".join(value.split()).strip()
        if text:
            cleaned.append(text)
    return cleaned


def _scene_recent_context(scene: dict[str, Any], fallback: str = "") -> str:
    """Return the most recent physical beats, latest first.

    The backend already strips role labels and dialogue from these events, so
    this only bounds and orders them. Latest first keeps the current action
    inside the model's effective text window.
    """
    cleaned = _scene_list(scene if isinstance(scene, dict) else {}, "recent_events")
    if not cleaned:
        return fallback
    recent = "; ".join(reversed(cleaned[-3:]))
    if len(recent) > 420:
        recent = recent[:420].rsplit(" ", 1)[0]
    return recent


def build_image_prompt(
    request_prompt: str,
    mode: str = "create",
    scene: dict[str, Any] | None = None,
) -> str:
    """Turn structured scene state into an environment-forward photographic shot.

    Contextual requests are serialized from the ``scene`` dict the backend
    sends. The backend owns what the scene contains, including how many people
    are in frame; this function only phrases it for a diffusion model.

    Earlier versions re-parsed the backend's prose prompt with regexes and
    inferred composition from transcript keywords. That produced a canned
    dungeon description for any location containing "dungeon" and forced a
    second body into the frame, which is what made generated scenes ignore the
    actual roleplay.
    """
    prompt = " ".join(request_prompt.split()).strip().rstrip(".")
    if mode.strip().lower() != "contextual":
        # The reference may be a person, anime art, or an object. Describing it
        # as "the subject" lets the reference decide; asserting a human here
        # would fight a legitimate request such as "chair on a mountain".
        return (
            "A single coherent photorealistic image. Use the supplied reference only "
            "for the subject's identity and appearance; do not copy "
            f"its background, crop, lighting, or framing. {prompt}."
        )

    scene = scene or {}
    return _budgeted_contextual_prompt(scene)


# With chunked encoding the 77-token ceiling is lifted, so the budget exists
# only to stop a runaway transcript, not to ration real scene facts. Ordering
# still matters: earlier tokens land in the first chunk and carry more weight.
# Without chunking this must stay near 58 or the tail is silently discarded.
CONTEXTUAL_PROMPT_MAX_WORDS = 150
TRUNCATED_PROMPT_MAX_WORDS = 58


def _clause_words(clause: str) -> int:
    return len(clause.split())


def _budgeted_contextual_prompt(scene: dict[str, Any]) -> str:
    """Spend the 77-token window on visual facts, highest value first.

    Ordering is deliberate and was derived from real failures: an earlier
    version led with a long room description plus instruction boilerplate, which
    consumed the whole window. Outfit appeared at word 93 and accessories at
    132, so the model never saw them and rendered the character nude, smiling,
    and without her jewellery while getting the room exactly right.

    Negative-space instructions ("do not add anyone else") are deliberately not
    here; a diffusion model does not act on them and they belong in the negative
    prompt, which has its own separate budget.
    """
    outfit = _visible_outfit(scene)
    accessories = _scene_list(scene, "accessories")
    expression = _scene_text(scene, "expression")
    activity = _scene_text(scene, "activity")
    pose = _scene_text(scene, "pose")
    location = _short_location(scene)
    mood = _scene_text(scene, "mood")
    others = _scene_list(scene, "other_characters")
    appearance = _scene_text(scene, "subject_appearance")
    viewer = _scene_text(scene, "viewer_position")

    # Tag-style, comma separated. SDXL responds better to dense descriptors
    # than to prose, and full sentences spend the scarce 77-token window on
    # grammar. Gender-neutral throughout: the reference may be anime art or an
    # object, and "she/her" would fight a legitimate non-human request.
    clauses: list[str] = ["photorealistic full-body photograph"]
    if scene.get("include_user_body"):
        # Only stated when the tracked interaction actually puts the viewer in
        # frame. High priority because it changes the composition.
        clauses.append("two people, the viewer's body in the foreground, viewer's face out of frame")
    if appearance:
        clauses.append(appearance)
    if outfit:
        clauses.append(f"wearing {outfit}")
    if accessories:
        clauses.append(", ".join(_worn_first(accessories)[:3]))
    # Activity is what the hands are doing and pose is how the body is held.
    # They are complementary; picking one dropped "playing with breasts" in
    # favour of "leaning forward over the bed".
    if activity:
        clauses.append(activity)
    if pose:
        clauses.append(pose)
    if expression:
        clauses.append(f"{expression} expression")
    if not activity and not pose and not expression:
        # Structured state is preferred, but fall back to the latest tracked
        # beat so a sparse scene still describes what is happening.
        recent = _scene_recent_context(scene).split(";")[0].strip()
        if recent:
            clauses.append(recent)
    if viewer:
        # The camera sits where the user is, so their position decides the
        # foreground. Without this a user lying on the bed got a shot of the
        # character with the bed behind her. Kept terse: a verbose camera note
        # starves the location clause that follows it.
        clauses.append(f"POV from {_first_words(viewer, 6)}")
    if location:
        clauses.append(f"in {location}")
    if others:
        clauses.append(f"also present: {', '.join(others[:2])}")
    if mood:
        clauses.append(f"{mood} mood")

    default_budget = (
        CONTEXTUAL_PROMPT_MAX_WORDS if long_prompt_enabled() else TRUNCATED_PROMPT_MAX_WORDS
    )
    budget = _positive_int_env(
        "OMNICHAT_PROMPT_MAX_WORDS", default_budget, minimum=20, maximum=400
    )
    selected: list[str] = []
    used = 0
    for clause in clauses:
        length = _clause_words(clause)
        if used + length > budget:
            # Strict priority: stop rather than skip ahead to a shorter, less
            # important clause, so the ordering above is what actually ships.
            break
        selected.append(clause)
        used += length
    return ", ".join(selected) + "."


_WORN_ACCESSORY_CUES = (
    "earring", "necklace", "collar", "choker", "bracelet", "ring", "anklet",
    "glasses", "mask", "blindfold", "cuff", "hat", "watch", "piercing", "chain",
    "stocking", "glove", "boot", "heel", "harness",
)


def _worn_first(accessories: list[str]) -> list[str]:
    """Prefer accessories worn on the body over props merely held.

    The accessory list is capped to fit the token budget, and a held prop can
    otherwise crowd out jewellery. Worn items sit on the character and are what
    a viewer notices missing; a flogger in hand is easier to lose.
    """
    worn = [item for item in accessories if any(cue in item.lower() for cue in _WORN_ACCESSORY_CUES)]
    held = [item for item in accessories if item not in worn]
    return worn + held


def _visible_outfit(scene: dict[str, Any]) -> str:
    """Return clothing only, and never the string the extractor uses for nude."""
    outfit = _scene_text(scene, "outfit")
    if not outfit:
        return ""
    if outfit.strip().lower() in {"none", "nude", "naked", "unspecified", "no clothing"}:
        return ""
    return outfit


# Garments that cover the torso. Anything else -- a thong, panties, shorts,
# stockings -- leaves the chest bare, so negating "topless" for those outfits
# fights the scene instead of defending it.
_UPPER_BODY_GARMENTS = (
    "top", "shirt", "blouse", "bra", "bodysuit", "dress", "corset", "harness",
    "sweater", "tee", "tank", "camisole", "jacket", "coat", "robe", "lingerie",
    "catsuit", "leotard", "bikini", "crop", "bodice", "vest", "hoodie", "gown",
)


# Words that mean a fuller body. Describing one in the positive prompt is not
# enough on its own: the checkpoint's default person is slim and wins ties.
_FULL_FIGURE_CUES = (
    "curvy", "full", "soft", "plus size", "plus-size", "thick", "heavy",
    "wide hips", "chubby", "voluptuous", "plump", "rounded", "untoned",
)


def _describes_full_figure(appearance: str) -> bool:
    lowered = appearance.lower()
    return any(cue in lowered for cue in _FULL_FIGURE_CUES)


def _covers_upper_body(outfit: str) -> bool:
    return any(garment in outfit.lower() for garment in _UPPER_BODY_GARMENTS)


def _short_location(scene: dict[str, Any]) -> str:
    """Compress the room description so it cannot eat the whole token budget.

    Truncation stops at a clause boundary. Cutting mid-phrase leaves fragments
    like "multiple closets; walls" that read as their own visual instruction.
    """
    location = _scene_text(scene, "location").rstrip(" .")
    if not location:
        return ""
    cap = _location_word_cap()
    if len(location.split()) <= cap:
        return location
    kept: list[str] = []
    for clause in location.replace(";", ",").split(","):
        clause = clause.strip()
        if not clause:
            continue
        if kept and len(" ".join(kept + [clause]).split()) > cap:
            break
        kept.append(clause)
    if kept:
        return _first_words(", ".join(kept), cap)
    return _first_words(location, cap)


# With chunked encoding there is room for the room. The cap only exists to stop
# a pathological description, and drops to 8 when the 77-token ceiling applies.
_LOCATION_MAX_WORDS = 40
_TRUNCATED_LOCATION_MAX_WORDS = 8


def _location_word_cap() -> int:
    return _LOCATION_MAX_WORDS if long_prompt_enabled() else _TRUNCATED_LOCATION_MAX_WORDS


# Truncating mid-phrase leaves danglers like "against the headboard of", which
# read as their own half-instruction. Drop trailing function words instead.
_DANGLING_TAIL_WORDS = frozenset(
    ("of", "the", "a", "an", "and", "with", "in", "on", "at", "to", "from", "by", "for", "her", "his", "their")
)


def _first_words(value: str, count: int) -> str:
    words = value.split()
    if len(words) > count:
        words = words[:count]
    while words and words[-1].strip(" .,;").lower() in _DANGLING_TAIL_WORDS:
        words.pop()
    return " ".join(words).rstrip(" .,;")


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


def _download_reference_images(urls: tuple[str, ...]) -> list[Any]:
    """Download every persona reference, tolerating failures after the anchor.

    The first URL is the persona's avatar and is required: without it there is
    no identity at all. Gallery extras only refine the embedding, so a single
    broken or expired gallery URL must not fail the whole generation.
    """
    if not urls:
        return []
    images = [_download_image(urls[0])]
    for url in urls[1:]:
        try:
            images.append(_download_image(url))
        except ModelError as exc:
            print(f"omnichat: skipping unusable identity reference: {exc}", flush=True)
    return images


def _resize_image(image: Any, width: int, height: int) -> Any:
    """Normalize provider output to the contract's requested dimensions."""
    if image.width == width and image.height == height:
        return image
    try:
        from PIL import Image  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise ModelError("Pillow is not installed") from exc
    return image.resize((width, height), Image.Resampling.LANCZOS)


def _focus_identity_reference(image: Any, box: tuple[int, int, int, int] | None = _UNSET_BOX) -> Any:
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

    if box is _UNSET_BOX:
        box = _detect_face_box(image)
    if box is not None:
        focused = _crop_to_face(image, box)
        return _matte_identity_reference(focused)
    # Keep the crop tight enough that an outdoor avatar backdrop cannot become
    # a second scene instruction. The face and hair are sufficient for the
    # reference adapter; the text prompt supplies body, clothing, and setting.
    # The plus-face adapter is trained on face crops and degrades when given a
    # wide frame, so this is deliberately tighter than a half-body portrait and
    # is tunable while the crop is being dialed in against real avatars.
    crop_ratio = _bounded_float_env("OMNICHAT_IDENTITY_CROP_RATIO", 0.48, minimum=0.2, maximum=1.0)
    side = max(1, int(min(width, height) * crop_ratio))
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


def _detect_face_box(image: Any) -> tuple[int, int, int, int] | None:
    """Locate the largest human face, or None when there isn't one.

    The fixed geometric crop assumed a portrait-ish avatar with the face near
    the top centre. A 1920x1080 avatar broke that badly: the crop sliced the
    chin and mouth off and pushed the face against the frame edge, so the
    adapter was shown a partial face and produced a merely similar stranger.

    Returning None is a normal outcome, not an error. Anime art and non-human
    references have no detectable face and fall through to the geometric crop,
    which is the behaviour they need.
    """
    if os.getenv("OMNICHAT_FACE_DETECT", "1").strip().lower() in {"0", "false", "no", "off"}:
        return None
    try:
        import cv2  # type: ignore
        import numpy as np  # type: ignore
    except ImportError:
        return None
    try:
        cascade_path = os.path.join(cv2.data.haarcascades, "haarcascade_frontalface_default.xml")
        if not os.path.exists(cascade_path):
            return None
        detector = cv2.CascadeClassifier(cascade_path)
        frame = np.array(image.convert("RGB"))[:, :, ::-1]
        grey = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        # A generous minimum size avoids locking onto background faces.
        smallest = max(32, int(min(image.size) * 0.08))
        faces = detector.detectMultiScale(grey, 1.1, 5, minSize=(smallest, smallest))
        if len(faces) == 0:
            return None
        x, y, w, h = max(faces, key=lambda box: int(box[2]) * int(box[3]))
        return int(x), int(y), int(w), int(h)
    except Exception:  # pragma: no cover - detector/runtime specific
        return None


def _crop_to_face(image: Any, box: tuple[int, int, int, int]) -> Any:
    """Square crop centred on the face, with room for hair, chin and neck."""
    from PIL import Image, ImageOps  # type: ignore

    width, height = image.size
    x, y, w, h = box
    centre_x = x + w / 2
    # Bias upward: the detector's box stops at the hairline, but hair is a
    # large part of how a person is recognised.
    centre_y = y + h * 0.45
    margin = _bounded_float_env("OMNICHAT_FACE_CROP_MARGIN", 2.1, minimum=1.0, maximum=4.0)
    side = max(16, int(max(w, h) * margin))
    side = min(side, min(width, height))
    left = int(min(max(0, centre_x - side / 2), width - side))
    top = int(min(max(0, centre_y - side / 2), height - side))
    crop = image.crop((left, top, left + side, top + side)).convert("RGB")
    return ImageOps.fit(crop, (768, 768), method=Image.Resampling.LANCZOS)


def _matte_identity_reference(focused: Any) -> Any:
    """Fade the frame edge to neutral grey so scenery is not read as identity."""
    from PIL import Image, ImageDraw, ImageFilter  # type: ignore

    neutral = Image.new("RGB", focused.size, (128, 128, 128))
    mask = Image.new("L", focused.size, 0)
    draw = ImageDraw.Draw(mask)
    size = focused.width
    draw.ellipse((int(size * 0.04), int(-size * 0.08), int(size * 0.96), int(size * 1.08)), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(max(12, int(size * 0.035))))
    return Image.composite(focused, neutral, mask)


def _identity_reference_images(references: list[Any], boxes: list[Any] | None = None) -> list[Any]:
    """Face-crop every supplied reference, best anchor first."""
    if boxes is None:
        boxes = [_UNSET_BOX] * len(references)
    focused = [_focus_identity_reference(image, box) for image, box in zip(references, boxes)]
    if not focused:
        raise ModelError("identity reference is unavailable")
    return focused


def _identity_reference_image(references: list[Any]) -> Any:
    """Return the single primary anchor, for the one-image fallback path."""
    return _identity_reference_images(references)[0]


def body_adapter_enabled() -> bool:
    """Whether the whole-image adapter is loaded alongside the face adapter.

    The face adapter is trained on face crops and carries no body information,
    so figure and proportions drift between generations. The general "plus"
    adapter conditions on the whole reference and fixes that, at the cost of
    also carrying clothing, pose and background, which fight the scene prompt.
    It therefore runs at a much lower scale than the face adapter, and can be
    switched off entirely without a rebuild.
    """
    return os.getenv("OMNICHAT_BODY_ADAPTER", "1").strip().lower() not in {"0", "false", "no", "off"}


def body_adapter_scale() -> float:
    return _bounded_float_env("OMNICHAT_BODY_ADAPTER_SCALE", 0.3, minimum=0.0, maximum=1.0)


def identity_adapter_weights() -> list[str]:
    """Adapter weight files in the order their images must be supplied.

    Order is load order, and diffusers requires ip_adapter_image to be a list
    of exactly this length. Getting the count wrong raises ValueError and fails
    the whole generation, so both are derived from this one list.
    """
    face = os.getenv("OMNICHAT_IP_ADAPTER_WEIGHT", DEFAULT_IP_ADAPTER_WEIGHT)
    if not body_adapter_enabled():
        return [face]
    return [os.getenv("OMNICHAT_BODY_ADAPTER_WEIGHT", DEFAULT_BODY_ADAPTER_WEIGHT), face]


def _body_reference_image(image: Any) -> Any:
    """Whole-frame reference for the body adapter, squared without cropping.

    The face adapter gets a tight face crop; this one deliberately keeps the
    full figure. Letterboxing to neutral grey preserves proportions, which is
    the entire point of this adapter, where a centre-crop would distort them.
    """
    from PIL import Image  # type: ignore

    width, height = image.size
    side = max(width, height)
    canvas = Image.new("RGB", (side, side), (128, 128, 128))
    canvas.paste(image.convert("RGB"), ((side - width) // 2, (side - height) // 2))
    return canvas.resize((768, 768), Image.Resampling.LANCZOS)


def build_ip_adapter_images(references: list[Any]) -> list[Any]:
    """Build one entry per loaded adapter, in load order.

    Diffusers reads the outer list as one entry per adapter and each inner list
    as several references for that adapter, batching and attending over them.
    Using that native path rather than hand-averaging embeddings keeps the
    maths inside diffusers' own tested code.

    The persona's avatar is repeated so it carries more weight than curated
    extras; otherwise a few mediocre additions would drag the identity away
    from the canonical face over time.
    """
    # Route by face size. A full-body reference has a small face, and
    # upscaling that crop to 768px feeds the face adapter a blurry face, which
    # dilutes the very signal it exists to provide. Such references still carry
    # good body information, so they go to the body adapter only.
    # Detect once per reference. Haar is ~284ms on a 2016x3072 photo, and the
    # three consumers below would otherwise each re-detect the same unmodified
    # image: 18 detections for six references instead of six.
    boxes = [_detect_face_box(image) for image in references]

    pairs = [
        (image, box)
        for image, box in zip(references, boxes)
        if _face_is_detailed_enough(image, box)
    ]
    if not pairs:
        # The anchor is always a face reference even if it fails the size test;
        # without it there is no identity conditioning at all.
        pairs = [(references[0], boxes[0])]

    faces = _identity_reference_images([p[0] for p in pairs], [p[1] for p in pairs])
    anchor_repeat = _positive_int_env("OMNICHAT_IDENTITY_ANCHOR_REPEAT", 2, minimum=1, maximum=4)
    face_entry = [faces[0]] * anchor_repeat + faces[1:]
    if not body_adapter_enabled():
        return [face_entry]
    # A close portrait carries no proportions and would dilute them, so the body
    # adapter only sees references where the body is actually in frame. The two
    # roles are separate: portraits teach the face, full-length shots teach the
    # figure, and most references serve only one of the two.
    body_sources = [
        image for image, box in zip(references, boxes) if not _is_close_portrait(image, box)
    ]
    if not body_sources:
        body_sources = references
    bodies = [_body_reference_image(image) for image in body_sources]
    return [bodies, face_entry]


def _is_close_portrait(image: Any, box: tuple[int, int, int, int] | None = _UNSET_BOX) -> bool:
    """Whether the frame is mostly face, leaving no usable body information."""
    if box is _UNSET_BOX:
        box = _detect_face_box(image)
    if box is None:
        return False
    try:
        height = image.size[1]
    except Exception:
        return False
    minimum = _bounded_float_env("OMNICHAT_PORTRAIT_FACE_RATIO", 0.30, minimum=0.05, maximum=1.0)
    return height > 0 and (box[3] / height) >= minimum


def _face_is_detailed_enough(image: Any, box: tuple[int, int, int, int] | None = _UNSET_BOX) -> bool:
    """Whether this reference's face survives encoding at full detail.

    The CLIP image encoder consumes 224x224 regardless of what it is handed, so
    the only thing that matters is whether the native face crop is at least that
    large. If it is, the crop is downscaled and loses nothing.

    An earlier version compared the face against the frame's short edge, which
    rejected perfectly good frontal faces in full-length shots: a 155px face in
    a 1023px-wide photo crops to 325px natively, comfortably above 224. That
    threshold discarded real identity information for no reason.
    """
    if box is _UNSET_BOX:
        box = _detect_face_box(image)
    if box is None:
        # No detectable face (a profile view, anime art, an object). The
        # geometric top-anchored crop handles these acceptably, so they stay
        # available rather than being dropped.
        return True
    margin = _bounded_float_env("OMNICHAT_FACE_CROP_MARGIN", 2.1, minimum=1.0, maximum=4.0)
    minimum = _positive_int_env("OMNICHAT_FACE_MIN_CROP_PX", 224, minimum=64, maximum=1024)
    return int(max(box[2], box[3]) * margin) >= minimum


def identity_adapter_scale(request: GenerationRequest) -> float:
    """Use the identity strength the server resolved for this persona.

    Contextual scenes were previously clamped to 0.1, the floor, to stop the
    avatar's background leaking into the new setting. That is not what adapter
    scale controls: background leakage is handled by _focus_identity_reference,
    which crops to the face and mattes the surroundings to neutral grey. The
    clamp only removed identity, so every contextual scene rendered a stranger.
    """
    return max(0.1, min(1.5, float(request.identity_adapter_scale)))


def _chunk_token_ids(token_ids: list[int], chunk_size: int) -> list[list[int]]:
    if not token_ids:
        return [[]]
    return [token_ids[index : index + chunk_size] for index in range(0, len(token_ids), chunk_size)]


def encode_long_prompt(pipe: Any, prompt: str, negative_prompt: str) -> dict[str, Any]:
    """Encode prompts of any length for SDXL by chunking the CLIP context.

    CLIP's 77-token limit is a property of its positional embedding table, not
    of the UNet: cross-attention consumes a sequence of arbitrary length. So the
    prompt is split into 75-token chunks, each encoded with its own BOS/EOS, and
    the per-chunk hidden states are concatenated back into one long sequence.
    This is the same technique consumer tools use to accept paragraphs.

    SDXL has two text encoders whose penultimate hidden states are concatenated
    on the feature axis (768 + 1280 = 2048). The pooled embedding is a single
    vector for the whole prompt and is taken from the second encoder's first
    chunk. Positive and negative are padded to an equal chunk count because the
    UNet requires both sequences to be the same length.
    """
    import torch  # type: ignore

    tokenizers = [pipe.tokenizer, pipe.tokenizer_2]
    encoders = [pipe.text_encoder, pipe.text_encoder_2]
    device = getattr(pipe, "_execution_device", None) or "cuda"
    max_length = int(getattr(tokenizers[0], "model_max_length", 77))
    chunk_size = max(1, max_length - 2)

    # Chunk counts must match across prompts and across both encoders.
    chunk_count = 1
    for text in (prompt, negative_prompt):
        for tokenizer in tokenizers:
            ids = tokenizer(text, truncation=False, add_special_tokens=False).input_ids
            chunk_count = max(chunk_count, len(_chunk_token_ids(list(ids), chunk_size)))

    encoded: dict[str, Any] = {}
    for text, embed_key, pooled_key in (
        (prompt, "prompt_embeds", "pooled_prompt_embeds"),
        (negative_prompt, "negative_prompt_embeds", "negative_pooled_prompt_embeds"),
    ):
        per_encoder_states = []
        pooled = None
        for tokenizer, encoder in zip(tokenizers, encoders):
            bos = tokenizer.bos_token_id
            eos = tokenizer.eos_token_id
            pad = tokenizer.pad_token_id if tokenizer.pad_token_id is not None else eos
            chunks = _chunk_token_ids(list(tokenizer(text, truncation=False, add_special_tokens=False).input_ids), chunk_size)
            while len(chunks) < chunk_count:
                chunks.append([])

            states = []
            for index, chunk in enumerate(chunks):
                ids = [bos] + chunk + [eos]
                ids += [pad] * (max_length - len(ids))
                tensor = torch.tensor([ids[:max_length]], dtype=torch.long, device=device)
                output = encoder(tensor, output_hidden_states=True)
                # SDXL conditions on the penultimate layer, not the final one.
                states.append(output.hidden_states[-2])
                if index == 0 and encoder is encoders[-1]:
                    pooled = output[0]
            per_encoder_states.append(torch.cat(states, dim=1))

        encoded[embed_key] = torch.cat(per_encoder_states, dim=-1)
        encoded[pooled_key] = pooled
    return encoded


def long_prompt_enabled() -> bool:
    return os.getenv("OMNICHAT_LONG_PROMPT", "1").strip().lower() not in {"0", "false", "no", "off"}


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
        self.model_id = os.getenv("OMNICHAT_IMAGE_MODEL_ID", DEFAULT_IMAGE_MODEL_ID)
        self._pipeline = None
        self._pipeline_key: tuple[Any, ...] | None = None

    def _load(self, request: GenerationRequest, *, image_to_image: bool = False):
        has_references = bool(request.reference_image_urls) and not image_to_image
        adapter_scale = identity_adapter_scale(request)
        adapter_weights = identity_adapter_weights()
        key = (
            "image2image" if image_to_image else "text2image",
            has_references,
            request.identity_mode,
            request.identity_adapter,
            round(adapter_scale, 4),
            tuple(adapter_weights),
            round(body_adapter_scale(), 4),
            request.lora_model_id or "",
            request.lora_weight_name or "",
        )
        if self._pipeline is not None and self._pipeline_key == key:
            return self._pipeline
        # Drop the cache before rebuilding. self._pipeline is replaced partway
        # through the load, so leaving the old key in place would make a later
        # request matching that key return the half-configured replacement --
        # typically a pipeline with no IP-Adapter, which then fails with
        # "Got 2 images and 0 IP Adapters" on every subsequent job.
        self._pipeline = None
        self._pipeline_key = None
        torch, dtype = _device_dtype()
        try:
            from diffusers import AutoPipelineForImage2Image, AutoPipelineForText2Image  # type: ignore

            cls = AutoPipelineForImage2Image if image_to_image else AutoPipelineForText2Image
            self._pipeline = cls.from_pretrained(self.model_id, torch_dtype=dtype, use_safetensors=True)
            if has_references:
                subfolder = os.getenv("OMNICHAT_IP_ADAPTER_SUBFOLDER", DEFAULT_IP_ADAPTER_SUBFOLDER)
                # Both adapters live in the same repo and share the ViT-H image
                # encoder, which diffusers loads once for the first adapter.
                self._pipeline.load_ip_adapter(
                    os.getenv("OMNICHAT_IP_ADAPTER_MODEL_ID", DEFAULT_IP_ADAPTER_MODEL_ID),
                    subfolder=[subfolder] * len(adapter_weights),
                    weight_name=adapter_weights,
                    image_encoder_folder=os.getenv(
                        "OMNICHAT_IP_ADAPTER_IMAGE_ENCODER", DEFAULT_IP_ADAPTER_IMAGE_ENCODER
                    ),
                )
                # One scale per adapter, in load order. The body adapter runs
                # far weaker: it also carries clothing, pose and background,
                # which compete with the scene prompt.
                scales = [adapter_scale] if len(adapter_weights) == 1 else [body_adapter_scale(), adapter_scale]
                self._pipeline.set_ip_adapter_scale(scales)
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
            self._pipeline = None
            self._pipeline_key = None
            raise ModelError("image model could not be loaded") from exc
        return self._pipeline

    def _render(self, request: GenerationRequest, *, image_to_image: bool = False) -> ImageResult:
        # The configured SDXL IP-Adapter consumes one image. Do not download
        # unused gallery references (or allow a later bad reference to fail an
        # otherwise valid generation) until a multi-image adapter is enabled.
        # Several references are fused into one identity signal below. A bad
        # extra photo must not fail an otherwise valid generation, so download
        # failures past the first anchor are tolerated.
        references = _download_reference_images(request.reference_image_urls)
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
        if long_prompt_enabled():
            # Lifts CLIP's 77-token ceiling so the full scene description is
            # conditioned on. Falls back to the truncated text path rather than
            # failing a generation, because the text path still produces a valid
            # image from the highest-priority clauses.
            try:
                embeds = encode_long_prompt(pipe, rendered_prompt, rendered_negative_prompt)
                kwargs.pop("prompt", None)
                kwargs.pop("negative_prompt", None)
                kwargs.update(embeds)
            except Exception as exc:  # pragma: no cover - model/runtime specific
                print(f"omnichat: long-prompt encoding unavailable, truncating instead: {exc}", flush=True)

        if image_to_image and references:
            # Diffusers may preserve an input image's native frame when it is
            # passed to image-to-image. Fit it first so the generated asset
            # honors the request's aspect ratio instead of returning the raw
            # avatar's portrait/landscape dimensions.
            kwargs["image"] = _fit_reference_image(references[0], request.width, request.height)
            kwargs["strength"] = strength
        elif references:
            # Diffusers requires exactly one entry per loaded adapter and
            # raises ValueError otherwise, so this list is always built from
            # the same source as the adapter weights.
            kwargs["ip_adapter_image"] = build_ip_adapter_images(references)
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


def video_fps() -> int:
    """Frames per second for both sampling and muxing.

    Wan 2.2 is trained at 24fps. Exporting at a different rate than the model
    sampled at does not resample -- it just plays the same frames faster or
    slower -- so one value has to drive both.
    """
    return _positive_int_env("OMNICHAT_VIDEO_FPS", DEFAULT_VIDEO_FPS, minimum=8, maximum=60)


def _snap_frame_count(value: int) -> int:
    """Round a frame count down to the nearest value Wan can actually sample."""
    return max(5, ((value - 1) // 4) * 4 + 1)


def video_frame_count(duration_seconds: int, fps: int, max_frames: int) -> int:
    """Pick the sampled frame count for a requested clip length.

    Wan's temporal VAE only accepts 4k+1 frames, so an arbitrary
    duration * fps product is not a legal request. Wan 2.2 is additionally
    trained at 121 frames (about five seconds at 24fps) and degrades away from
    that length rather than failing, which is why the ceiling is a clamp and
    not a validation error: a ten-second request returns a good five-second
    clip instead of ten seconds of drift.
    """
    if fps <= 0:
        raise ModelError("video fps must be positive")
    target = max(1, duration_seconds) * fps
    nearest = round((target - 1) / 4) * 4 + 1
    return max(5, min(_snap_frame_count(max_frames), int(nearest)))


def video_max_frames() -> int:
    return _positive_int_env("OMNICHAT_VIDEO_MAX_FRAMES", DEFAULT_VIDEO_MAX_FRAMES, minimum=5, maximum=241)


def video_max_area() -> int:
    return _positive_int_env(
        "OMNICHAT_VIDEO_MAX_AREA", DEFAULT_VIDEO_MAX_AREA, minimum=320 * 320, maximum=1280 * 1280
    )


def video_pipeline_settings() -> tuple[int, float]:
    """Sampling steps and guidance, defaulting to the published Wan 2.2 values."""
    steps = _positive_int_env("OMNICHAT_VIDEO_STEPS", 50, minimum=1, maximum=100)
    guidance = _bounded_float_env("OMNICHAT_VIDEO_GUIDANCE_SCALE", 5.0, minimum=0.0, maximum=20.0)
    return steps, guidance


def video_cpu_offload(total_vram_bytes: int) -> bool:
    """Whether the pipeline is streamed from host RAM instead of held on the GPU.

    enable_model_cpu_offload parks the transformer, the UMT5 text encoder and
    the VAE in system memory and moves each one across PCIe on every denoising
    step. On a card that cannot hold the pipeline it is the only way to run at
    all; on one that can, it is roughly a 2-3x tax for nothing.

    TI2V-5B in bfloat16 is about 10 GB, the UMT5 encoder another 11, and the
    VAE stays in float32 on top -- call it 25 GB resident. A 48 GB A40 or A6000
    holds all of it, so the default only offloads below that.
    """
    setting = os.getenv("OMNICHAT_VIDEO_CPU_OFFLOAD", "auto").strip().lower()
    if setting in {"1", "true", "yes", "on"}:
        return True
    if setting in {"0", "false", "no", "off"}:
        return False
    minimum_gb = _positive_int_env(
        "OMNICHAT_VIDEO_RESIDENT_MIN_VRAM_GB", 40, minimum=8, maximum=512
    )
    return total_vram_bytes < minimum_gb * (1024**3)


def video_lora_settings() -> tuple[str, str, float] | None:
    """Operator-configured motion LoRA, or None when the base model is used.

    Unlike the identity LoRA, this comes from the endpoint environment rather
    than from a request, so it needs no allowlist: nothing a browser sends can
    reach it. It exists so a motion adapter can be swapped in by editing the
    RunPod template instead of rebuilding the worker image.
    """
    model_id = os.getenv("OMNICHAT_VIDEO_LORA_MODEL_ID", "").strip()
    if not model_id:
        return None
    weight_name = os.getenv("OMNICHAT_VIDEO_LORA_WEIGHT_NAME", "").strip()
    scale = _bounded_float_env("OMNICHAT_VIDEO_LORA_SCALE", 0.8, minimum=0.0, maximum=2.0)
    return model_id, weight_name, scale


def build_video_negative_prompt(request_negative_prompt: str) -> str:
    """Keep common video defects out of every clip.

    The still already fixed appearance, so these target motion artifacts --
    a frozen frame, a face that morphs between frames -- rather than the
    composition defects the image negative prompt handles.
    """
    custom = " ".join(request_negative_prompt.split()).strip()
    if not custom:
        return DEFAULT_VIDEO_NEGATIVE_PROMPT
    return f"{DEFAULT_VIDEO_NEGATIVE_PROMPT}, {custom}"


def _video_mod_value(pipe: Any) -> int:
    """Read the frame-size granularity the loaded pipeline requires.

    Both factors are model-specific -- Wan 2.2's high-compression VAE does not
    use the same spatial scale factor as Wan 2.1 -- so this is read off the
    pipeline rather than hardcoded. A wrong value here does not raise; it
    produces a latent the transformer silently crops.
    """
    try:
        mod_value = int(pipe.vae_scale_factor_spatial) * int(pipe.transformer.config.patch_size[1])
    except (AttributeError, IndexError, TypeError, ValueError) as exc:
        raise ModelError("video pipeline does not expose its frame size granularity") from exc
    if mod_value <= 0:
        raise ModelError("video pipeline reported an invalid frame size granularity")
    return mod_value


def video_frame_dimensions(source_width: int, source_height: int, mod_value: int, max_area: int) -> tuple[int, int]:
    """Derive the clip's frame size from the source still's own aspect ratio.

    The still is authoritative. Snapping to a fixed table instead would
    letterbox or crop it, throwing away the framing the identity pipeline just
    produced. Returns (height, width) to match the diffusers argument order.
    """
    if source_width <= 0 or source_height <= 0:
        raise ModelError("source image dimensions are invalid")
    if mod_value <= 0:
        raise ModelError("video frame size granularity must be positive")
    aspect_ratio = source_height / source_width
    height = int(round(math.sqrt(max_area * aspect_ratio)) // mod_value * mod_value)
    width = int(round(math.sqrt(max_area / aspect_ratio)) // mod_value * mod_value)
    return max(mod_value, height), max(mod_value, width)


@dataclass
class VideoResult:
    file: tempfile.NamedTemporaryFile
    duration: float
    actual_prompt: str
    # Wall clock for the two phases that dominate a clip, reported separately
    # because they have completely different fixes: a slow load is a cold start
    # or an unnecessary CPU offload, a slow sample is steps or the GPU tier.
    # Attributing one to the other is how a tuning session wastes an afternoon.
    load_seconds: float = 0.0
    inference_seconds: float = 0.0


class VideoGenerator:
    """Animates an already-rendered still.

    There is deliberately no text-to-video path. Identity conditioning lives
    entirely in the image pipeline, so a video generated from a prompt alone
    would be a different woman in a different room. The queue renders the
    identity-correct still first and passes it here as source_image_url.
    """

    def __init__(self) -> None:
        self.model_id = os.getenv("OMNICHAT_VIDEO_IMAGE_MODEL_ID", DEFAULT_VIDEO_MODEL_ID)
        self._pipeline = None

    def _load(self):
        if self._pipeline is not None:
            return self._pipeline
        torch, _ = _device_dtype()
        try:
            from diffusers import AutoencoderKLWan, WanImageToVideoPipeline  # type: ignore

            # Wan's VAE is numerically unstable in half precision and produces
            # black or banded frames; the transformer runs in bfloat16 while
            # the VAE stays in float32. This split is the documented recipe,
            # not a workaround.
            vae = AutoencoderKLWan.from_pretrained(self.model_id, subfolder="vae", torch_dtype=torch.float32)
            pipeline = WanImageToVideoPipeline.from_pretrained(
                self.model_id, vae=vae, torch_dtype=torch.bfloat16
            )
            lora = video_lora_settings()
            if lora is not None:
                model_id, weight_name, scale = lora
                pipeline.load_lora_weights(
                    model_id,
                    weight_name=weight_name or None,
                    adapter_name="omnichat_motion",
                )
                if hasattr(pipeline, "set_adapters"):
                    pipeline.set_adapters(["omnichat_motion"], adapter_weights=[scale])
            total_vram = torch.cuda.get_device_properties(0).total_memory
            if video_cpu_offload(total_vram):
                pipeline.enable_model_cpu_offload()
            else:
                pipeline.to("cuda")
            self._pipeline = pipeline
        except Exception as exc:  # pragma: no cover - model/runtime specific
            self._pipeline = None
            raise ModelError("video model could not be loaded") from exc
        return self._pipeline

    def render(self, request: GenerationRequest) -> VideoResult:
        if request.mode != "image_to_video" or not request.source_image_url:
            # The contract already rejects this, so reaching it means the
            # backend sent a video request without running its image phase.
            # Failing is correct: the old fallback silently animated a persona
            # reference photo, which rendered her in that photo's setting
            # rather than the scene the user asked for.
            raise ModelError("video generation requires a rendered source image")
        from diffusers.utils import export_to_video  # type: ignore

        source = _download_image(request.source_image_url)
        load_started = time.monotonic()
        pipe = self._load()
        load_seconds = time.monotonic() - load_started
        torch, _ = _device_dtype()
        generator = torch.Generator(device="cuda")
        if request.seed is not None:
            generator = generator.manual_seed(request.seed)
        height, width = video_frame_dimensions(
            source.width, source.height, _video_mod_value(pipe), video_max_area()
        )
        source = _resize_image(source, width, height)
        fps = video_fps()
        num_frames = video_frame_count(request.duration_seconds, fps, video_max_frames())
        steps, guidance_scale = video_pipeline_settings()
        rendered_negative_prompt = build_video_negative_prompt(request.negative_prompt)
        kwargs: dict[str, Any] = {
            "image": source,
            "prompt": request.prompt,
            "negative_prompt": rendered_negative_prompt,
            "height": height,
            "width": width,
            "num_frames": num_frames,
            "generator": generator,
            "num_inference_steps": steps,
            "guidance_scale": guidance_scale,
        }
        target: tempfile.NamedTemporaryFile | None = None
        try:
            inference_started = time.monotonic()
            with torch.inference_mode():
                result = pipe(**kwargs)
            inference_seconds = time.monotonic() - inference_started
            frames_out = getattr(result, "frames", None)
            # Length, not truthiness. The default output type is "np", so this
            # is a numpy array, and `if not frames_out` raises "truth value of
            # an array is ambiguous" rather than testing for emptiness -- which
            # the generic handler below then reports as a model failure.
            if frames_out is None or len(frames_out) == 0:
                raise ModelError("video model returned no frames")
            # Index the batch unconditionally, as the diffusers examples do.
            # The array is (batch, num_frames, H, W, C) and the list form is a
            # list of per-video frame lists; testing frames_out[0] for a list
            # kept the batch axis in the array case, which exported a one-frame
            # clip and reported its duration as 1/fps.
            frames_out = frames_out[0]
            if len(frames_out) == 0:
                raise ModelError("video model returned no frames")
            target = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
            target.close()
            export_to_video(frames_out, target.name, fps=fps)
            # Report what was actually sampled. A ten-second request is clamped
            # to the trained frame count, and the stored asset duration has to
            # match the file rather than the ask.
            return VideoResult(
                target,
                len(frames_out) / fps,
                request.prompt,
                load_seconds=load_seconds,
                inference_seconds=inference_seconds,
            )
        except ModelError:
            if target is not None:
                Path(target.name).unlink(missing_ok=True)
            raise
        except Exception as exc:  # pragma: no cover - model/runtime specific
            if target is not None:
                Path(target.name).unlink(missing_ok=True)
            raise ModelError("video model failed to render") from exc
