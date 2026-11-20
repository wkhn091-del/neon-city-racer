"""
AAA spatial markers for neon-city-racer world_map.glb

Places Empties snapped to road mesh surface (BVH raycast) with lane-aligned rotation.
Naming contract consumed by src/world/markers.ts — ZERO guessed TypeScript coordinates.

Run after coastal city is imported and centered:
  blender --background world.blend --python place_world_empties.py
Or via Blender MCP execute_blender_code (paste body).
"""
from __future__ import annotations

import math
import re
from mathutils import Vector, Matrix, Quaternion
from mathutils.bvhtree import BVHTree
import bmesh
import bpy


MARKER_NAMES = {
    "spawn": ["Spawn_Player"],
    "lane_a": [f"Traffic_Lane_A_{i:02d}" for i in range(1, 13)],
    "lane_b": [f"Traffic_Lane_B_{i:02d}" for i in range(1, 13)],
    "ped": [f"Pedestrian_Path_{i:02d}" for i in range(1, 11)],
    "dealer": [f"Dealership_Spot_{i:02d}" for i in range(1, 5)],
}


def _clear_old_markers():
    pattern = re.compile(
        r"^(Spawn_Player|Traffic_Lane_[AB]_\d{2}|Pedestrian_Path_\d{2}|Dealership_Spot_\d{2})$"
    )
    for obj in list(bpy.data.objects):
        if pattern.match(obj.name):
            bpy.data.objects.remove(obj, do_unlink=True)


def _mesh_objects():
    skip = re.compile(r"^(Collider_|Spawn_|Traffic_|Pedestrian_|Dealership_)")
    out = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        if skip.match(obj.name):
            continue
        out.append(obj)
    return out


def _build_bvh(objs):
    """World-space BVH from visual meshes (for downward snap)."""
    verts = []
    faces = []
    offset = 0
    for obj in objs:
        depsgraph = bpy.context.evaluated_depsgraph_get()
        eval_obj = obj.evaluated_get(depsgraph)
        mesh = eval_obj.to_mesh()
        mesh.transform(obj.matrix_world)
        for v in mesh.vertices:
            verts.append(v.co.copy())
        for p in mesh.polygons:
            if len(p.vertices) >= 3:
                # fan triangulate
                v0 = p.vertices[0] + offset
                for i in range(1, len(p.vertices) - 1):
                    faces.append((v0, p.vertices[i] + offset, p.vertices[i + 1] + offset))
        offset += len(mesh.vertices)
        eval_obj.to_mesh_clear()
    if not faces:
        raise RuntimeError("No faces for BVH — import a city mesh first")
    return BVHTree.FromPolygons(verts, faces)


def _snap(bvh: BVHTree, xy: Vector, z_hint: float = 50.0):
    """Raycast down from (x,y,z_hint) in Blender Z-up space → hit.co or raise."""
    origin = Vector((xy.x, xy.y, z_hint))
    direction = Vector((0.0, 0.0, -1.0))
    hit = bvh.ray_cast(origin, direction, z_hint + 200.0)
    # returns (location, normal, index, distance) or (None,... )
    if hit[0] is None:
        # try from higher
        origin = Vector((xy.x, xy.y, z_hint + 200.0))
        hit = bvh.ray_cast(origin, direction, 500.0)
    if hit[0] is None:
        raise RuntimeError(f"No road hit under ({xy.x:.2f}, {xy.y:.2f})")
    loc, normal, _idx, _dist = hit
    return loc, normal.normalized()


