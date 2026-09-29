#!/usr/bin/env python3
"""Compose the fixed luxury-avatar validation studio and side-by-side plate."""

import math
import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter


root = Path(__file__).resolve().parent.parent
pass_number = sys.argv[1]
reference = Image.open(root.parent / ".superpowers/brainstorm/49113-1780456702/content/assets/avatar-luxury-festival.png").convert("RGB")
reference = reference.resize((768, 1152), Image.Resampling.LANCZOS)
avatar = Image.open(root / ".img2threejs/luxury-festival/render/blender-luxury-male-front.png").convert("RGBA")
w, h = avatar.size
background = Image.new("RGBA", (w, h))
pixels = background.load()
floor_y = int(h * .71)
for y in range(h):
    dy = (y - h * .44) / (h * .72)
    for x in range(w):
        dx = (x - w * .5) / (w * .70)
        t = min(1., math.hypot(dx, dy))
        t = t * t * (3 - 2 * t)
        rgb = [(17, 20, 24)[i] * (1 - t) + (4, 5, 8)[i] * t for i in range(3)]
        if y >= floor_y:
            fy = (y - floor_y) / (h - floor_y)
            radial = max(0., 1 - abs(x - w * .5) / (w * .72))
            floor = (12 + 8 * fy + 5 * radial, 15 + 8 * fy + 6 * radial, 21 + 10 * fy + 8 * radial)
            blend = min(1., (y - floor_y) / 36)
            rgb = [rgb[i] * (1 - blend) + floor[i] * blend for i in range(3)]
        pixels[x, y] = tuple(round(value) for value in rgb) + (255,)
scene = Image.alpha_composite(background, avatar)
contact = int(h * .925)
reflection = avatar.transpose(Image.Transpose.FLIP_TOP_BOTTOM)
reflection.putalpha(reflection.getchannel("A").point(lambda alpha: int(alpha * .52)))
reflection = ImageEnhance.Brightness(reflection).enhance(.55).filter(ImageFilter.GaussianBlur(3.5))
layer = Image.new("RGBA", (w, h))
layer.alpha_composite(reflection, (0, 2 * contact - (h - 1)))
fade = Image.new("L", (w, h), 0)
fade_pixels = fade.load()
for y in range(contact, h):
    alpha = int(255 * max(0., 1 - (y - contact) / (h - contact)))
    for x in range(w):
        fade_pixels[x, y] = alpha
layer.putalpha(Image.composite(layer.getchannel("A"), Image.new("L", (w, h), 0), fade))
scene = Image.alpha_composite(scene, layer).convert("RGB")
plate = Image.new("RGB", (1552, 1184), (245, 242, 236))
plate.paste(reference, (8, 16))
plate.paste(scene, (784, 16))
plate.save(root / f".img2threejs/luxury-festival-final/comparison-pass{pass_number}.png")
