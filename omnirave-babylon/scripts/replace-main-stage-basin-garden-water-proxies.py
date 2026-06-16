from __future__ import annotations

import bmesh
import bpy


# Connection Map:
#   terrace base tier <-> terrace crown tier overlap: 0.14m on Y
#   terrace crown tier <-> gold crest overlap: 0.28m on Y
#   basin water base <-> basin water highlight overlap: 0.05m on Y
#   screen reflection veil stays nested inside the front-most basin water aperture with 0.12m Z clearance

LEGACY_NAMES = [
    "V7_BasinGardenLong_L",
    "V7_BasinGardenLong_R",
    "V7_BasinRetainingGold_L",
    "V7_BasinRetainingGold_R",
    "V7_BasinWaterLongAxis",
    "V7_BasinWaterScreenReflection",
]

REPLACEMENT_NAMES = [
    "V63_BasinGardenTerrace_L",
    "V63_BasinGardenTerrace_R",
    "V63_BasinGardenGoldCrest_L",
    "V63_BasinGardenGoldCrest_R",
    "V63_BasinWaterParterre",
    "V63_BasinScreenReflectionVeil",
]

PEARL = "V19_GatewayPearlIvory"
GOLD = "V19_ArrivalBrushedGold"
WATER = "V14_DeepReflectingWater"
REFLECTION = "V14_CosmicScreenEmission"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get("V7_BasinGardenLong_L")
    if anchor is None or not anchor.users_collection:
        return bpy.context.scene.collection
    return anchor.users_collection[0]


def delete_existing(names):
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        data = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if data and data.users == 0:
            bpy.data.meshes.remove(data)


def hide_legacy(names):
    for name in names:
        obj = bpy.data.objects.get(name)
        if obj is None:
            continue
        obj.hide_render = True
        obj.hide_viewport = True


def world_bounds(name):
    obj = bpy.data.objects[name]
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def proxy_bounds(name):
    obj = bpy.data.objects[name]
    half_x = obj.dimensions.x * 0.5
    half_y = obj.dimensions.y * 0.5
    half_z = obj.dimensions.z * 0.5
    return {
        "x": (obj.location.x - half_x, obj.location.x + half_x),
        "y": (obj.location.y - half_y, obj.location.y + half_y),
        "z": (obj.location.z - half_z, obj.location.z + half_z),
    }


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def add_prism_component(bm, points, y_min, y_max):
    base = [bm.verts.new((x, y_min, z)) for x, z in points]
    top = [bm.verts.new((x, y_max, z)) for x, z in points]
    bm.faces.new(base)
    bm.faces.new(list(reversed(top)))
    count = len(points)
    for index in range(count):
        next_index = (index + 1) % count
        bm.faces.new([base[index], base[next_index], top[next_index], top[index]])


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def finalize(obj, bevel_width=0.03, bevel_segments=2):
    set_active(obj)
    bevel = obj.modifiers.new("OmniRaveBevel", "BEVEL")
    bevel.width = bevel_width
    bevel.segments = bevel_segments
    bevel.limit_method = "ANGLE"
    bevel.profile = 0.72
    bpy.ops.object.modifier_apply(modifier=bevel.name)
    bpy.ops.object.shade_smooth()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.select_set(False)


def build_profile_object(name, material_name, collection, components, bevel_width=0.03, bevel_segments=2):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for component in components:
        add_prism_component(bm, component["points"], component["y_min"], component["y_max"])
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


def log_bounds(name):
    bounds = world_bounds(name)
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.3f},{bounds['x'][1]:.3f}] "
        f"Y[{bounds['y'][0]:.3f},{bounds['y'][1]:.3f}] "
        f"Z[{bounds['z'][0]:.3f},{bounds['z'][1]:.3f}]"
    )
    return bounds


def verify_overlap(name_a, name_b, axis="y", min_overlap=0.01):
    bounds_a = world_bounds(name_a)
    bounds_b = world_bounds(name_b)
    overlap = min(bounds_a[axis][1], bounds_b[axis][1]) - max(bounds_a[axis][0], bounds_b[axis][0])
    print(f"{name_a} <-> {name_b} [{axis.upper()}] overlap={overlap:.3f}")
    if overlap < min_overlap:
        raise RuntimeError(f"Gap between {name_a} and {name_b} on axis {axis}: {overlap:.3f}")


def audit_transforms(names):
    for name in names:
        obj = bpy.data.objects[name]
        rotation = tuple(round(value, 4) for value in obj.rotation_euler)
        scale = tuple(round(value, 4) for value in obj.scale)
        print(f"{name}: rot={rotation} scale={scale}")
        if rotation != (0.0, 0.0, 0.0) or scale != (1.0, 1.0, 1.0):
            raise RuntimeError(f"Unexpected transform residue on {name}: rot={rotation} scale={scale}")


