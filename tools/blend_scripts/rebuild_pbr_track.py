"""Rebuild city_track.glb with Poly Haven asphalt/concrete materials assigned."""
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

EXPORT = Path(r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\public\models\city_track.glb")
BLEND = Path(r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\blend\city_track.blend")
EXPORT.parent.mkdir(parents=True, exist_ok=True)


def keep_world_and_mats():
    # Keep world HDRI + polyhaven materials; clear objects/meshes only
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def ensure_mat(name, fallback_color=(0.2, 0.2, 0.2, 1)):
    mat = bpy.data.materials.get(name)
    if mat:
        # Fake user so Blender won't purge unused
        mat.use_fake_user = True
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = fallback_color
    mat.use_fake_user = True
    return mat


def make_emissive(name, color, strength):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    if "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = strength
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    mat.use_fake_user = True
    return mat


def mesh_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    for p in me.polygons:
        p.use_smooth = True
    # UV unwrap for PBR tiling
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    except Exception:
        bpy.ops.uv.unwrap(method="ANGLE_BASED", margin=0.02)
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return obj


def track_centerline(n=120):
    pts = []
    for i in range(n):
        t = i / n * math.tau
        x = math.cos(t) * 62.0 + 8.0 * math.cos(2 * t)
        y = math.sin(t) * 42.0 + 6.0 * math.sin(3 * t)
        z = 0.8 * math.sin(2 * t) + 0.4 * math.cos(3 * t)
        pts.append(Vector((x, y, z)))
    return pts


def build_road(pts, width=14.0):
    bm = bmesh.new()
    half = width * 0.5
    ring = []
    left_vs, right_vs = [], []
    n = len(pts)
    for i, p in enumerate(pts):
        prev_p = pts[(i - 1) % n]
        next_p = pts[(i + 1) % n]
        tangent = (next_p - prev_p).normalized()
        up = Vector((0, 0, 1))
        right = tangent.cross(up).normalized()
        a = (pts[i] - prev_p).normalized()
        b = (next_p - pts[i]).normalized()
        curv = 1.0 - max(-1.0, min(1.0, a.dot(b)))
        bank = math.radians(18.0) * curv
        up_bank = (up * math.cos(bank) + right * math.sin(bank)).normalized()
        right_bank = tangent.cross(up_bank).normalized()
        left = p - right_bank * half + up_bank * 0.05
        right_p = p + right_bank * half + up_bank * 0.05
        left_vs.append(bm.verts.new(left))
        right_vs.append(bm.verts.new(right_p))
        ring.append({"left": left.copy(), "right": right_p.copy(), "right_dir": right_bank.copy(), "up": up_bank.copy(), "p": p.copy()})
    bm.verts.ensure_lookup_table()
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([left_vs[i], left_vs[j], right_vs[j], right_vs[i]])
    return mesh_obj("Collider_Road", bm), ring


def build_walls(ring, height=1.4, inset=0.2):
    bm = bmesh.new()
    n = len(ring)
    for side in (-1, 1):
        bottoms, tops = [], []
        for i in range(n):
            f = ring[i]
            edge = f["left"] if side < 0 else f["right"]
            outward = -f["right_dir"] if side < 0 else f["right_dir"]
            base = edge + outward * inset
            bottoms.append(bm.verts.new(base))
            tops.append(bm.verts.new(base + f["up"] * height))
        bm.verts.ensure_lookup_table()
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new([bottoms[i], bottoms[j], tops[j], tops[i]])
    return mesh_obj("Collider_Walls", bm)


def build_visual_track(ring):
    # Visual road strip slightly above collider to avoid z-fight
    bm = bmesh.new()
    n = len(ring)
    left_vs, right_vs = [], []
    for f in ring:
        left_vs.append(bm.verts.new(f["left"] + f["up"] * 0.02))
        right_vs.append(bm.verts.new(f["right"] + f["up"] * 0.02))
    bm.verts.ensure_lookup_table()
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([left_vs[i], left_vs[j], right_vs[j], right_vs[i]])
    return mesh_obj("Visual_Track", bm)


def build_curbs(ring):
    bm = bmesh.new()
    n = len(ring)
    for side in (-1, 1):
        for i in range(n):
            j = (i + 1) % n
            f0, f1 = ring[i], ring[j]
            e0 = f0["left"] if side < 0 else f0["right"]
            e1 = f1["left"] if side < 0 else f1["right"]
            outward = -f0["right_dir"] if side < 0 else f0["right_dir"]
            up = f0["up"]
            try:
                bm.faces.new([
                    bm.verts.new(e0),
                    bm.verts.new(e1),
                    bm.verts.new(e1 + outward * 0.55 + up * 0.12),
                    bm.verts.new(e0 + outward * 0.55 + up * 0.12),
                ])
            except ValueError:
                pass
    return mesh_obj("Visual_Curbs", bm)


def build_guardrails(ring):
    bm = bmesh.new()
    n = len(ring)
    for side in (-1, 1):
        for i in range(n):
            j = (i + 1) % n
            f0, f1 = ring[i], ring[j]
            r0, r1 = f0["right_dir"], f1["right_dir"]
            e0 = (f0["left"] if side < 0 else f0["right"]) + (-r0 if side < 0 else r0) * 0.7
            e1 = (f1["left"] if side < 0 else f1["right"]) + (-r1 if side < 0 else r1) * 0.7
            for h in (0.55, 1.05):
                try:
                    bm.faces.new([
                        bm.verts.new(e0 + f0["up"] * h),
                        bm.verts.new(e1 + f1["up"] * h),
                        bm.verts.new(e1 + f1["up"] * (h + 0.08)),
                        bm.verts.new(e0 + f0["up"] * (h + 0.08)),
                    ])
                except ValueError:
                    pass
    return mesh_obj("Visual_Guardrails", bm)


def build_sidewalks(pts):
    bm = bmesh.new()
    n = len(pts)
    for i in range(n):
        p0, p1 = pts[i], pts[(i + 1) % n]
        t = (p1 - pts[(i - 1) % n]).normalized()
        r = t.cross(Vector((0, 0, 1))).normalized()
        for side in (-1, 1):
            a = p0 + r * side * 10
            b = p1 + r * side * 10
            c = p1 + r * side * 16
            d = p0 + r * side * 16
            try:
                bm.faces.new([
                    bm.verts.new(Vector((a.x, a.y, 0.12))),
                    bm.verts.new(Vector((b.x, b.y, 0.12))),
                    bm.verts.new(Vector((c.x, c.y, 0.12))),
                    bm.verts.new(Vector((d.x, d.y, 0.12))),
                ])
            except ValueError:
                pass
    return mesh_obj("Visual_Sidewalks", bm)


def build_buildings(pts):
    objs = []
    rng = 0
    for i, p in enumerate(pts):
        if i % 5 != 0:
            continue
        prev_p = pts[(i - 1) % n] if (n := len(pts)) else p
        next_p = pts[(i + 1) % n]
        tangent = (next_p - prev_p).normalized()
        right = tangent.cross(Vector((0, 0, 1))).normalized()
        for side in (-1, 1):
            rng = (rng * 1103515245 + 12345) & 0x7FFFFFFF
            h = 12 + (rng % 40)
            w = 6 + (rng % 8)
            d = 6 + ((rng >> 3) % 8)
            center = p + right * side * (22 + (rng % 12))
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1.0)
            for v in bm.verts:
                v.co.x = v.co.x * w + center.x
                v.co.y = v.co.y * d + center.y
                v.co.z = v.co.z * h + h * 0.5
            objs.append(mesh_obj(f"Visual_Buildings_{i}_{side}", bm))
    return objs


def build_lamps(pts):
    objs = []
    for i, p in enumerate(pts):
        if i % 8 != 0:
            continue
        prev_p = pts[(i - 1) % len(pts)]
        next_p = pts[(i + 1) % len(pts)]
        tangent = (next_p - prev_p).normalized()
        right = tangent.cross(Vector((0, 0, 1))).normalized()
        base = p + right * 9.5
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=8, radius1=0.12, radius2=0.08, depth=5.5)
        for v in bm.verts:
            v.co += Vector((base.x, base.y, base.z + 2.75))
        objs.append(mesh_obj(f"Visual_LampPole_{i}", bm))
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=0.28)
        for v in bm.verts:
            v.co += Vector((base.x, base.y, base.z + 5.6))
        objs.append(mesh_obj(f"Visual_LampHead_{i}", bm))
    return objs


