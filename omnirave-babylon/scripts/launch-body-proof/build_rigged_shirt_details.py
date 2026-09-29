"""Fit a closed shirt placket, pointed collar overlays and four native-skinned buttons."""

# Connection map: placket/collar lower walls follow measured shirt/body surfaces
# with submillimetre-to-millimetre textile clearance; buttons stand over their
# placket on short attachment supports. No furniture-scale overlap is appropriate.
# Existing shirt, jacket, hardware, body and rig geometry remain intact.
import argparse
import json
import sys
from itertools import pairwise
from pathlib import Path

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS))
import audit_rigged_jacket_sleeves as A
from build_rigged_jacket_hardware import barycentric
from style_rigged_jacket_tailoring import geometry_hash

SOURCE = SCRIPTS.parents[1] / (
    "assets-src/avatars/launch-body-proof/rigged-jacket-embroidery-study/"
    "male-rigged-jacket-embroidered.blend"
)
PREFIX = "Shirt detail - "


class Attachment:
    def __init__(self, rig, shirt, coat, body):
        self.rig, self.shirt = rig, shirt
        self.points, faces = A.H.geometry(shirt)
        self.points = A.array(self.points)
        self.faces = np.asarray(faces)
        front = [
            f
            for f in faces
            if np.cross(
                self.points[f[1]] - self.points[f[0]],
                self.points[f[2]] - self.points[f[0]],
            )[1]
            < 0
            and max(self.points[list(f), 1]) < 0
        ]
        self.front_faces = np.asarray(front)
        self.front = BVHTree.FromPolygons(self.points, front, all_triangles=True)
        self.trees = {}
        for name, ob in [("coat", coat), ("body", body)]:
            p, f = A.H.geometry(ob)
            self.trees[name] = BVHTree.FromPolygons(p, f, all_triangles=True)
        self.groups = [g.name for g in shirt.vertex_groups]
        self.weights = np.zeros((len(shirt.data.vertices), len(self.groups)))
        for v in shirt.data.vertices:
            for g in v.groups:
                self.weights[v.index, g.group] = g.weight
        self.bone_matrices = np.asarray(
            [
                rig.matrix_world
                @ rig.pose.bones[name].matrix
                @ rig.data.bones[name].matrix_local.inverted()
                @ rig.matrix_world.inverted()
                @ shirt.matrix_world
                for name in self.groups
            ],
            dtype=np.float64,
        )
        self.max_dropped = 0.0
        self.max_condition = 0.0

    @staticmethod
    def ray(tree, x, z):
        hit, _normal, index, _distance = tree.ray_cast(
            Vector((x, -2, z)), Vector((0, 1, 0))
        )
        return (np.array(hit), index) if hit is not None and hit.y < 0 else (None, None)

    def anchor(self, x, z):
        hit, index = self.ray(self.front, x, z)
        if hit is None:
            # Shirt front has a narrow center slit and open V. Anchor to its
            # nearest front triangle while the overlay spans the measured gap.
            body, _ = self.ray(self.trees["body"], x, z)
            assert body is not None, (x, z)
            hit, _normal, index, _distance = self.front.find_nearest(
                Vector((x, body[1] - 0.008, z))
            )
            assert hit is not None
            hit = np.array(hit)
        ids = self.front_faces[index]
        bary = barycentric(hit, self.points[ids])
        return ids, bary, hit

    def surface_y(self, x, z, kind):
        body, _ = self.ray(self.trees["body"], x, z)
        assert body is not None, (x, z)
        shirt, _ = self.ray(self.front, x, z)
        if kind == "placket":
            # Symmetric supports bridge the existing center-front slit.
            supports = [
                p
                for xx in (-0.012, -0.006, -0.002, 0.002, 0.006, 0.012)
                if (p := self.ray(self.front, xx, z)[0]) is not None
            ]
            assert len(supports) >= 2, (x, z)
            y = min(p[1] for p in supports) - 0.0012
        else:
            y = body[1] - 0.0075
            if shirt is not None:
                y = min(y, shirt[1] - 0.0011)
            coat, _ = self.ray(self.trees["coat"], x, z)
            if coat is not None:
                y = max(y, coat[1] + 0.00165)
                if shirt is not None:
                    assert y < shirt[1] - 0.0006, (
                        "no collar layering space",
                        x,
                        z,
                        y,
                        shirt[1],
                        coat[1],
                    )
            assert y < body[1] - 0.002, ("no collar body space", x, z, y, body[1])
        return y

    def bind(self, anchor, goal):
        ids, bary, _hit = anchor
        weights = bary @ self.weights[ids]
        order = np.argsort(-weights, kind="stable")
        dropped = float(weights[order[4:]].sum())
        self.max_dropped = max(self.max_dropped, dropped)
        assert dropped < 0.05, dropped
        weights[order[4:]] = 0
        weights /= weights.sum()
        m = np.einsum("g,gij->ij", weights, self.bone_matrices)
        cond = float(np.linalg.cond(m[:3, :3]))
        self.max_condition = max(self.max_condition, cond)
        assert cond < 5 and abs(np.linalg.det(m[:3, :3])) > 1e-6
        local = (np.linalg.inv(m) @ np.r_[goal, 1])[:3]
        return local, weights


