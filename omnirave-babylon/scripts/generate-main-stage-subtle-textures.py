# Generates the low-contrast per-family surface maps for the Main Stage.
#
# Design constraints (validated in review):
# - Surfaces must read as clean crafted material at arm's length, never as
#   noise: albedo variation stays within a few percent of neutral gray.
# - Each family gets its own quiet character: brushed directional grain on
#   gold, fine isotropic tooth on stone, satin roughness breakup on black
#   hardware, soft silky forms on pearl.
# - Tint comes from the runtime albedo factors; these maps stay neutral.
#
# Run headless:  blender -b --python scripts/generate-main-stage-subtle-textures.py
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "assets-src" / "main-stage" / "textures" / "subtle"
OUT.mkdir(parents=True, exist_ok=True)
SIZE = 1024
rng = np.random.default_rng(91)


def tileable_noise(size, octaves):
    """Sum of wrap-interpolated random fields; tileable by construction."""
    acc = np.zeros((size, size), dtype=np.float64)
    amp_total = 0.0
    for freq, amp in octaves:
        small = rng.random((freq, freq))
        idx = np.linspace(0, freq, size, endpoint=False)
        x0 = np.floor(idx).astype(int) % freq
        x1 = (x0 + 1) % freq
        fx = idx - np.floor(idx)
        a = small[np.ix_(x0, x0)]
        b = small[np.ix_(x0, x1)]
        c = small[np.ix_(x1, x0)]
        d = small[np.ix_(x1, x1)]
        wx = fx[None, :]
        wy = fx[:, None]
        acc += amp * (a * (1 - wx) * (1 - wy) + b * wx * (1 - wy) + c * (1 - wx) * wy + d * wx * wy)
        amp_total += amp
    return acc / amp_total


def directional_blur_x(field, radius):
    """Wrap-around box blur along +x: stretches noise into brush streaks."""
    out = np.zeros_like(field)
    for shift in range(-radius, radius + 1):
        out += np.roll(field, shift, axis=1)
    return out / (2 * radius + 1)


def save_jpg(name, r, g, b, quality=82):
    # Low-contrast neutral maps compress extremely well; normals get a
    # higher quality since compression artifacts there become shading noise.
    img = bpy.data.images.new(name, SIZE, SIZE, alpha=False, float_buffer=False)
    px = np.empty((SIZE, SIZE, 4), dtype=np.float32)
    px[..., 0] = r
    px[..., 1] = g
    px[..., 2] = b
    px[..., 3] = 1.0
    img.pixels.foreach_set(px.ravel().astype(np.float32))
    scene = bpy.context.scene
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = quality
    img.save_render(str(OUT / name), scene=scene)
    print('wrote', OUT / name)


def emit_family(name, height, albedo_amp, rough_amp, normal_scale, rough_base=0.5):
    albedo = np.clip(0.62 * (1.0 + (height - 0.5) * albedo_amp), 0, 1)

    gx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * normal_scale
    gy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * normal_scale
    nz = np.ones_like(height)
    norm = np.sqrt(gx * gx + gy * gy + nz * nz)

    rough = np.clip(rough_base + (height - 0.5) * rough_amp, 0, 1)
    ones = np.ones_like(height)

    save_jpg(f'subtle_{name}_diff_1k.jpg', albedo, albedo, albedo)
    save_jpg(
        f'subtle_{name}_nor_gl_1k.jpg',
        -gx / norm * 0.5 + 0.5,
        gy / norm * 0.5 + 0.5,
        nz / norm * 0.5 + 0.5,
        quality=90,
    )
    save_jpg(f'subtle_{name}_arm_1k.jpg', ones, rough, ones)


# Pearl: soft large forms, silky - closest to the original universal set.
pearl = tileable_noise(SIZE, [(8, 0.5), (32, 0.3), (128, 0.15), (512, 0.05)])
emit_family('pearl', pearl, albedo_amp=0.05, rough_amp=0.08, normal_scale=1.6)

# Stone: finer isotropic tooth with mid-scale mottling.
stone = tileable_noise(SIZE, [(16, 0.35), (64, 0.3), (256, 0.22), (1024, 0.13)])
emit_family('stone', stone, albedo_amp=0.07, rough_amp=0.12, normal_scale=2.2, rough_base=0.55)

# Gold: brushed directional grain - noise stretched hard along x, contrast
# restored after the blur so the streaks stay visible at low amplitude.
gold_base = tileable_noise(SIZE, [(32, 0.3), (128, 0.35), (512, 0.35)])
gold = np.clip(0.5 + (directional_blur_x(gold_base, 22) - 0.5) * 3.2, 0, 1)
emit_family('gold', gold, albedo_amp=0.04, rough_amp=0.12, normal_scale=1.2, rough_base=0.42)

# Black hardware: very fine satin tooth; character lives in roughness breakup.
black = tileable_noise(SIZE, [(64, 0.25), (256, 0.35), (1024, 0.4)])
emit_family('black', black, albedo_amp=0.04, rough_amp=0.16, normal_scale=1.4, rough_base=0.5)

print('SUBTLE_FAMILY_TEXTURES_DONE')
