"""Stage 2 — Coastal mountain touge / canyon circuit."""
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

EXPORT = Path(r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\public\models\stage2_canyon.glb")
BLEND = Path(r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\blend\stage2_canyon.blend")
EXPORT.parent.mkdir(parents=True, exist_ok=True)
BLEND.parent.mkdir(parents=True, exist_ok=True)


def clear_meshes():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)


def make_mat(name, *, color=(0.5, 0.5, 0.5, 1), metallic=0.0, roughness=0.5, emission=None):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
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
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    try:
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
    except Exception:
        pass
    bpy.ops.object.mode_set(mode="OBJECT")
    obj.select_set(False)
    return obj


def canyon_centerline(n=160):
    """Serpentine mountain pass with hairpins and elevation."""
    pts = []
    for i in range(n):
        t = i / n
        # Progress along a winding canyon valley
        progress = t * math.tau * 1.5
        x = math.sin(progress) * 48.0 + math.sin(progress * 2.2) * 18.0
        y = t * 220.0 - 110.0
        # Climb then descend, with hairpin plateaus
        z = 18.0 * math.sin(t * math.pi) + 4.0 * math.sin(t * math.pi * 4)
        # Extra hairpin offsets
        if 0.28 < t < 0.38 or 0.62 < t < 0.72:
            x += math.sin((t - 0.28) * 40) * 12.0
        pts.append(Vector((x, y, z)))
    return pts


def build_road(pts, width=11.0):
    bm = bmesh.new()
    half = width * 0.5
    ring = []
    left_vs, right_vs = [], []
    n = len(pts)
    for i, p in enumerate(pts):
        prev_p = pts[max(0, i - 1)]
        next_p = pts[min(n - 1, i + 1)]
        tangent = (next_p - prev_p)
        if tangent.length < 1e-5:
            tangent = Vector((0, 1, 0))
        else:
            tangent.normalize()
        up = Vector((0, 0, 1))
        right = tangent.cross(up)
        if right.length < 1e-5:
            right = Vector((1, 0, 0))
        else:
            right.normalize()
        # Bank into corners
        a = (p - prev_p)
        b = (next_p - p)
        if a.length > 1e-4 and b.length > 1e-4:
            curv = 1.0 - max(-1.0, min(1.0, a.normalized().dot(b.normalized())))
        else:
            curv = 0.0
        bank = math.radians(22.0) * curv
        up_bank = (up * math.cos(bank) + right * math.sin(bank)).normalized()
        right_bank = tangent.cross(up_bank).normalized()
        left = p - right_bank * half + up_bank * 0.04
        right_p = p + right_bank * half + up_bank * 0.04
        left_vs.append(bm.verts.new(left))
        right_vs.append(bm.verts.new(right_p))
        ring.append({
            "left": left.copy(),
            "right": right_p.copy(),
            "right_dir": right_bank.copy(),
            "up": up_bank.copy(),
            "p": p.copy(),
            "tangent": tangent.copy(),
        })
    bm.verts.ensure_lookup_table()
    for i in range(n - 1):
        bm.faces.new([left_vs[i], left_vs[i + 1], right_vs[i + 1], right_vs[i]])
    return mesh_obj("Collider_Road", bm), ring


def build_walls(ring, height=1.2, inset=0.15):
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
        for i in range(n - 1):
            bm.faces.new([bottoms[i], bottoms[i + 1], tops[i + 1], tops[i]])
    return mesh_obj("Collider_Walls", bm)


def build_visual_track(ring):
    bm = bmesh.new()
    n = len(ring)
    left_vs, right_vs = [], []
    for f in ring:
        left_vs.append(bm.verts.new(f["left"] + f["up"] * 0.025))
        right_vs.append(bm.verts.new(f["right"] + f["up"] * 0.025))
    bm.verts.ensure_lookup_table()
    for i in range(n - 1):
        bm.faces.new([left_vs[i], left_vs[i + 1], right_vs[i + 1], right_vs[i]])
    return mesh_obj("Visual_Track", bm)


def build_guardrails(ring):
    bm = bmesh.new()
    n = len(ring)
    for side in (-1, 1):
        # Outer cliff side denser rails
        for i in range(0, n - 1, 1):
            f0, f1 = ring[i], ring[i + 1]
            r0, r1 = f0["right_dir"], f1["right_dir"]
            e0 = (f0["left"] if side < 0 else f0["right"]) + (-r0 if side < 0 else r0) * 0.55
            e1 = (f1["left"] if side < 0 else f1["right"]) + (-r1 if side < 0 else r1) * 0.55
            for h in (0.45, 0.95):
                try:
                    bm.faces.new([
                        bm.verts.new(e0 + f0["up"] * h),
                        bm.verts.new(e1 + f1["up"] * h),
                        bm.verts.new(e1 + f1["up"] * (h + 0.07)),
                        bm.verts.new(e0 + f0["up"] * (h + 0.07)),
                    ])
                except ValueError:
                    pass
    return mesh_obj("Visual_Guardrails", bm)


def build_cliffs(ring):
    objs = []
    rng = 7
    for i, f in enumerate(ring):
        if i % 6 != 0:
            continue
        rng = (rng * 1103515245 + 12345) & 0x7FFFFFFF
        for side in (-1, 1):
            outward = -f["right_dir"] if side < 0 else f["right_dir"]
            # Cliff face outside the road
            center = f["p"] + outward * (14 + (rng % 8))
            h = 12 + (rng % 28)
            w = 8 + (rng % 10)
            d = 6 + ((rng >> 4) % 8)
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1.0)
            for v in bm.verts:
                noise = 0.15 * math.sin(v.co.x * 7 + i)
                v.co.x = v.co.x * w + center.x + noise
                v.co.y = v.co.y * d + center.y
                v.co.z = v.co.z * h + center.z + h * 0.35
            objs.append(mesh_obj(f"Visual_Cliff_{i}_{side}", bm))
    return objs