class Writer:
    def __init__(self, name, at, material):
        self.name, self.at, self.material = name, at, material
        self.goals, self.anchors, self.faces, self.uv = [], [], [], []

    def vertex(self, anchor, goal, uv=(0, 0, 0)):
        index = len(self.goals)
        self.goals.append(goal)
        self.anchors.append(anchor)
        self.uv.append(uv)
        return index

    def face(self, ids):
        for j in range(1, len(ids) - 1):
            self.faces.append((ids[0], ids[j], ids[j + 1]))

    def finish(self):
        values = [
            self.at.bind(a, g) for a, g in zip(self.anchors, self.goals, strict=True)
        ]
        coordinates = np.asarray([a for a, b in values])
        weights = np.asarray([b for a, b in values])
        mesh = bpy.data.meshes.new(PREFIX + self.name)
        mesh.from_pydata(coordinates, [], self.faces)
        bm = bmesh.new()
        bm.from_mesh(mesh)
        bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        bm.to_mesh(mesh)
        bm.free()
        mesh.update()
        ob = bpy.data.objects.new(PREFIX + self.name, mesh)
        bpy.context.collection.objects.link(ob)
        ob.parent = self.at.shirt
        ob.matrix_parent_inverse = Matrix.Identity(4)
        ob.matrix_basis = Matrix.Identity(4)
        # Bind coordinates include the shirt world matrix; this source is identity.
        assert np.max(np.abs(np.asarray(self.at.shirt.matrix_world) - np.eye(4))) < 1e-8
        mesh.materials.append(self.material)
        for p in mesh.polygons:
            p.use_smooth = True
        attr = mesh.attributes.new("ShirtDetailCoordinates", "FLOAT_VECTOR", "POINT")
        attr.data.foreach_set("vector", np.asarray(self.uv).reshape(-1))
        for name in self.at.groups:
            ob.vertex_groups.new(name=name)
        for i, row in enumerate(weights):
            for j in np.flatnonzero(row > 0):
                ob.vertex_groups[int(j)].add([i], float(row[j]), "REPLACE")
        mod = ob.modifiers.new("Existing shirt armature", "ARMATURE")
        mod.object = self.at.rig
        ob["shirtDetail"] = True
        ob["shirtDetailRole"] = self.name
        A.update()
        actual, _ = A.H.geometry(ob)
        error = float(np.max(np.abs(A.array(actual) - self.goals)))
        assert error < 2e-6, (self.name, error)
        return (
            ob,
            {
                "name": ob.name,
                "vertices": len(mesh.vertices),
                "triangles": len(mesh.polygons),
                "t_reconstruction_error_m": error,
                "t_bounds": A.bounds(actual),
            },
            {
                "expected_coordinates": coordinates.astype(np.float32),
                "expected_weights": weights.astype(np.float32),
                "anchors": np.asarray([a[0] for a in self.anchors], dtype=np.int32),
                "barycentrics": np.asarray([a[1] for a in self.anchors]),
                "goals_t": np.asarray(self.goals),
            },
        )


def cloth_material(source):
    mat = source.copy()
    mat.name = PREFIX + "black satin collar and placket"
    node = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    node.inputs["Base Color"].default_value = (0.007, 0.008, 0.010, 1)
    node.inputs["Roughness"].default_value = 0.40
    node.inputs["Sheen Weight"].default_value = 0.22
    return mat


