"""Build native-skinned closed pocket zippers and pull tabs on the satin jacket."""

# Connection map: sewn pocket welts sit 1.6 mm above the evaluated outer cloth,
# with 0.8 mm tape thickness. Teeth embed about 0.08 mm into that backing.
# Slider/pull pieces use a shared local support anchor. These sub-mm textile
# joins deliberately do not use the generic 5 mm furniture overlap rule.
# All pieces use the existing armature and copied corrective values; the coat
# mesh stays intact. These are closed zipper fronts, not open pocket bags.
import argparse
import json
import sys
from itertools import pairwise
from pathlib import Path

import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import audit_rigged_jacket_sleeves as A

SOURCE = SCRIPTS.parents[1] / (
    "assets-src/avatars/launch-body-proof/rigged-jacket-satin-study/"
    "male-rigged-jacket-satin.blend"
)
PREFIX = "Jacket detail - "


def material(name, color, metallic, roughness):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    node = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    node.inputs["Base Color"].default_value = (*color, 1)
    node.inputs["Metallic"].default_value = metallic
    node.inputs["Roughness"].default_value = roughness
    return mat


def barycentric(point, triangle):
    a, b, c = triangle
    ab, ac, ap = b - a, c - a, point - a
    aa, cc, cross = ab @ ab, ac @ ac, ab @ ac
    denominator = aa * cc - cross * cross
    assert denominator > 1e-20
    v = (cc * (ab @ ap) - cross * (ac @ ap)) / denominator
    w = (aa * (ac @ ap) - cross * (ab @ ap)) / denominator
    result = np.array([1 - v - w, v, w])
    if result.min() <= -1e-4:
        # BVH hits are float32; tiny boundary triangles can amplify their
        # coordinate error. Accept only a physically bounded 2-micron repair.
        uv = np.linalg.lstsq(np.column_stack([ab, ac]), ap, rcond=None)[0]
        result = np.maximum([1 - uv.sum(), *uv], 0)
        result /= result.sum()
        assert np.linalg.norm(result @ triangle - point) < 2e-6, (
            "Barycentric hit exceeds 2-micron carrier tolerance", point.tolist()
        )
    result = np.maximum(result, 0)
    return result / result.sum()