def build_tunnel(pts):
    # Tunnel around mid climb
    idx = int(len(pts) * 0.48)
    p = pts[idx]
    fwd = (pts[min(len(pts) - 1, idx + 3)] - pts[max(0, idx - 3)]).normalized()
    right = fwd.cross(Vector((0, 0, 1))).normalized()
    up = Vector((0, 0, 1))
    objs = []
    # Tube walls as boxes forming arch shell
    for ox, oz, sx, sz in (
        (-7.5, 3.5, 1.2, 7.0),
        (7.5, 3.5, 1.2, 7.0),
        (0.0, 7.2, 16.0, 1.2),
    ):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        center = p + right * ox + up * oz + fwd * 8
        for v in bm.verts:
            local = Vector((v.co.x * sx, v.co.y * 18, v.co.z * sz))
            # orient along track
            world = center + right * local.x + fwd * local.y + up * local.z
            v.co = world
        objs.append(mesh_obj(f"Visual_Tunnel_{ox}_{oz}", bm))
    # Collider tunnel walls
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        local = Vector((v.co.x * 16, v.co.y * 18, v.co.z * 0.8 + 0.2))
        v.co = p + right * local.x + fwd * local.y + up * local.z
    # Skip adding floor collider duplicate — road already covers
    return objs


def build_coast_water(pts):
    # Flat water plane beside lower section
    bm = bmesh.new()
    bmesh.ops.create_grid(bm, x_segments=8, y_segments=8, size=80)
    for v in bm.verts:
        v.co.x += 70
        v.co.y += -40
        v.co.z = -2.5 + 0.15 * math.sin(v.co.x * 0.2) * math.cos(v.co.y * 0.15)
    return mesh_obj("Visual_Ocean", bm)


def build_lamps(ring):
    objs = []
    for i, f in enumerate(ring):
        if i % 10 != 0:
            continue
        base = f["p"] + f["right_dir"] * 6.5
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=6, radius1=0.1, radius2=0.07, depth=4.2)
        for v in bm.verts:
            v.co += Vector((base.x, base.y, base.z + 2.1))
        objs.append(mesh_obj(f"Visual_LampPole_{i}", bm))
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=8, v_segments=6, radius=0.22)
        for v in bm.verts:
            v.co += Vector((base.x, base.y, base.z + 4.3))
        objs.append(mesh_obj(f"Visual_LampHead_{i}", bm))
    return objs


def main():
    clear_meshes()
    asphalt = make_mat("Canyon_Asphalt", color=(0.06, 0.06, 0.07, 1), roughness=0.48, metallic=0.04)
    rock = make_mat("Canyon_Rock", color=(0.28, 0.22, 0.18, 1), roughness=0.85)
    rail = make_mat("Canyon_Rail", color=(0.55, 0.55, 0.5, 1), metallic=0.85, roughness=0.35)
    water = make_mat("Canyon_Water", color=(0.05, 0.15, 0.28, 1), roughness=0.15, metallic=0.2,
                     emission=(0.4, (0.05, 0.2, 0.35, 1)))
    lamp = make_mat("Canyon_Lamp", color=(1, 0.85, 0.55, 1), roughness=0.4,
                    emission=(14.0, (1.0, 0.85, 0.5, 1)))
    tunnel = make_mat("Canyon_Tunnel", color=(0.18, 0.18, 0.16, 1), roughness=0.7)

    pts = canyon_centerline(160)
    road, ring = build_road(pts)
    road.data.materials.append(asphalt)
    walls = build_walls(ring)
    walls.data.materials.append(rail)
    visual = build_visual_track(ring)
    visual.data.materials.append(asphalt)
    rails = build_guardrails(ring)
    rails.data.materials.append(rail)
    cliffs = build_cliffs(ring)
    for c in cliffs:
        c.data.materials.append(rock)
    tunnel_parts = build_tunnel(pts)
    for t in tunnel_parts:
        t.data.materials.append(tunnel)
    ocean = build_coast_water(pts)
    ocean.data.materials.append(water)
    lamps = build_lamps(ring)
    for o in lamps:
        o.data.materials.append(rail if "Pole" in o.name else lamp)

    root = bpy.data.objects.new("Stage2Canyon", None)
    bpy.context.collection.objects.link(root)
    for obj in list(bpy.context.scene.objects):
        if obj != root and obj.type == "MESH":
            obj.parent = root

    # Origin ground near start
    start = pts[0]
    root.location = (-start.x, -start.y, -start.z)

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
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
    print(f"EXPORTED {EXPORT} size={EXPORT.stat().st_size}")


main()