def _make_empty(name: str, loc: Vector, forward_xy: Vector, normal: Vector):
    """Empty with local +Y = up (Blender), local −Y → will become glTF +Z forward after convert… 
    We set rotation so Empty's local +Y (Blender forward for ARROWS empty?):
    Use Empty Axes: local Z = up after? 
    
    GlTF convention target: Empty world quaternion → Three.js getWorldQuaternion,
    car nose +Z. After Blender→glTF: Blender +Z up becomes +Y up; Blender −Y becomes +Z.
    So Empty local −Y (Blender) should point along lane forward in XY plane.
    """
    bpy.ops.object.empty_add(type="ARROWS", location=loc)
    empty = bpy.context.active_object
    empty.name = name
    empty.empty_display_size = 2.5

    # Build basis: up ≈ world Z (or surface normal if steep), forward along road
    up = Vector((0, 0, 1))
    if normal.dot(up) > 0.3:
        up = normal
    forward = Vector((forward_xy.x, forward_xy.y, 0.0))
    if forward.length < 1e-4:
        forward = Vector((0, -1, 0))  # default Blender −Y
    else:
        forward.normalize()
    # Blender: −Y is our intended forward for glTF +Z
    # Track −Y toward forward: use matrix
    # right = forward × up  (for −Y forward: right = up × forward_world where forward_world = -Y axis)
    y_axis = -forward  # local +Y points opposite lane? We want local −Y = forward
    # local −Y = forward ⇒ local +Y = −forward
    local_y = -forward
    local_z = up
    local_x = local_y.cross(local_z).normalized()
    local_z = local_x.cross(local_y).normalized()
    mat = Matrix(
        (
            (local_x.x, local_y.x, local_z.x, loc.x),
            (local_x.y, local_y.y, local_z.y, loc.y),
            (local_x.z, local_y.z, local_z.z, loc.z),
            (0, 0, 0, 1),
        )
    )
    empty.matrix_world = mat
    return empty


def _ellipse_samples(cx, cy, rx, ry, count, phase=0.0):
    pts = []
    tangents = []
    for i in range(count):
        t = phase + (i / count) * math.tau
        x = cx + math.cos(t) * rx
        y = cy + math.sin(t) * ry
        # tangent (derivative)
        tx = -math.sin(t) * rx
        ty = math.cos(t) * ry
        pts.append(Vector((x, y)))
        tangents.append(Vector((tx, ty)).normalized())
    return pts, tangents


def _offset(pts, tangents, amount):
    out_p, out_t = [], []
    for p, t in zip(pts, tangents):
        # left normal in XY: (-ty, tx)
        n = Vector((-t.y, t.x))
        out_p.append(p + n * amount)
        out_t.append(t.copy())
    return out_p, out_t


def place_markers(lane_rx=70.0, lane_ry=50.0, lane_width=3.5, sidewalk=6.5):
    _clear_old_markers()
    meshes = _mesh_objects()
    print("BVH_MESHES", [m.name for m in meshes[:12]], "count", len(meshes))
    bvh = _build_bvh(meshes)

    # Center ellipse on world XY origin (after map centering)
    a_pts, a_tan = _ellipse_samples(0, 0, lane_rx, lane_ry, 12)
    b_pts, b_tan = _offset(a_pts, a_tan, -lane_width * 2)  # opposite lane
    # Reverse B so traffic drives opposite direction
    b_pts = list(reversed(b_pts))
    b_tan = [(-t) for t in reversed(b_tan)]
    ped_pts, ped_tan = _offset(a_pts[:10], a_tan[:10], sidewalk)

    created = []

    # Spawn at first lane A point
    loc, nrm = _snap(bvh, a_pts[0])
    created.append(_make_empty("Spawn_Player", loc + Vector((0, 0, 0.05)), a_tan[0], nrm))

    for i, (p, t) in enumerate(zip(a_pts, a_tan), start=1):
        loc, nrm = _snap(bvh, p)
        created.append(_make_empty(f"Traffic_Lane_A_{i:02d}", loc + Vector((0, 0, 0.05)), t, nrm))

    for i, (p, t) in enumerate(zip(b_pts, b_tan), start=1):
        loc, nrm = _snap(bvh, p)
        created.append(_make_empty(f"Traffic_Lane_B_{i:02d}", loc + Vector((0, 0, 0.05)), t, nrm))

    for i, (p, t) in enumerate(zip(ped_pts, ped_tan), start=1):
        loc, nrm = _snap(bvh, p)
        created.append(_make_empty(f"Pedestrian_Path_{i:02d}", loc + Vector((0, 0, 0.05)), t, nrm))

    # Dealership plaza — inner cluster near coastal side (negative Y in Blender = toward water if map oriented)
    plaza = [
        Vector((-12, -8)),
        Vector((-4, -10)),
        Vector((4, -10)),
        Vector((12, -8)),
    ]
    for i, p in enumerate(plaza, start=1):
        loc, nrm = _snap(bvh, p)
        created.append(
            _make_empty(f"Dealership_Spot_{i:02d}", loc + Vector((0, 0, 0.05)), Vector((0, -1)), nrm)
        )

    print("MARKERS_CREATED", len(created))
    for e in created:
        print("MARKER", e.name, tuple(round(c, 3) for c in e.location))
    return created


if __name__ == "__main__":
    place_markers()