class Attachment:
    def __init__(self, scene, rig, coat):
        self.scene, self.rig, self.coat = scene, rig, coat
        self.count = len(coat.data.vertices)
        self.native, self.native_faces = A.H.geometry(coat)
        self.native = A.array(self.native)
        self.native_faces = np.array(self.native_faces, dtype=np.int32)
        solid = next(m for m in coat.modifiers if m.type == "SOLIDIFY")
        mid, _ = A.midpoint(coat, solid, self.count)
        self.mid = A.array(mid)
        self.group_names = [g.name for g in coat.vertex_groups]
        self.weights = np.zeros((self.count, len(self.group_names)))
        for vertex in coat.data.vertices:
            for group in vertex.groups:
                self.weights[vertex.index, group.group] = group.weight
        to_coat = coat.matrix_world.inverted() @ rig.matrix_world
        from_coat = rig.matrix_world.inverted() @ coat.matrix_world
        self.bone_matrices = np.array(
            [
                coat.matrix_world
                @ to_coat
                @ rig.pose.bones[name].matrix
                @ rig.data.bones[name].matrix_local.inverted()
                @ from_coat
                for name in self.group_names
            ],
            dtype=np.float64,
        )
        self.source_shapes = np.array(
            [[p.co[:] for p in key.data] for key in coat.data.shape_keys.key_blocks]
        )
        source_matrices = np.einsum("vg,gij->vij", self.weights, self.bone_matrices)
        homogeneous = np.concatenate(
            [self.source_shapes, np.ones((*self.source_shapes.shape[:2], 1))], axis=2
        )
        self.world_shapes = np.einsum("vij,kvj->kvi", source_matrices, homogeneous)[
            :, :, :3
        ]
        self.trees = {}
        self.maximum_dropped_weight = 0.0
        self.maximum_condition = 0.0
        for region in ("torso", "sleeve"):
            faces = []
            for face in self.native_faces:
                points = self.mid[face % self.count]
                normal = np.cross(
                    self.native[face[1]] - self.native[face[0]],
                    self.native[face[2]] - self.native[face[0]],
                )
                if normal[1] >= 0:
                    continue
                if region == "torso":
                    selected = np.max(np.abs(points[:, 0])) < 0.235
                else:
                    selected = (
                        np.min(points[:, 0]) > 0.255 and np.max(points[:, 0]) < 0.445
                    )
                if selected:
                    faces.append(face)
            self.trees[region] = (
                BVHTree.FromPolygons(self.native, faces, all_triangles=True),
                np.array(faces, dtype=np.int32),
            )

    def anchor(self, xz, region):
        tree, faces = self.trees[region]
        hit, normal, index, _distance = tree.ray_cast(
            Vector((xz[0], -2, xz[1])), Vector((0, 1, 0))
        )
        if hit is None:
            raise AssertionError(f"No {region} outer-coat hit at {xz}")
        face = faces[index]
        bary = barycentric(np.array(hit), self.native[face])
        ids = face % self.count
        mid = bary @ self.mid[ids]
        return ids, bary, np.array(hit), np.array(normal.normalized()), mid

    def bind(self, ids, bary, goal):
        offset = goal - bary @ self.mid[ids]
        weights = bary @ self.weights[ids]
        order = np.argsort(-weights, kind="stable")
        dropped = float(weights[order[4:]].sum())
        self.maximum_dropped_weight = max(self.maximum_dropped_weight, dropped)
        # Barycentric samples can combine five source influences. Retain four
        # for the destination skin; record the loss and validate posed contact.
        # Dense hip samples need up to 4.40% truncation; the sleeve needs none.
        assert dropped < 0.05, dropped
        weights[order[4:]] = 0
        weights /= weights.sum()
        transform = np.einsum("g,gij->ij", weights, self.bone_matrices)
        condition = float(np.linalg.cond(transform[:3, :3]))
        self.maximum_condition = max(self.maximum_condition, condition)
        assert abs(np.linalg.det(transform[:3, :3])) > 1e-6 and condition < 5
        world_shapes = np.einsum("v,kvc->kc", bary, self.world_shapes[:, ids]) + offset
        homogeneous = np.concatenate(
            [world_shapes, np.ones((len(world_shapes), 1))], axis=1
        )
        keys = (np.linalg.inv(transform) @ homogeneous.T).T[:, :3]
        return keys, weights, offset


