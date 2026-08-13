from __future__ import annotations

import math

import bmesh
import bpy


# Connection Map:
#   V100_CentralWaterLightHousingArray base <-> V69_PlazaPaverPearlBands crown: >=0.06m Z overlap so fixtures read seated in the promenade skin
#   V100_CentralWaterLightGoldTrimArray shoulder <-> V100_CentralWaterLightHousingArray cap: >=0.04m Z overlap so the trim does not float
#   V100_CentralWaterLightLensArray body <-> V100_CentralWaterLightGoldTrimArray recess: >=0.02m Z overlap so the emissive lens reads inset

LEGACY_NAMES = [f"V9_CentralWaterLightBar_{index}" for index in range(8)]
REPLACEMENT_NAMES = [
    "V100_CentralWaterLightHousingArray",
    "V100_CentralWaterLightGoldTrimArray",
    "V100_CentralWaterLightLensArray",
]

PLAZA_BANDS = "V69_PlazaPaverPearlBands"
BLACK = "V15_MatteProductionBlack"
GOLD = "V15_EngineeredGoldAnchors"
LENS = "V19_ArrivalCyanGlow"


def ensure_object_mode():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def set_active(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def resolve_collection():
    anchor = bpy.data.objects.get(LEGACY_NAMES[0])
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


def assign_material(obj, material_name):
    material = bpy.data.materials.get(material_name)
    if material is None:
        raise RuntimeError(f"Missing material: {material_name}")
    obj.data.materials.clear()
    obj.data.materials.append(material)


def finalize(obj, bevel_width=0.015, bevel_segments=2):
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


def world_bounds(name):
    obj = bpy.data.objects[name]
    verts = [obj.matrix_world @ vertex.co for vertex in obj.data.vertices]
    return {
        "x": (min(vertex.x for vertex in verts), max(vertex.x for vertex in verts)),
        "y": (min(vertex.y for vertex in verts), max(vertex.y for vertex in verts)),
        "z": (min(vertex.z for vertex in verts), max(vertex.z for vertex in verts)),
    }


def midpoint(bounds, axis):
    return (bounds[axis][0] + bounds[axis][1]) * 0.5


def span(bounds, axis):
    return bounds[axis][1] - bounds[axis][0]


def log_bounds(name):
    bounds = world_bounds(name)
    print(
        f"{name}: "
        f"X[{bounds['x'][0]:.3f},{bounds['x'][1]:.3f}] "
        f"Y[{bounds['y'][0]:.3f},{bounds['y'][1]:.3f}] "
        f"Z[{bounds['z'][0]:.3f},{bounds['z'][1]:.3f}]"
    )
    return bounds


def verify_overlap(bounds_a, bounds_b, axis, minimum, label):
    overlap = min(bounds_a[axis][1], bounds_b[axis][1]) - max(bounds_a[axis][0], bounds_b[axis][0])
    print(f"{label} overlap[{axis.upper()}]={overlap:.3f}")
    if overlap < minimum:
        raise RuntimeError(f"{label} overlap on {axis} below minimum {minimum:.3f}: {overlap:.3f}")


def verify_span(name, axis, minimum):
    actual = span(world_bounds(name), axis)
    print(f"{name} span[{axis.upper()}]={actual:.3f}")
    if actual < minimum:
        raise RuntimeError(f"{name} span on {axis} below minimum {minimum:.3f}: {actual:.3f}")


def audit_transforms(names):
    for name in names:
        obj = bpy.data.objects[name]
        rotation = tuple(round(value, 4) for value in obj.rotation_euler)
        scale = tuple(round(value, 4) for value in obj.scale)
        print(f"{name}: rot={rotation} scale={scale}")
        if rotation != (0.0, 0.0, 0.0) or scale != (1.0, 1.0, 1.0):
            raise RuntimeError(f"Unexpected transform residue on {name}: rot={rotation} scale={scale}")


def add_ring_stack_y(bm, loops):
    rings = []
    for y, points in loops:
        rings.append([bm.verts.new((x, y, z)) for x, z in points])

    for lower_ring, upper_ring in zip(rings, rings[1:]):
        count = len(lower_ring)
        for index in range(count):
            next_index = (index + 1) % count
            bm.faces.new(
                [
                    lower_ring[index],
                    lower_ring[next_index],
                    upper_ring[next_index],
                    upper_ring[index],
                ]
            )

    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


def build_loft_object(name, material_name, collection, component_loops, bevel_width, bevel_segments=1):
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)

    bm = bmesh.new()
    for loops in component_loops:
        add_ring_stack_y(bm, loops)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    bm.to_mesh(mesh)
    bm.free()

    assign_material(obj, material_name)
    finalize(obj, bevel_width=bevel_width, bevel_segments=bevel_segments)
    return obj


def station_series(y_min, y_max, count):
    return [y_min + (y_max - y_min) * index / (count - 1) for index in range(count)]


