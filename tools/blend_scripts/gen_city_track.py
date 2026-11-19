"""Generate banked city/highway circuit -> public/models/city_track.glb."""
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Matrix


EXPORT = Path(r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\public\models\city_track.glb")
EXPORT.parent.mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.lights):
        for item in list(block):
            block.remove(item)


def make_mat(name, *, color=(0.5, 0.5, 0.5, 1), metallic=0.0, roughness=0.5, emission=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if emission is not None:
        strength, ecol = emission
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = ecol
            bsdf.inputs["Emission Strength"].default_value = strength
        else:
            bsdf.inputs["Emission"].default_value = ecol
            bsdf.inputs["Emission Strength"].default_value = strength
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def mesh_obj(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    for p in mesh.polygons:
        p.use_smooth = True
    return obj


def track_centerline(n=96):
    pts = []
    for i in range(n):
        t = i / n * math.tau
        # Figure-8 / oval hybrid with sweeping corners
        rx, ry = 62.0, 42.0
        x = math.cos(t) * rx + 8.0 * math.cos(2 * t)
        y = math.sin(t) * ry + 6.0 * math.sin(3 * t)
        # Slight elevation undulation + bank later
        z = 0.8 * math.sin(2 * t) + 0.4 * math.cos(3 * t)
        pts.append(Vector((x, y, z)))
    return pts


def build_road(pts, width=14.0, name="Collider_Road"):
    bm = bmesh.new()
    half = width * 0.5
    ring = []  # plain Vector frames (no live BMVert refs)
    n = len(pts)
    left_vs = []
    right_vs = []
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
        lv = bm.verts.new(left)
        rv = bm.verts.new(right_p)
        left_vs.append(lv)
        right_vs.append(rv)
        ring.append({
            "left": left.copy(),
            "right": right_p.copy(),
            "right_dir": right_bank.copy(),
            "up": up_bank.copy(),
            "p": p.copy(),
            "tangent": tangent.copy(),
        })
    bm.verts.ensure_lookup_table()
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new([left_vs[i], left_vs[j], right_vs[j], right_vs[i]])
    return mesh_obj(name, bm), ring


def build_walls(ring, name="Collider_Walls", height=1.4, inset=0.2):
    bm = bmesh.new()
    n = len(ring)
    for side in (-1, 1):
        bottoms = []
        tops = []
        for i in range(n):
            frame = ring[i]
            edge = frame["left"] if side < 0 else frame["right"]
            outward = -frame["right_dir"] if side < 0 else frame["right_dir"]
            up = frame["up"]
            base = edge + outward * inset
            bottoms.append(bm.verts.new(base))
            tops.append(bm.verts.new(base + up * height))
        bm.verts.ensure_lookup_table()
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new([bottoms[i], bottoms[j], tops[j], tops[i]])
    return mesh_obj(name, bm)


def build_curbs(ring):
    bm = bmesh.new()
    n = len(ring)
    for side in (-1, 1):
        for i in range(n):
            j = (i + 1) % n
            f0, f1 = ring[i], ring[j]
            edge0 = f0["left"] if side < 0 else f0["right"]
            edge1 = f1["left"] if side < 0 else f1["right"]
            outward = -f0["right_dir"] if side < 0 else f0["right_dir"]
            up = f0["up"]
            v0 = bm.verts.new(edge0)
            v1 = bm.verts.new(edge1)
            v2 = bm.verts.new(edge1 + outward * 0.55 + up * 0.12)
            v3 = bm.verts.new(edge0 + outward * 0.55 + up * 0.12)
            try:
                bm.faces.new([v0, v1, v2, v3])
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
            r0 = f0["right_dir"]
            r1 = f1["right_dir"]
            e0 = (f0["left"] if side < 0 else f0["right"]) + (-r0 if side < 0 else r0) * 0.7
            e1 = (f1["left"] if side < 0 else f1["right"]) + (-r1 if side < 0 else r1) * 0.7
            up0, up1 = f0["up"], f1["up"]
            for h in (0.55, 1.05):
                v0 = bm.verts.new(e0 + up0 * h)
                v1 = bm.verts.new(e1 + up1 * h)
                v2 = bm.verts.new(e1 + up1 * (h + 0.08) + (-r1 if side < 0 else r1) * 0.05)
                v3 = bm.verts.new(e0 + up0 * (h + 0.08) + (-r0 if side < 0 else r0) * 0.05)
                try:
                    bm.faces.new([v0, v1, v2, v3])
                except ValueError:
                    pass
    return mesh_obj("Visual_Guardrails", bm)


def build_overpass(pts):
    # Highway overpass bridging near t~0.25
    idx = int(len(pts) * 0.25)
    p = pts[idx]
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x = v.co.x * 18 + p.x
        v.co.y = v.co.y * 8 + p.y + 6
        v.co.z = v.co.z * 0.6 + 6.5
    deck = mesh_obj("Visual_OverpassDeck", bm)
    # Pillars
    pillars = []
    for ox in (-6, 6):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 1.2 + p.x + ox
            v.co.y = v.co.y * 1.2 + p.y + 6
            v.co.z = v.co.z * 3.2 + 3.0
        pillars.append(mesh_obj(f"Visual_OverpassPillar_{ox}", bm))
    return [deck, *pillars]


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
        pole = mesh_obj(f"Visual_LampPole_{i}", bm)
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=8, radius=0.28)
        for v in bm.verts:
            v.co += Vector((base.x, base.y, base.z + 5.6))
        lamp = mesh_obj(f"Visual_LampHead_{i}", bm)
        objs.extend([pole, lamp])
    return objs


def build_buildings(pts):
    objs = []
    rng = 0
    for i, p in enumerate(pts):
        if i % 5 != 0:
            continue
        prev_p = pts[(i - 1) % len(pts)]
        next_p = pts[(i + 1) % len(pts)]
        tangent = (next_p - prev_p).normalized()
        right = tangent.cross(Vector((0, 0, 1))).normalized()
        for side, mult in ((-1, 1), (1, 1)):
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
            objs.append(mesh_obj(f"Visual_Building_{i}_{side}", bm))
    return objs


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
            v0 = bm.verts.new(Vector((a.x, a.y, 0.12)))
            v1 = bm.verts.new(Vector((b.x, b.y, 0.12)))
            v2 = bm.verts.new(Vector((c.x, c.y, 0.12)))
            v3 = bm.verts.new(Vector((d.x, d.y, 0.12)))
            try:
                bm.faces.new([v0, v1, v2, v3])
            except ValueError:
                pass
    return mesh_obj("Visual_Sidewalks", bm)


def main():
    clear_scene()
    asphalt = make_mat("Asphalt_Wet", color=(0.07, 0.07, 0.08, 1), roughness=0.42, metallic=0.05)
    concrete = make_mat("Concrete", color=(0.35, 0.35, 0.34, 1), roughness=0.75)
    curb = make_mat("Curb_RedWhite", color=(0.75, 0.15, 0.1, 1), roughness=0.55)
    neon = make_mat("Neon_Rail", color=(0.1, 0.8, 1.0, 1), roughness=0.3,
                    emission=(8.0, (0.2, 0.9, 1.0, 1)))
    metal = make_mat("Metal_Dark", color=(0.12, 0.12, 0.13, 1), metallic=0.8, roughness=0.35)
    glass_lit = make_mat("Building_Windows", color=(0.08, 0.1, 0.15, 1), roughness=0.25,
                         emission=(2.2, (0.45, 0.65, 1.0, 1)))
    lamp = make_mat("StreetLamp", color=(1, 0.92, 0.7, 1), roughness=0.4,
                    emission=(20.0, (1.0, 0.9, 0.65, 1)))

    pts = track_centerline(120)
    road, ring = build_road(pts)
    road.data.materials.append(asphalt)
    walls = build_walls(ring)
    walls.data.materials.append(metal)
    curbs = build_curbs(ring)
    curbs.data.materials.append(curb)
    rails = build_guardrails(ring)
    rails.data.materials.append(neon)
    sidewalks = build_sidewalks(pts)
    sidewalks.data.materials.append(concrete)
    overpass = build_overpass(pts)
    for o in overpass:
        o.data.materials.append(concrete)
    lamps = build_lamps(pts)
    for i, o in enumerate(lamps):
        o.data.materials.append(metal if "Pole" in o.name else lamp)
    buildings = build_buildings(pts)
    for b in buildings:
        b.data.materials.append(glass_lit)

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
    )
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\blend\city_track.blend")))
    print(f"EXPORTED {EXPORT} size={EXPORT.stat().st_size}")


main()