def button_material():
    mat = bpy.data.materials.new(PREFIX + "dark horn buttons with gold rims")
    mat.use_nodes = True
    tree = mat.node_tree
    bsdf = next(n for n in tree.nodes if n.type == "BSDF_PRINCIPLED")
    attr = tree.nodes.new("ShaderNodeAttribute")
    attr.attribute_name = "ShirtDetailCoordinates"
    sep = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(attr.outputs["Vector"], sep.inputs[0])

    def bind(socket, value):
        if isinstance(value, (int, float)):
            socket.default_value = value
        else:
            tree.links.new(value, socket)

    def math(op, a, b):
        n = tree.nodes.new("ShaderNodeMath")
        n.operation = op
        bind(n.inputs[0], a)
        bind(n.inputs[1], b)
        return n.outputs[0]

    x, z = sep.outputs["X"], sep.outputs["Y"]
    radius = math("ADD", math("MULTIPLY", x, x), math("MULTIPLY", z, z))
    rim = math("GREATER_THAN", radius, 0.72)
    holes = 0
    for hx, hz in ((-0.28, -0.28), (0.28, -0.28), (-0.28, 0.28), (0.28, 0.28)):
        dx, dz = math("SUBTRACT", x, hx), math("SUBTRACT", z, hz)
        d = math("ADD", math("MULTIPLY", dx, dx), math("MULTIPLY", dz, dz))
        holes = math("MAXIMUM", holes, math("LESS_THAN", d, 0.025))
    mix = tree.nodes.new("ShaderNodeMixRGB")
    tree.links.new(rim, mix.inputs[0])
    mix.inputs[1].default_value = (0.013, 0.012, 0.010, 1)
    mix.inputs[2].default_value = (0.48, 0.29, 0.08, 1)
    dark = tree.nodes.new("ShaderNodeMixRGB")
    tree.links.new(holes, dark.inputs[0])
    tree.links.new(mix.outputs[0], dark.inputs[1])
    dark.inputs[2].default_value = (0.0004, 0.0004, 0.0004, 1)
    tree.links.new(dark.outputs[0], bsdf.inputs["Base Color"])
    tree.links.new(math("MULTIPLY", rim, 0.7), bsdf.inputs["Metallic"])
    bsdf.inputs["Roughness"].default_value = 0.32
    return mat


def strip(name, zs, inners, outers, sign, kind, at, material):
    writer = Writer(name, at, material)
    z_values = np.linspace(
        min(zs), max(zs), int(np.ceil((max(zs) - min(zs)) / 0.003)) + 1
    )
    cross = np.linspace(0, 1, 9)
    top, bottom = [], []
    for z in z_values:
        low, high = np.interp(z, zs, inners), np.interp(z, zs, outers)
        top_row, bottom_row = [], []
        for t in cross:
            x = sign * (low * (1 - t) + high * t)
            anchor = at.anchor(x, z)
            y = at.surface_y(x, z, kind)
            top_row.append(
                writer.vertex(anchor, np.array([x, y - 0.00065, z]), (t, z, 0))
            )
            bottom_row.append(writer.vertex(anchor, np.array([x, y, z]), (t, z, 0)))
        top.append(top_row)
        bottom.append(bottom_row)
    for i in range(len(z_values) - 1):
        for j in range(len(cross) - 1):
            writer.face([top[i][j], top[i + 1][j], top[i + 1][j + 1], top[i][j + 1]])
            writer.face(
                [bottom[i][j + 1], bottom[i + 1][j + 1], bottom[i + 1][j], bottom[i][j]]
            )

    def boundary(grid):
        return (
            grid[0]
            + [r[-1] for r in grid[1:]]
            + list(reversed(grid[-1][:-1]))
            + [r[0] for r in reversed(grid[1:-1])]
        )

    for a, b in zip(
        pairwise(boundary(top) + boundary(top)[:1]),
        pairwise(boundary(bottom) + boundary(bottom)[:1]),
        strict=True,
    ):
        writer.face([a[0], b[0], b[1], a[1]])
    return writer