class Writer:
    def __init__(self, name, attachment, materials):
        self.name, self.attachment, self.materials = name, attachment, materials
        self.goals, self.anchors, self.barys = [], [], []
        self.faces, self.face_materials, self.face_components = [], [], []
        self.components = []
        self.current_component = -1

    def begin(self, kind, **metadata):
        self.current_component += 1
        self.components.append(
            dict(
                id=self.current_component,
                kind=kind,
                first_vertex=len(self.goals),
                first_face=len(self.faces),
                **metadata,
            )
        )

    def vertex(self, anchor, goal):
        ids, bary, _point, _normal, _mid = anchor
        index = len(self.goals)
        self.goals.append(goal)
        self.anchors.append(ids)
        self.barys.append(bary)
        return index

    def face(self, ids, mat):
        for j in range(1, len(ids) - 1):
            self.faces.append((ids[0], ids[j], ids[j + 1]))
            self.face_materials.append(mat)
            self.face_components.append(self.current_component)

    def finish(self):
        at = self.attachment
        all_keys, weights, offsets = [], [], []
        for ids, bary, goal in zip(self.anchors, self.barys, self.goals, strict=True):
            keys, row, offset = at.bind(ids, bary, goal)
            all_keys.append(keys)
            weights.append(row)
            offsets.append(offset)
        all_keys = np.array(all_keys).transpose(1, 0, 2)
        mesh = bpy.data.meshes.new(PREFIX + self.name)
        mesh.from_pydata(all_keys[0], [], self.faces)
        mesh.update()
        obj = bpy.data.objects.new(PREFIX + self.name, mesh)
        bpy.context.collection.objects.link(obj)
        obj.parent = at.coat
        obj.matrix_parent_inverse = Matrix.Identity(4)
        obj.matrix_basis = Matrix.Identity(4)
        for mat in self.materials:
            mesh.materials.append(mat)
        for polygon, mat in zip(mesh.polygons, self.face_materials, strict=True):
            polygon.material_index = mat
            polygon.use_smooth = (
                self.components[self.face_components[polygon.index]]["kind"] == "panel"
            )
        for name in at.group_names:
            obj.vertex_groups.new(name=name)
        for i, row in enumerate(weights):
            for j in np.flatnonzero(row > 0):
                obj.vertex_groups[int(j)].add([i], float(row[j]), "REPLACE")
        original_keys = at.coat.data.shape_keys.key_blocks
        for k, original in enumerate(original_keys):
            key = obj.shape_key_add(name=original.name)
            key.data.foreach_set("co", all_keys[k].reshape(-1))
            key.slider_min, key.slider_max = original.slider_min, original.slider_max
            if k:
                driver = key.driver_add("value").driver
                driver.type = "SCRIPTED"
                driver.expression = "coat_value"
                variable = driver.variables.new()
                variable.name = "coat_value"
                variable.type = "SINGLE_PROP"
                variable.targets[0].id_type = "KEY"
                variable.targets[0].id = at.coat.data.shape_keys
                variable.targets[0].data_path = original.path_from_id("value")
        modifier = obj.modifiers.new("Existing avatar armature", "ARMATURE")
        modifier.object = at.rig
        obj["jacketHardware"] = True
        obj["attachmentComponents"] = json.dumps(self.components)
        attr = mesh.attributes.new("AttachmentComponent", "INT", "FACE")
        attr.data.foreach_set("value", self.face_components)
        A.update()
        actual, _ = A.H.geometry(obj)
        error = float(np.max(np.abs(A.array(actual) - self.goals)))
        assert error < 2e-6, (obj.name, error)
        return (
            obj,
            {
                "name": obj.name,
                "vertices": len(mesh.vertices),
                "triangles": len(mesh.polygons),
                "components": self.components,
                "t_reconstruction_error_m": error,
                "t_bounds": A.bounds(actual),
            },
            {
                "anchors": np.array(self.anchors, dtype=np.int32),
                "barycentrics": np.array(self.barys),
                "offsets_t": np.array(offsets),
                "expected_keys": all_keys.astype(np.float32),
                "expected_weights": np.array(weights, dtype=np.float32),
                "goals_t": np.array(self.goals),
            },
        )


def octagon(length, width, bevel):
    a, b, r = length / 2, width / 2, bevel
    return np.array(
        [
            [-a + r, -b],
            [a - r, -b],
            [a, -b + r],
            [a, b - r],
            [a - r, b],
            [-a + r, b],
            [-a, b - r],
            [-a, -b + r],
        ]
    )


def box(writer, emit, center, length, width, bottom, height, mat=2):
    rings = []
    for z, inset in (
        (bottom, 0.00008),
        (bottom + height * 0.25, 0),
        (bottom + height * 0.75, 0),
        (bottom + height, 0.00008),
    ):
        ring = []
        for u, v in octagon(
            length - inset * 2, width - inset * 2, min(width * 0.18, 0.00025)
        ):
            ring.append(emit(center[0] + u, center[1] + v, z))
        rings.append(ring)
    writer.face(list(reversed(rings[0])), mat)
    writer.face(rings[-1], mat)
    for a, b in pairwise(rings):
        for j in range(8):
            writer.face([a[j], a[(j + 1) % 8], b[(j + 1) % 8], b[j]], mat)