def housing_profile(half_width, z_floor, z_cap, lift):
    outer = half_width * (1.0 + 0.015 * lift)
    inner = half_width * (0.82 + 0.02 * lift)
    lens_shoulder = half_width * 0.28
    return [
        (-outer, z_floor + 0.09),
        (-outer * 0.95, z_floor + 0.03),
        (-inner, z_floor),
        (inner, z_floor),
        (outer * 0.95, z_floor + 0.03),
        (outer, z_floor + 0.09),
        (outer * 0.90, z_cap - 0.08),
        (half_width * 0.42, z_cap - 0.08),
        (lens_shoulder, z_cap),
        (-lens_shoulder, z_cap),
        (-half_width * 0.42, z_cap - 0.08),
        (-outer * 0.90, z_cap - 0.08),
    ]


def gold_profile(half_width, z_floor, z_cap, flare):
    outer = half_width * (0.94 + 0.015 * flare)
    inner = half_width * 0.22
    return [
        (-outer, z_floor + 0.04),
        (-outer * 0.92, z_floor),
        (outer * 0.92, z_floor),
        (outer, z_floor + 0.04),
        (outer * 0.90, z_cap - 0.03),
        (half_width * 0.32, z_cap - 0.04),
        (inner, z_cap),
        (-inner, z_cap),
        (-half_width * 0.32, z_cap - 0.04),
        (-outer * 0.90, z_cap - 0.03),
    ]


def lens_profile(half_width, z_floor, z_cap, swell):
    outer = half_width * (0.70 + 0.02 * swell)
    crown = half_width * 0.18
    return [
        (-outer, z_floor + 0.03),
        (-outer * 0.88, z_floor),
        (outer * 0.88, z_floor),
        (outer, z_floor + 0.03),
        (outer * 0.74, z_cap - 0.02),
        (crown, z_cap),
        (-crown, z_cap),
        (-outer * 0.74, z_cap - 0.02),
    ]


def fixture_component_loops(center_y, half_depth, profile_factory):
    loops = []
    stations = station_series(center_y - half_depth, center_y + half_depth, 4)
    for index, station_y in enumerate(stations):
        phase = index / (len(stations) - 1)
        lift = math.sin(phase * math.pi)
        loops.append((station_y, profile_factory(lift)))
    return loops


def capture_legacy_layout():
    if bpy.data.objects.get(LEGACY_NAMES[0]) is None:
        fallback = bpy.data.objects.get("V100_CentralWaterLightHousingArray")
        if fallback is not None:
            positions = [-24.0, -15.0, -6.0, 3.0, 12.0, 21.0, 30.0, 39.0]
            bounds = world_bounds(fallback.name)
            half_width = span(bounds, "x") * 0.5 - 0.12
            return [{"center_y": position, "half_width": half_width} for position in positions]

    layout = []
    for name in LEGACY_NAMES:
        bounds = world_bounds(name)
        layout.append(
            {
                "center_y": midpoint(bounds, "y"),
                "half_width": span(bounds, "x") * 0.5,
            }
        )
    return layout


def main():
    ensure_object_mode()
    collection = resolve_collection()
    layout = capture_legacy_layout()
    plaza_bounds = world_bounds(PLAZA_BANDS)

    delete_existing(REPLACEMENT_NAMES)
    delete_existing(LEGACY_NAMES)

    housing_components = []
    gold_components = []
    lens_components = []
    for item in layout:
        center_y = item["center_y"]
        half_width = item["half_width"] + 0.12
        housing_components.append(
            fixture_component_loops(
                center_y,
                0.34,
                lambda lift, half_width=half_width: housing_profile(half_width, 0.47, 0.82 + 0.02 * lift, lift),
            )
        )
        gold_components.append(
            fixture_component_loops(
                center_y,
                0.28,
                lambda lift, half_width=half_width - 0.10: gold_profile(half_width, 0.70, 0.87 + 0.01 * lift, lift),
            )
        )
        lens_components.append(
            fixture_component_loops(
                center_y,
                0.22,
                lambda lift, half_width=half_width - 0.50: lens_profile(half_width, 0.74, 0.90 + 0.01 * lift, lift),
            )
        )

    housing = build_loft_object(
        "V100_CentralWaterLightHousingArray",
        BLACK,
        collection,
        housing_components,
        bevel_width=0.02,
        bevel_segments=1,
    )
    gold = build_loft_object(
        "V100_CentralWaterLightGoldTrimArray",
        GOLD,
        collection,
        gold_components,
        bevel_width=0.012,
        bevel_segments=1,
    )
    lens = build_loft_object(
        "V100_CentralWaterLightLensArray",
        LENS,
        collection,
        lens_components,
        bevel_width=0.01,
        bevel_segments=1,
    )

    housing_bounds = log_bounds(housing.name)
    gold_bounds = log_bounds(gold.name)
    lens_bounds = log_bounds(lens.name)

    verify_overlap(plaza_bounds, housing_bounds, "z", 0.06, "plaza bands <-> housing")
    verify_overlap(housing_bounds, gold_bounds, "z", 0.04, "housing <-> gold trim")
    verify_overlap(gold_bounds, lens_bounds, "z", 0.02, "gold trim <-> lens")
    verify_span(housing.name, "y", 63.0)
    verify_span(housing.name, "x", 6.4)
    verify_span(gold.name, "y", 62.0)
    verify_span(lens.name, "y", 61.0)
    audit_transforms(REPLACEMENT_NAMES)
    bpy.ops.wm.save_mainfile()


if __name__ == "__main__":
    main()
