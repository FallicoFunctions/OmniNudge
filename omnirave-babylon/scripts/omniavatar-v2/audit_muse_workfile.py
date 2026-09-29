"""Read-only structural audit of the Muse male workfile."""

from __future__ import annotations

import json

import bpy
from mathutils import Vector


def descendants(root: bpy.types.Object) -> set[bpy.types.Object]:
    result: set[bpy.types.Object] = set()
    stack = list(root.children)
    while stack:
        obj = stack.pop()
        if obj in result:
            continue
        result.add(obj)
        stack.extend(obj.children)
    return result


def angle_deg(a: Vector, b: Vector) -> float:
    return round(a.normalized().angle(b.normalized()) * 57.29577951308232, 4)


def tri_count(obj: bpy.types.Object) -> int:
    obj.data.calc_loop_triangles()
    return len(obj.data.loop_triangles)


def main() -> None:
    scene = bpy.context.scene
    armature = bpy.data.objects["AvatarSkeleton"]
    asset = bpy.data.objects["AvatarAsset"]
    export_members = descendants(asset) | {asset}
    deform_names = {bone.name for bone in armature.data.bones if bone.use_deform}

    rest = {}
    evaluated = {}
    for name, target in (("upperarm_l", Vector((1, 0, 0))), ("upperarm_r", Vector((-1, 0, 0)))):
        bone = armature.data.bones[name]
        rest[name] = angle_deg(bone.tail_local - bone.head_local, target)
        pose = armature.pose.bones[name]
        evaluated[name] = angle_deg(pose.tail - pose.head, target)

    production_meshes = [obj for obj in export_members if obj.type == "MESH"]
    visible_meshes = [obj for obj in production_meshes if not obj.hide_render and not obj.hide_viewport]
    weights = {}
    for obj in visible_meshes:
        group_names = [group.name for group in obj.vertex_groups]
        influenced = 0
        bad = 0
        for vertex in obj.data.vertices:
            total = sum(entry.weight for entry in vertex.groups if group_names[entry.group] in deform_names)
            if total > 0:
                influenced += 1
                if total < 0.999 or total > 1.001:
                    bad += 1
        weights[obj.name] = {
            "vertices": len(obj.data.vertices),
            "influenced": influenced,
            "badWeightSums": bad,
            "armatureModifier": any(mod.type == "ARMATURE" and mod.object == armature for mod in obj.modifiers),
        }

    reference_collections = {}
    for name in ("SOURCE_TripoV31_DoNotExport", "SEGREF_TripoSeg_DoNotExport"):
        collection = bpy.data.collections.get(name)
        if collection:
            meshes = [obj for obj in collection.all_objects if obj.type == "MESH"]
            reference_collections[name] = {
                "hideViewport": collection.hide_viewport,
                "hideRender": collection.hide_render,
                "meshCount": len(meshes),
                "triangles": sum(tri_count(obj) for obj in meshes),
                "insideAvatarAsset": any(obj in export_members for obj in meshes),
            }

    nla = []
    if armature.animation_data:
        for track in armature.animation_data.nla_tracks:
            nla.append({"name": track.name, "mute": track.mute, "strips": [strip.action.name for strip in track.strips]})

    report = {
        "frame": scene.frame_current,
        "restUpperarmHorizontalErrorDeg": rest,
        "evaluatedUpperarmHorizontalErrorDeg": evaluated,
        "activeAction": armature.animation_data.action.name if armature.animation_data and armature.animation_data.action else None,
        "nlaTracks": nla,
        "avatarAsset": {
            "productionMeshCount": len(production_meshes),
            "allTriangles": sum(tri_count(obj) for obj in production_meshes),
            "visibleMeshNames": sorted(obj.name for obj in visible_meshes),
            "visibleTriangles": sum(tri_count(obj) for obj in visible_meshes),
        },
        "referenceCollections": reference_collections,
        "materials": sorted(mat.name for mat in bpy.data.materials if mat.name.startswith("OA_MUSE_")),
        "weights": weights,
    }
    print("MUSE_AUDIT=" + json.dumps(report, separators=(",", ":")))


if __name__ == "__main__":
    main()