def pocket(name, start, end, width, region, at, materials):
    writer = Writer(name, at, materials)
    start, end = np.array(start), np.array(end)
    length = float(np.linalg.norm(end - start))
    direction = (end - start) / length
    side = np.array([-direction[1], direction[0]])

    def emit(u, v, height):
        anchor = at.anchor(start + direction * u + side * v, region)
        return writer.vertex(anchor, anchor[2] + np.array([0, -height, 0]))

    writer.begin("panel", length_m=length, width_m=width)
    rows = max(16, int(np.ceil(length / 0.002)))
    cross = np.unique(
        np.concatenate(
            [
                np.linspace(a, b, 4)
                for a, b in pairwise([-1, -0.72, -0.22, 0.22, 0.72, 1])
            ]
        )
    )
    top, bottom = [], []
    for i in range(rows + 1):
        t = i / rows
        taper = 0.70 if i in (0, rows) else 1
        top.append(
            [
                emit(
                    t * length, v * width * 0.5 * taper, 0.0024 + 0.00018 * (1 - v * v)
                )
                for v in cross
            ]
        )
        bottom.append(
            [emit(t * length, v * width * 0.5 * taper, 0.0016) for v in cross]
        )
    for i in range(rows):
        for j in range(len(cross) - 1):
            mat = 1 if abs((cross[j] + cross[j + 1]) / 2) < 0.72 else 0
            writer.face(
                [top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]], mat
            )
            writer.face(
                [
                    bottom[i][j + 1],
                    bottom[i + 1][j + 1],
                    bottom[i + 1][j],
                    bottom[i][j],
                ],
                0,
            )
    boundary = (
        top[0]
        + [r[-1] for r in top[1:]]
        + list(reversed(top[-1][:-1]))
        + [r[0] for r in reversed(top[1:-1])]
    )
    lower = (
        bottom[0]
        + [r[-1] for r in bottom[1:]]
        + list(reversed(bottom[-1][:-1]))
        + [r[0] for r in reversed(bottom[1:-1])]
    )
    for j in range(len(boundary)):
        n = (j + 1) % len(boundary)
        writer.face([boundary[j], lower[j], lower[n], boundary[n]], 0)
    tooth_count = int((length - 0.022) / 0.0032)
    for i in range(tooth_count):
        for sign in (-1, 1):
            u = 0.006 + (i + (0.25 if sign < 0 else 0.75)) * 0.0032
            writer.begin("tooth", along_m=u, panel_rows=rows, panel_length_m=length)
            center = np.array([u, sign * 0.00115])
            center_xz = start + direction * center[0] + side * center[1]
            anchor = at.anchor(center_xz, region)
            axes = []
            for delta in (direction, side):
                a = at.anchor(center_xz - delta * 0.0002, region)[2]
                b = at.anchor(center_xz + delta * 0.0002, region)[2]
                axes.append((b - a) / 0.0004)

            def tooth_emit(du, dv, height, anchor=anchor, axes=axes):
                goal = (
                    anchor[2] + axes[0] * du + axes[1] * dv + np.array([0, -height, 0])
                )
                return writer.vertex(anchor, goal)

            box(writer, tooth_emit, (0, 0), 0.0018, 0.0013, 0.00250, 0.00075)
    return writer, (start + direction * (length - 0.009), direction, region)