def span_segments(z_min, z_max, count=4, margin=1.35, gap=2.55):
    usable = (z_max - z_min) - margin * 2 - gap * (count - 1)
    segment_length = usable / count
    start = z_min + margin
    segments = []
    for index in range(count):
        seg_min = start + index * (segment_length + gap)
        segments.append((seg_min, seg_min + segment_length))
    return segments


def tapered_strip_points(x_min, x_max, z_min, z_max, cap=0.8, shoulder=0.35, waist=0.28):
    center_x = (x_min + x_max) * 0.5
    inset_min = x_min + max((x_max - x_min) * 0.22, waist)
    inset_max = x_max - max((x_max - x_min) * 0.22, waist)
    mid_low = z_min + (z_max - z_min) * 0.28
    mid_high = z_min + (z_max - z_min) * 0.72
    return [
        (center_x, z_min - cap),
        (x_min + shoulder, z_min - cap * 0.62),
        (x_min, z_min + cap * 0.10),
        (x_min + waist * 0.25, mid_low),
        (x_min + waist * 0.12, midpoint({"z": (z_min, z_max)}, "z")),
        (x_min + waist * 0.25, mid_high),
        (x_min, z_max - cap * 0.10),
        (x_min + shoulder, z_max + cap * 0.62),
        (center_x, z_max + cap),
        (x_max - shoulder, z_max + cap * 0.62),
        (x_max, z_max - cap * 0.10),
        (x_max - waist * 0.25, mid_high),
        (x_max - waist * 0.12, midpoint({"z": (z_min, z_max)}, "z")),
        (x_max - waist * 0.25, mid_low),
        (x_max, z_min + cap * 0.10),
        (x_max - shoulder, z_min - cap * 0.62),
        (center_x + max((inset_max - center_x) * 0.12, 0.08), z_min - cap * 0.22),
        (center_x - max((center_x - inset_min) * 0.12, 0.08), z_min - cap * 0.22),
    ]


def reflection_points(x_min, x_max, z_min, z_max, cap=0.65):
    center_x = (x_min + x_max) * 0.5
    inner_x = (x_max - x_min) * 0.18
    return [
        (center_x, z_min - cap),
        (x_min + inner_x, z_min - cap * 0.5),
        (x_min, z_min + cap * 0.18),
        (x_min + inner_x * 0.35, midpoint({"z": (z_min, z_max)}, "z") - 1.1),
        (x_min + inner_x * 0.15, midpoint({"z": (z_min, z_max)}, "z")),
        (x_min + inner_x * 0.35, midpoint({"z": (z_min, z_max)}, "z") + 1.1),
        (x_min, z_max - cap * 0.18),
        (x_min + inner_x, z_max + cap * 0.5),
        (center_x, z_max + cap),
        (x_max - inner_x, z_max + cap * 0.5),
        (x_max, z_max - cap * 0.18),
        (x_max - inner_x * 0.35, midpoint({"z": (z_min, z_max)}, "z") + 1.1),
        (x_max - inner_x * 0.15, midpoint({"z": (z_min, z_max)}, "z")),
        (x_max - inner_x * 0.35, midpoint({"z": (z_min, z_max)}, "z") - 1.1),
        (x_max, z_min + cap * 0.18),
        (x_max - inner_x, z_min - cap * 0.5),
    ]


ensure_object_mode()
collection = resolve_collection()

delete_existing(REPLACEMENT_NAMES)
hide_legacy(LEGACY_NAMES)

garden_left = proxy_bounds("V7_BasinGardenLong_L")
garden_right = proxy_bounds("V7_BasinGardenLong_R")
rail_left = proxy_bounds("V7_BasinRetainingGold_L")
rail_right = proxy_bounds("V7_BasinRetainingGold_R")
water_long = proxy_bounds("V7_BasinWaterLongAxis")
water_reflection = proxy_bounds("V7_BasinWaterScreenReflection")

segments = span_segments(garden_left["y"][0], garden_left["y"][1], count=4, margin=1.4, gap=2.6)

terrace_left_components = []
terrace_right_components = []
gold_left_components = []
gold_right_components = []
water_components = []