def build_overpass(pts):
    idx = int(len(pts) * 0.25)
    p = pts[idx]
    objs = []
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = v.co.x * 18 + p.x
        v.co.y = v.co.y * 8 + p.y + 6
        v.co.z = v.co.z * 0.6 + 6.5
    objs.append(mesh_obj("Visual_OverpassDeck", bm))
    for ox in (-6, 6):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 1.2 + p.x + ox
            v.co.y = v.co.y * 1.2 + p.y + 6
            v.co.z = v.co.z * 3.2 + 3.0
        objs.append(mesh_obj(f"Visual_OverpassPillar_{ox}", bm))
    return objs


def scale_mapping(mat, scale):
    if not mat or not mat.use_nodes:
        return
    for node in mat.node_tree.nodes:
        if node.type == "MAPPING":
            node.inputs["Scale"].default_value = (scale, scale, scale)
            print(f"Scaled mapping on {mat.name} to {scale}")


def main():
    keep_world_and_mats()
    asphalt = ensure_mat("asphalt_pit_lane", (0.05, 0.05, 0.055, 1))
    concrete = ensure_mat("concrete_pavement_03", (0.35, 0.35, 0.34, 1))
    scale_mapping(asphalt, 8.0)
    scale_mapping(concrete, 6.0)
    curb = ensure_mat("Curb_Red", (0.75, 0.12, 0.08, 1))
    neon = make_emissive("Neon_Rail", (0.2, 0.9, 1.0, 1), 8.0)
    metal = ensure_mat("Metal_Dark", (0.12, 0.12, 0.13, 1))
    windows = make_emissive("Building_Windows", (0.45, 0.65, 1.0, 1), 2.5)
    lamp = make_emissive("StreetLamp", (1.0, 0.9, 0.65, 1), 20.0)

    pts = track_centerline(120)
    road, ring = build_road(pts)
    road.data.materials.append(asphalt)
    walls = build_walls(ring)
    walls.data.materials.append(metal)
    visual = build_visual_track(ring)
    visual.data.materials.append(asphalt)
    curbs = build_curbs(ring)
    curbs.data.materials.append(curb)
    rails = build_guardrails(ring)
    rails.data.materials.append(neon)
    sidewalks = build_sidewalks(pts)
    sidewalks.data.materials.append(concrete)
    buildings = build_buildings(pts)
    for b in buildings:
        b.data.materials.append(windows)
    lamps = build_lamps(pts)
    for o in lamps:
        o.data.materials.append(metal if "Pole" in o.name else lamp)
    overpass = build_overpass(pts)
    for o in overpass:
        o.data.materials.append(concrete)

    root = bpy.data.objects.new("CityTrack", None)
    bpy.context.collection.objects.link(root)
    for obj in list(bpy.context.scene.objects):
        if obj != root and obj.type == "MESH":
            obj.parent = root

    bpy.ops.object.select_all(action="DESELECT")
    for obj in bpy.context.scene.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(EXPORT),
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_texture_dir="",
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print(f"EXPORTED {EXPORT} size={EXPORT.stat().st_size}")
    print("materials", [m.name for m in bpy.data.materials])


main()