def pull(name, location, direction, region, at, materials):
    writer = Writer(name, at, materials)
    anchor = at.anchor(location, region)
    ahead = at.anchor(location + direction * 0.002, region)
    normal = anchor[3]
    axis = ahead[2] - anchor[2]
    axis -= normal * np.dot(axis, normal)
    axis /= np.linalg.norm(axis)
    side = np.cross(normal, axis)

    def emit(u, v, height):
        return writer.vertex(anchor, anchor[2] + axis * u + side * v + normal * height)

    writer.begin("slider")
    box(writer, emit, (0, 0), 0.008, 0.006, 0.0043, 0.0021)
    writer.begin("pull")
    # A through-hole tab, tilted outwards from its slider hinge.
    outer = octagon(0.018, 0.0055, 0.0010)
    inner = octagon(0.012, 0.0026, 0.0006)
    rings = []
    for height in (0.0062, 0.0072):
        for loop in (outer, inner):
            rings.append(
                [emit(u - 0.007, v, height + max(0, -u) * 0.22) for u, v in loop]
            )
    lo, li, ho, hi = rings
    for j in range(8):
        n = (j + 1) % 8
        for face in (
            [lo[j], lo[n], ho[n], ho[j]],
            [li[n], li[j], hi[j], hi[n]],
            [ho[j], ho[n], hi[n], hi[j]],
            [lo[n], lo[j], li[j], li[n]],
        ):
            writer.face(face, 2)
    return writer


def run(args):
    if args.output.exists():
        raise FileExistsError(args.output)
    source_hash = A.digest(args.input)
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    scene, rig, coat, body, shirt = A.scene_objects()
    before = A.preserved_snapshot(coat, rig, body, shirt)
    rig.animation_data.action = bpy.data.actions[
        scene["riggedJacketOriginalLoweringAction"]
    ]
    A.sample(scene, 31)
    at = Attachment(scene, rig, coat)
    materials = [
        material("Jacket hardware - pearl welt", (0.68, 0.64, 0.56), 0.16, 0.29),
        material("Jacket hardware - black zipper tape", (0.004, 0.005, 0.006), 0, 0.48),
        material("Jacket hardware - warm gold", (0.72, 0.48, 0.18), 0.85, 0.22),
    ]
    writers, pulls = [], []
    for name, start, end, width, region in (
        ("left hip pocket", (0.100, 1.085), (0.120, 1.195), 0.014, "torso"),
        ("right hip pocket", (-0.100, 1.085), (-0.120, 1.195), 0.014, "torso"),
        ("left sleeve utility pocket", (0.300, 1.445), (0.395, 1.445), 0.036, "sleeve"),
    ):
        writer, spec = pocket(name, start, end, width, region, at, materials)
        writers.append(writer)
        pulls.append(pull(name + " pull", *spec, at, materials))
    pulls.append(
        pull(
            "main zipper pull",
            np.array([0.079, 1.084]),
            np.array([0.0, 1.0]),
            "torso",
            at,
            materials,
        )
    )
    parts, arrays = [], {}
    for i, writer in enumerate(writers + pulls):
        _obj, report, values = writer.finish()
        parts.append(report)
        for name, value in values.items():
            arrays[f"part_{i}_{name}"] = value
    after = A.preserved_snapshot(coat, rig, body, shirt)
    old_names = {m["name"] for m in before["materials"]}
    after["materials"] = [m for m in after["materials"] if m["name"] in old_names]
    assert after == before
    A.sample(scene, 1)
    scene["riggedJacketHardwareStudy"] = (
        "Three closed zippered pocket fronts and native-skinned pulls"
    )
    for path in (args.output, args.provenance, args.report):
        path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output))
    np.savez_compressed(args.provenance, **arrays)
    assert A.digest(args.input) == source_hash
    report = {
        "source_sha256": source_hash,
        "model_sha256": A.digest(args.output),
        "builder_sha256": A.digest(Path(__file__)),
        "parts": parts,
        "maximum_dropped_bone_weight": at.maximum_dropped_weight,
        "maximum_t_skin_condition": at.maximum_condition,
        "source_preserved": True,
        "coat_body_shirt_rig_actions_materials_preserved": True,
        "closed_pockets_only": True,
        "acceptance": "Requires reopened attachment, collision and motion audits",
    }
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(
        "HARDWARE_BUILD",
        json.dumps({k: v for k, v in report.items() if k != "parts"}),
        flush=True,
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, default=SOURCE)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--provenance", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    run(parser.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