for index, (seg_min, seg_max) in enumerate(segments):
    terrace_base_y_min = 0.16
    terrace_base_y_max = 0.62
    terrace_crown_y_min = 0.48
    terrace_crown_y_max = 1.26

    terrace_left_components.extend(
        [
            {
                "points": tapered_strip_points(
                    garden_left["x"][0] - 0.2,
                    rail_left["x"][1] - 0.18,
                    seg_min,
                    seg_max,
                    cap=0.88 if index in (0, 3) else 0.78,
                    shoulder=0.42,
                    waist=0.36,
                ),
                "y_min": terrace_base_y_min,
                "y_max": terrace_base_y_max,
            },
            {
                "points": tapered_strip_points(
                    garden_left["x"][0] + 0.34,
                    rail_left["x"][1] - 0.58,
                    seg_min + 0.9,
                    seg_max - 0.9,
                    cap=0.54,
                    shoulder=0.28,
                    waist=0.22,
                ),
                "y_min": terrace_crown_y_min,
                "y_max": terrace_crown_y_max,
            },
        ]
    )

    terrace_right_components.extend(
        [
            {
                "points": tapered_strip_points(
                    rail_right["x"][0] + 0.18,
                    garden_right["x"][1] + 0.2,
                    seg_min,
                    seg_max,
                    cap=0.88 if index in (0, 3) else 0.78,
                    shoulder=0.42,
                    waist=0.36,
                ),
                "y_min": terrace_base_y_min,
                "y_max": terrace_base_y_max,
            },
            {
                "points": tapered_strip_points(
                    rail_right["x"][0] + 0.58,
                    garden_right["x"][1] - 0.34,
                    seg_min + 0.9,
                    seg_max - 0.9,
                    cap=0.54,
                    shoulder=0.28,
                    waist=0.22,
                ),
                "y_min": terrace_crown_y_min,
                "y_max": terrace_crown_y_max,
            },
        ]
    )

    gold_left_components.append(
        {
            "points": tapered_strip_points(
                rail_left["x"][0] - 0.24,
                rail_left["x"][1] + 0.24,
                seg_min + 0.7,
                seg_max - 0.7,
                cap=0.46,
                shoulder=0.16,
                waist=0.12,
            ),
            "y_min": 0.58,
            "y_max": 1.34,
        }
    )
    gold_right_components.append(
        {
            "points": tapered_strip_points(
                rail_right["x"][0] - 0.24,
                rail_right["x"][1] + 0.24,
                seg_min + 0.7,
                seg_max - 0.7,
                cap=0.46,
                shoulder=0.16,
                waist=0.12,
            ),
            "y_min": 0.58,
            "y_max": 1.34,
        }
    )

    water_components.extend(
        [
            {
                "points": tapered_strip_points(
                    water_long["x"][0] - 0.4,
                    water_long["x"][1] + 0.4,
                    seg_min + 0.2,
                    seg_max - 0.2,
                    cap=0.78 if index in (0, 3) else 0.68,
                    shoulder=0.6,
                    waist=0.34,
                ),
                "y_min": 0.17,
                "y_max": 0.29,
            },
            {
                "points": tapered_strip_points(
                    water_long["x"][0] + 0.55,
                    water_long["x"][1] - 0.55,
                    seg_min + 0.9,
                    seg_max - 0.9,
                    cap=0.44,
                    shoulder=0.42,
                    waist=0.22,
                ),
                "y_min": 0.24,
                "y_max": 0.43,
            },
        ]
    )

reflection_components = [
    {
        "points": reflection_points(
            water_reflection["x"][0] - 0.3,
            water_reflection["x"][1] + 0.3,
            water_reflection["y"][0] - 0.55,
            water_reflection["y"][1] + 0.55,
            cap=0.72,
        ),
        "y_min": 0.24,
        "y_max": 0.39,
    }
]

build_profile_object("V63_BasinGardenTerrace_L", PEARL, collection, terrace_left_components, bevel_width=0.05, bevel_segments=2)
build_profile_object("V63_BasinGardenTerrace_R", PEARL, collection, terrace_right_components, bevel_width=0.05, bevel_segments=2)
build_profile_object("V63_BasinGardenGoldCrest_L", GOLD, collection, gold_left_components, bevel_width=0.03, bevel_segments=2)
build_profile_object("V63_BasinGardenGoldCrest_R", GOLD, collection, gold_right_components, bevel_width=0.03, bevel_segments=2)
build_profile_object("V63_BasinWaterParterre", WATER, collection, water_components, bevel_width=0.02, bevel_segments=2)
build_profile_object("V63_BasinScreenReflectionVeil", REFLECTION, collection, reflection_components, bevel_width=0.015, bevel_segments=2)

for name in REPLACEMENT_NAMES:
    log_bounds(name)

verify_overlap("V63_BasinGardenTerrace_L", "V63_BasinGardenGoldCrest_L", axis="y", min_overlap=0.28)
verify_overlap("V63_BasinGardenTerrace_R", "V63_BasinGardenGoldCrest_R", axis="y", min_overlap=0.28)
verify_overlap("V63_BasinWaterParterre", "V63_BasinScreenReflectionVeil", axis="y", min_overlap=0.05)

audit_transforms(REPLACEMENT_NAMES)

bpy.ops.wm.save_mainfile()
print("V63_BASIN_GARDEN_WATER_REPLACEMENT_COMPLETE replacements=6")
