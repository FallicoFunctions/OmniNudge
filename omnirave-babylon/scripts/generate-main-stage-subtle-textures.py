# Generates clean, low-contrast tileable surface maps (albedo/normal/ARM)
# for close-range material response without visual noise.
import bpy
import numpy as np
from pathlib import Path

OUT = Path(bpy.path.abspath('//')).resolve()  # run with -b on a blend inside assets-src/main-stage
OUT = Path('/Users/Nick_1/Documents/Personal_Projects/OmniNudge-omnirave/omnirave-babylon/assets-src/main-stage/textures/subtle')
OUT.mkdir(parents=True, exist_ok=True)
SIZE = 1024
rng = np.random.default_rng(91)

def tileable_noise(size, octaves):
    """Sum of smoothed random fields, each tileable by construction (wrap blur)."""
    acc = np.zeros((size, size), dtype=np.float64)
    amp_total = 0.0
    for freq, amp in octaves:
        small = rng.random((freq, freq))
        # tileable bilinear upsample via FFT-free wrap interpolation
        idx = np.linspace(0, freq, size, endpoint=False)
        x0 = np.floor(idx).astype(int) % freq
        x1 = (x0 + 1) % freq
        fx = idx - np.floor(idx)
        row = small[x0][:, x1] * 0  # placeholder shape
        a = small[np.ix_(x0, x0)]
        b = small[np.ix_(x0, x1)]
        c = small[np.ix_(x1, x0)]
        d = small[np.ix_(x1, x1)]
        wx = fx[None, :]
        wy = fx[:, None]
        layer = a * (1-wx) * (1-wy) + b * wx * (1-wy) + c * (1-wx) * wy + d * wx * wy
        acc += amp * layer
        amp_total += amp
    acc /= amp_total
    return acc

# Height field: mostly gentle large forms + faint fine tooth
height = tileable_noise(SIZE, [(8, 0.45), (32, 0.3), (128, 0.18), (512, 0.07)])

# --- Albedo: neutral 0.62 gray with +-2.5% variation (reads clean, kills banding) ---
alb = 0.62 * (1.0 + (height - 0.5) * 0.05)
alb = np.clip(alb, 0, 1)

# --- Normal map from height, gentle ---
scale = 1.6  # gentle slope
gx = (np.roll(height, -1, axis=1) - np.roll(height, 1, axis=1)) * scale
gy = (np.roll(height, -1, axis=0) - np.roll(height, 1, axis=0)) * scale
nz = np.ones_like(height)
norm = np.sqrt(gx*gx + gy*gy + nz*nz)
nx, ny, nzn = -gx/norm, gy/norm, nz/norm  # gl convention (+Y up)

# --- ARM: AO=1 (red), roughness 0.5 +-0.04 (green), metallic 1.0 pass-through (blue) ---
rough = np.clip(0.5 + (height - 0.5) * 0.08, 0, 1)
ao = np.ones_like(height)
metal = np.ones_like(height)

def save_jpg(name, r, g, b):
    img = bpy.data.images.new(name, SIZE, SIZE, alpha=False, float_buffer=False)
    px = np.empty((SIZE, SIZE, 4), dtype=np.float32)
    px[..., 0] = r; px[..., 1] = g; px[..., 2] = b; px[..., 3] = 1.0
    img.pixels.foreach_set(px.ravel())
    img.filepath_raw = str(OUT / name)
    img.file_format = 'JPEG'
    scene = bpy.context.scene
    scene.render.image_settings.file_format = 'JPEG'
    scene.render.image_settings.quality = 95
    img.save_render(str(OUT / name), scene=scene)
    print('wrote', OUT / name)

save_jpg('subtle_surface_diff_1k.jpg', alb, alb, alb)
save_jpg('subtle_surface_nor_gl_1k.jpg', nx*0.5+0.5, ny*0.5+0.5, nzn*0.5+0.5)
save_jpg('subtle_surface_arm_1k.jpg', ao, rough, metal)
print('SUBTLE_TEXTURES_DONE')
