"""Create a non-destructive male v3.1 conformance workfile.

Assembly map (reference relationships, not new physical joints):
  canonical AvatarBody <-> Tripo silhouette reference: co-located at ground origin
  canonical head/eyes <-> Tripo facial surface: aligned in one world-space frame
  canonical wardrobe slots <-> Tripo outfit surface: reference-only; no topology copy

The Tripo model remains a hidden, non-exportable high-resolution reference. The
canonical body, skeleton, eye geometry, and wardrobe hierarchy remain authoritative.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys

import bpy
from mathutils import Vector


TARGET_HEIGHT_METERS = 1.75
SOURCE_COLLECTION = "SOURCE_TripoV31_DoNotExport"
SOURCE_ROOT = "SOURCE_TripoV31_Root"


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-blend", required=True)
    parser.add_argument("--source-glb", required=True)
    parser.add_argument("--output-blend", required=True)
    parser.add_argument("--report", required=True)
    return parser.parse_args(argv)


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    if not corners:
        raise RuntimeError("No mesh bounds available")
    minimum = Vector(tuple(min(point[i] for point in corners) for i in range(3)))
    maximum = Vector(tuple(max(point[i] for point in corners) for i in range(3)))
    return minimum, maximum


def bounds_json(objects: list[bpy.types.Object]) -> dict[str, list[float]]:
    minimum, maximum = world_bounds(objects)
    return {
        "min": [round(value, 6) for value in minimum],
        "max": [round(value, 6) for value in maximum],
        "size": [round(value, 6) for value in maximum - minimum],
    }


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def move_to_collection(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for owner in list(obj.users_collection):
        owner.objects.unlink(obj)
    collection.objects.link(obj)


def main() -> None:
    args = parse_args()
    base_blend = Path(args.base_blend).expanduser().resolve()
    source_glb = Path(args.source_glb).expanduser().resolve()
    output_blend = Path(args.output_blend).expanduser().resolve()
    report_path = Path(args.report).expanduser().resolve()

    bpy.ops.wm.open_mainfile(filepath=str(base_blend))
    before_names = set(bpy.data.objects.keys())
    bpy.ops.import_scene.gltf(filepath=str(source_glb))
    imported = [obj for obj in bpy.data.objects if obj.name not in before_names]
    imported_meshes = [obj for obj in imported if obj.type == "MESH"]
    if len(imported_meshes) != 1:
        raise RuntimeError(f"Expected one Tripo mesh, received {len(imported_meshes)}")

    source_collection = bpy.data.collections.new(SOURCE_COLLECTION)
    bpy.context.scene.collection.children.link(source_collection)
    for obj in imported:
        move_to_collection(obj, source_collection)

    root = bpy.data.objects.new(SOURCE_ROOT, None)
    source_collection.objects.link(root)
    for obj in imported:
        if obj is not root and obj.parent is None:
            obj.parent = root

    source_before = bounds_json(imported_meshes)
    minimum, maximum = world_bounds(imported_meshes)
    height = maximum.z - minimum.z
    if height <= 0:
        raise RuntimeError("Tripo source has invalid height")

    # The imported Tripo character faces +X. The current canonical v1 source
    # still uses the legacy -Y working frame, so co-orient the reference with
    # that geometry for conformance. The later canonical-axis migration rotates
    # both together and must leave the exported AvatarAsset transform at identity.
    root.rotation_euler.z = -1.5707963267948966
    uniform_scale = TARGET_HEIGHT_METERS / height
    root.scale = (uniform_scale, uniform_scale, uniform_scale)
    bpy.context.view_layer.update()
    minimum, maximum = world_bounds(imported_meshes)
    center = (minimum + maximum) * 0.5
    root.location += Vector((-center.x, -center.y, -minimum.z))
    bpy.context.view_layer.update()

    for obj in imported_meshes:
        obj.name = "SOURCE_TripoV31_MaleLuxury_High"
        obj.hide_render = True
        obj.display_type = "WIRE"
        obj.show_in_front = True
        obj.color = (0.15, 0.55, 1.0, 0.35)
        obj["omniavatarRole"] = "reference-only"
        obj["exportDisabled"] = True

    source_collection["omniavatarRole"] = "reference-only"
    source_collection["exportDisabled"] = True
    root["sourceGLB"] = str(source_glb)
    root["sourceSHA256"] = file_sha256(source_glb)
    root["sourceModel"] = "v3.1-20260211"
    root["sourceTaskId"] = "e18d98ae-f543-4525-b34a-6758bfb47a08"

    scene = bpy.context.scene
    scene["avatarContract"] = "omnirave-avatar/2"
    scene["avatarCharacter"] = "male-luxury-festival"
    scene["conformanceStage"] = "source-aligned"
    scene["highResolutionReference"] = SOURCE_ROOT
    scene["highResolutionReferenceExportDisabled"] = True

    canonical_meshes = [
        obj for obj in bpy.data.objects
        if obj.type == "MESH" and obj not in imported_meshes
    ]
    report = {
        "schemaVersion": 1,
        "character": "male-luxury-festival",
        "stage": "source-aligned",
        "source": {
            "path": str(source_glb),
            "sha256": file_sha256(source_glb),
            "modelVersion": "v3.1-20260211",
            "taskId": "e18d98ae-f543-4525-b34a-6758bfb47a08",
            "meshCount": len(imported_meshes),
            "materialCount": sum(len(obj.data.materials) for obj in imported_meshes),
            "boundsBefore": source_before,
            "boundsAligned": bounds_json(imported_meshes),
            "uniformScale": round(uniform_scale, 8),
            "alignedForward": "-Y (legacy canonical working frame)",
            "exportDisabled": True,
        },
        "canonical": {
            "meshCount": len(canonical_meshes),
            "armatures": [obj.name for obj in bpy.data.objects if obj.type == "ARMATURE"],
            "body": "AvatarBody" if "AvatarBody" in bpy.data.objects else None,
            "separateEyes": all(name in bpy.data.objects for name in ("AvatarEye_l", "AvatarEye_r")),
            "separateHairOptions": len([obj for obj in canonical_meshes if obj.name.startswith("AvatarHair_")]),
            "separateWardrobeMeshes": len([
                obj for obj in canonical_meshes
                if obj.name.startswith(("AvatarTop_", "AvatarJacket_", "AvatarBottoms_", "AvatarShoes_"))
            ]),
        },
        "claims": {
            "sourceSemanticSeparation": "not-proven",
            "sourceTopologyCopied": False,
            "canonicalTopologyAuthoritative": True,
            "axisMigrationPending": "+Y v2 final authoring frame",
            "readyForRigging": False,
        },
        "nextStage": "landmark-and-silhouette-conformance",
    }

    output_blend.parent.mkdir(parents=True, exist_ok=True)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    bpy.ops.wm.save_as_mainfile(filepath=str(output_blend), compress=True)
    print("OMNIAVATAR_REPORT=" + json.dumps(report, separators=(",", ":")))


if __name__ == "__main__":
    main()
