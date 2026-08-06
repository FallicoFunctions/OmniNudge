"""Dependency-light avatar frame rendering helpers."""

from __future__ import annotations

from io import BytesIO


def render_frame(image_bytes: bytes, *, talking: bool, width: int = 640, height: int = 640) -> bytes:
    """Return one RGB24 avatar frame.

    The renderer keeps the character image stable and adds a small, bounded
    mouth animation while speech is being published. It is deliberately pure
    so it can be tested on a CPU without LiveKit or CUDA.
    """
    try:
        from PIL import Image, ImageDraw  # type: ignore
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("Pillow is required for avatar rendering") from exc
    if image_bytes:
        with Image.open(BytesIO(image_bytes)) as source:
            image = source.convert("RGB")
    else:
        image = Image.new("RGB", (1, 1), (24, 26, 36))
    image.thumbnail((width, height), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (width, height), (8, 9, 13))
    left = (width - image.width) // 2
    top = (height - image.height) // 2
    canvas.paste(image, (left, top))
    if talking:
        draw = ImageDraw.Draw(canvas)
        mouth_x = width // 2
        mouth_y = int(height * 0.69)
        draw.ellipse((mouth_x - 22, mouth_y - 5, mouth_x + 22, mouth_y + 9), fill=(22, 10, 15))
    return canvas.tobytes()