def button(name, x, z, at, material):
    writer = Writer(name, at, material)
    anchor = at.anchor(x, z)
    base = at.surface_y(x, z, "placket") - 0.00065 - 0.0007
    rings = []
    radius = 0.0038
    for r, height in (
        (0.78, 0),
        (0.96, 0.0004),
        (1, 0.00085),
        (0.87, 0.00135),
        (0.60, 0.00155),
        (0.20, 0.00155),
    ):
        ring = []
        for angle in np.linspace(0, 2 * np.pi, 24, endpoint=False):
            xx, zz = r * np.cos(angle), r * np.sin(angle)
            ring.append(
                writer.vertex(
                    anchor,
                    np.array([x + radius * xx, base - height, z + radius * zz]),
                    (xx, zz, 0),
                )
            )
        rings.append(ring)
    writer.face(list(reversed(rings[0])))
    writer.face(rings[-1])
    for a, b in pairwise(rings):
        for j in range(24):
            writer.face([a[j], a[(j + 1) % 24], b[(j + 1) % 24], b[j]])
    return writer


def run(args):
    for path in (args.output, args.provenance, args.report):
        if path.exists():
            raise FileExistsError(path)
        path.parent.mkdir(parents=True, exist_ok=True)
    source_hash = A.digest(args.input)
    bpy.ops.wm.open_mainfile(filepath=str(args.input))
    s, r, c, b, h = A.scene_objects()
    before = A.preserved_snapshot(c, r, b, h)
    source_geometry = geometry_hash()
    old_objects = set(bpy.data.objects)
    r.animation_data.action = bpy.data.actions[s["riggedJacketOriginalLoweringAction"]]
    A.sample(s, 31)
    at = Attachment(r, h, c, b)
    center_front = at.points[(abs(at.points[:, 0]) < 0.002) & (at.points[:, 1] < 0)]
    hem_z = float(center_front[:, 2].min()) + 0.00015
    cloth = cloth_material(h.data.materials[0])
    horn = button_material()
    writers = [
        strip(
            "center placket",
            [hem_z, 1.276, 1.294],
            [-0.010, -0.010, -0.005],
            [0.014, 0.014, 0.008],
            1,
            "placket",
            at,
            cloth,
        )
    ]
    for sign, name in ((1, "left collar"), (-1, "right collar")):
        writers.append(
            strip(
                name,
                [1.386, 1.408, 1.430, 1.455, 1.477],
                [0.029, 0.034, 0.038, 0.037, 0.036],
                [0.030, 0.056, 0.061, 0.044, 0.041],
                sign,
                "collar",
                at,
                cloth,
            )
        )
    writers.extend(
        button("button " + str(i + 1), 0.002, z, at, horn)
        for i, z in enumerate((1.075, 1.133, 1.191, 1.249))
    )
    arrays = {}
    parts = []
    for i, w in enumerate(writers):
        _obj, record, data = w.finish()
        parts.append(record)
        for key, value in data.items():
            arrays[f"part_{i}_{key}"] = value
    # Existing mesh coordinates and rig data are checked again on reopening by
    # the independent source-preservation audit.
    added = [o for o in bpy.data.objects if o not in old_objects]
    A.sample(s, 1)
    after = A.preserved_snapshot(c, r, b, h)
    names = {m["name"] for m in before["materials"]}
    after["materials"] = [m for m in after["materials"] if m["name"] in names]
    assert after == before
    assert len(added) == 7
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output))
    np.savez_compressed(args.provenance, **arrays)
    assert A.digest(args.input) == source_hash
    report = {
        "source_sha256": source_hash,
        "model_sha256": A.digest(args.output),
        "builder_sha256": A.digest(Path(__file__)),
        "source_geometry_sha256": source_geometry,
        "parts": parts,
        "maximum_dropped_bone_weight": at.max_dropped,
        "maximum_t_skin_condition": at.max_condition,
        "source_preserved_snapshot": True,
        "acceptance": "Requires independent reopened source/skin and finite collision audits",
        "button_holes": "Four dark shader wells, not physical holes",
        "collar": "Two close-fitting pointed overlays; full neck-band reconstruction is outside this checkpoint",
    }
    args.report.write_text(json.dumps(report, indent=2) + "\n")
    print(
        "SHIRT_BUILD",
        json.dumps({k: v for k, v in report.items() if k != "parts"}),
        flush=True,
    )


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", type=Path, default=SOURCE)
    p.add_argument("--output", type=Path, required=True)
    p.add_argument("--provenance", type=Path, required=True)
    p.add_argument("--report", type=Path, required=True)
    run(p.parse_args(sys.argv[sys.argv.index("--") + 1 :]))
