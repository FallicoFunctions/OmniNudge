from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parent.parent
TEXTURE_ROOT = ROOT / "assets-src" / "main-stage" / "textures" / "polyhaven"
SOURCE = TEXTURE_ROOT / "metal_plate_diff_1k.jpg"

TINTS = {
    "metal_plate_black_diff_1k.jpg": {
        "shadow": (0.067, 0.067, 0.067),
        "highlight": (0.306, 0.275, 0.251),
    },
    "metal_plate_gold_diff_1k.jpg": {
        "shadow": (0.427, 0.275, 0.086),
        "highlight": (0.957, 0.788, 0.443),
    },
}


def load_pixels(path):
    image = bpy.data.images.load(str(path), check_existing=False)
    image.colorspace_settings.name = "sRGB"
    pixels = list(image.pixels)
    width = image.size[0]
    height = image.size[1]
    bpy.data.images.remove(image)
    return pixels, width, height


def write_tint(filename, source_pixels, width, height, shadow, highlight):
    image = bpy.data.images.new(filename, width=width, height=height, alpha=False, float_buffer=False)
    tinted_pixels = [0.0] * (width * height * 4)

    for pixel_index in range(width * height):
        source_offset = pixel_index * 4
        red = source_pixels[source_offset]
        green = source_pixels[source_offset + 1]
        blue = source_pixels[source_offset + 2]
        luminance = red * 0.299 + green * 0.587 + blue * 0.114

        for channel in range(3):
            tinted_pixels[source_offset + channel] = shadow[channel] + (highlight[channel] - shadow[channel]) * luminance
        tinted_pixels[source_offset + 3] = 1.0

    image.pixels.foreach_set(tinted_pixels)
    image.filepath_raw = str(TEXTURE_ROOT / filename)
    image.file_format = "JPEG"
    image.save(quality=92)
    bpy.data.images.remove(image)
    print(f"Wrote {TEXTURE_ROOT / filename}")


def main():
    if not SOURCE.exists():
        raise RuntimeError(f"Missing source texture: {SOURCE}")

    source_pixels, width, height = load_pixels(SOURCE)
    for filename, tint in TINTS.items():
        write_tint(filename, source_pixels, width, height, tint["shadow"], tint["highlight"])


if __name__ == "__main__":
    main()
