"""Shared measured-surface, mesh, and skin helpers for complete launch looks."""

import math
import bpy, numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
import audit_rigged_jacket_sleeves as A
from build_rigged_jacket_hardware import barycentric


def smooth(x):
    x = np.clip(x, 0, 1)
    return x * x * (3 - 2 * x)


def skin_weights(ob, names):
    lookup = {n: i for i, n in enumerate(names)}
    w = np.zeros((len(ob.data.vertices), len(names)))
    for v in ob.data.vertices:
        for g in v.groups:
            i = lookup.get(ob.vertex_groups[g.group].name)
            if i is not None:
                w[v.index, i] = g.weight
    return w


class Surface:
    def __init__(self, rig, body):
        self.rig = rig
        self.body = body
        self.names = [b.name for b in rig.data.bones]
        self.points, self.faces = A.H.geometry(body)
        self.array = A.array(self.points)
        self.faces = np.asarray(self.faces)
        self.tree = BVHTree.FromPolygons(self.points, self.faces, all_triangles=True)
        self.weights = skin_weights(body, self.names)
        self.mats = np.asarray(
            [
                rig.matrix_world
                @ rig.pose.bones[n].matrix
                @ rig.data.bones[n].matrix_local.inverted()
                @ rig.matrix_world.inverted()
                for n in self.names
            ]
        )

    def weights_at(self, points):
        output = []
        for p in points:
            hit, n, i, d = self.tree.find_nearest(Vector(p))
            ids = self.faces[i]
            b = np.maximum(barycentric(np.array(hit), self.array[ids]), 0)
            b /= b.sum()
            w = b @ self.weights[ids]
            keep = np.argsort(w)[-4:]
            row = np.zeros_like(w)
            row[keep] = w[keep]
            row /= row.sum()
            output.append(row)
        return np.asarray(output)

    def bind(self, points, w):
        skin = np.einsum("vg,gij->vij", w, self.mats)
        p = np.c_[points, np.ones(len(points))]
        return np.linalg.solve(skin, p[..., None])[:, :3, 0]

    def ray(self, x, z, margin=0.006):
        hit, normal, i, d = self.tree.ray_cast(Vector((x, -2, z)), Vector((0, 1, 0)))
        return Vector((x, hit.y - margin, z)) if hit else None

    def radial(self, theta, z, margin=0.009):
        direction = Vector((math.sin(theta), -math.cos(theta), 0))
        hit, n, i, d = self.tree.ray_cast(Vector((0, -0.025, z)), direction)
        assert hit is not None, (theta, z)
        return hit + direction * margin


def create(
    name,
    points,
    faces,
    mat,
    surface,
    weights=None,
    uv=None,
    slot=None,
    option=None,
    solid=0,
):
    points = np.asarray(points)
    weights = surface.weights_at(points) if weights is None else weights
    bind = surface.bind(points, weights)
    me = bpy.data.meshes.new(name)
    me.from_pydata(bind.tolist(), [], faces)
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    for m in mat if isinstance(mat, list) else [mat]:
        me.materials.append(m)
    for p in me.polygons:
        p.use_smooth = True
    for i, n in enumerate(surface.names):
        ids = np.flatnonzero(weights[:, i] > 0.00000001)
        if len(ids):
            g = ob.vertex_groups.new(name=n)
            for j in ids:
                g.add([int(j)], float(weights[j, i]), "REPLACE")
    if uv is not None:
        layer = me.uv_layers.new(name="UVMap")
        for poly in me.polygons:
            for li in poly.loop_indices:
                layer.data[li].uv = uv[me.loops[li].vertex_index]
    if solid:
        mod = ob.modifiers.new("Fabric thickness", "SOLIDIFY")
        mod.thickness = solid
        mod.offset = 0
    ob.modifiers.new("Avatar skin", "ARMATURE").object = surface.rig
    ob.parent = surface.rig
    ob.matrix_parent_inverse = Matrix.Identity(4)
    ob["completePairStudy"] = True
    if slot:
        ob["avatarSlot"] = slot
        ob["avatarOptionId"] = option or slot
        ob["avatarAssetKind"] = "slot"
        ob["avatarPartRole"] = slot
    return ob


def tube(path, radius, sides=6):
    path = [Vector(p) for p in path]
    vs = []
    fs = []
    uv = []
    previous = None
    for i, p in enumerate(path):
        tangent = (path[min(i + 1, len(path) - 1)] - path[max(0, i - 1)]).normalized()
        ref = Vector((0, 0, 1)) if abs(tangent.z) < 0.92 else Vector((1, 0, 0))
        across = tangent.cross(ref).normalized()
        if previous is not None and across.dot(previous) < 0:
            across = -across
        previous = across
        up = across.cross(tangent).normalized()
        for j in range(sides):
            a = j * math.tau / sides
            vs.append(p + (across * math.cos(a) + up * math.sin(a)) * radius)
            uv.append((j / sides, i / (len(path) - 1)))
    for i in range(len(path) - 1):
        for j in range(sides):
            a = i * sides + j
            b = i * sides + (j + 1) % sides
            fs.append((a, b, b + sides, a + sides))
    fs.append(tuple(reversed(range(sides))))
    fs.append(tuple((len(path) - 1) * sides + j for j in range(sides)))
    return vs, fs, uv


def join(parts):
    vs = []
    fs = []
    uv = []
    for p, f, u in parts:
        offset = len(vs)
        vs.extend(p)
        fs.extend(tuple(i + offset for i in face) for face in f)
        uv.extend(u)
    return vs, fs, uv
