"""High-detail GT supercar with Wheel_* axle pivots. Exports hero_car.glb."""
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Euler, Matrix, Vector

EXPORT = Path(r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\public\models\hero_car.glb")
BLEND = Path(r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\blend\hero_car.blend")
EXPORT.parent.mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
        for item in list(block):
            block.remove(item)


def make_mat(name, *, color=(0.8, 0.8, 0.8, 1), metallic=0.0, roughness=0.4,
             clearcoat=0.0, emission=None, transmission=0.0, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Coat Weight" in bsdf.inputs:
        bsdf.inputs["Coat Weight"].default_value = clearcoat
        if clearcoat > 0 and "Coat Roughness" in bsdf.inputs:
            bsdf.inputs["Coat Roughness"].default_value = 0.08
    elif "Clearcoat" in bsdf.inputs:
        bsdf.inputs["Clearcoat"].default_value = clearcoat
    if transmission > 0:
        key = "Transmission Weight" if "Transmission Weight" in bsdf.inputs else "Transmission"
        if key in bsdf.inputs:
            bsdf.inputs[key].default_value = transmission
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        if hasattr(mat, "blend_method"):
            mat.blend_method = "BLEND"
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "BLENDED"
    if emission is not None:
        strength, ecol = emission
        if "Emission Color" in bsdf.inputs:
            bsdf.inputs["Emission Color"].default_value = ecol
            bsdf.inputs["Emission Strength"].default_value = strength
        else:
            bsdf.inputs["Emission"].default_value = ecol
            bsdf.inputs["Emission Strength"].default_value = strength
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


def shade_smooth(obj, angle=40):
    mesh = obj.data
    for p in mesh.polygons:
        p.use_smooth = True
    try:
        mod = obj.modifiers.new("Smooth", "WEIGHTED_NORMAL")
        mod.keep_sharp = True
    except Exception:
        pass
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    try:
        bpy.ops.object.shade_smooth(use_auto_smooth=True, angle=math.radians(angle))
    except TypeError:
        bpy.ops.object.shade_smooth()
    obj.select_set(False)


def apply_subdiv(obj, levels=2):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mod = obj.modifiers.new("Subsurf", "SUBSURF")
    mod.levels = levels
    mod.render_levels = levels
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)


def apply_bevel(obj, width=0.012, segments=3):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    mod = obj.modifiers.new("Bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(30)
    bpy.ops.object.modifier_apply(modifier=mod.name)
    obj.select_set(False)


def mesh_from_bm(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    return obj


def box(name, sx, sy, sz, loc=(0, 0, 0), taper_y=None):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z *= sz
        v.co += Vector(loc)
        if taper_y:
            # taper_y: (y_ref, scale_at_front)
            y_ref, scale = taper_y
            t = abs(v.co.y - y_ref) if False else max(0.0, (v.co.y - y_ref) / max(sy, 0.01))
            # simpler: scale X by distance along +Y
            factor = 1.0 - max(0.0, (v.co.y - (loc[1] - sy * 0.5)) / (sy + 1e-5)) * (1.0 - scale)
            if v.co.y > loc[1]:
                v.co.x *= scale + (1 - scale) * (1 - (v.co.y - loc[1]) / (sy * 0.5 + 1e-5))
    return mesh_from_bm(name, bm)


def create_body_shell():
    """Sculpted GT coupe body via subdivided tapered hull + wheel-arch cutouts."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    # Base GT proportions (~4.5m long after final scale)
    for v in bm.verts:
        x, y, z = v.co
        v.co.x = x * 1.02
        v.co.y = y * 2.2
        v.co.z = z * 0.38 + 0.58
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=4, use_grid_fill=True)

    for v in bm.verts:
        x, y, z = v.co
        # Cabin greenhouse
        if abs(y) < 0.85 and z > 0.72:
            z += 0.28 * (1.0 - abs(y) / 0.85)
            x *= 0.82
        # Nose taper
        if y > 1.2:
            t = (y - 1.2) / 1.0
            x *= 1.0 - 0.45 * t
            z *= 1.0 - 0.25 * t
            z -= 0.05 * t
        # Tail taper + deck
        if y < -1.3:
            t = (-1.3 - y) / 0.9
            x *= 1.0 - 0.2 * t
            z *= 1.0 - 0.1 * t
        # Side skirt scoop
        if abs(x) > 0.75 and z < 0.55:
            z -= 0.06
        # Wheel arch bulges (sculpted fenders)
        for ay in (1.25, -1.25):
            dy = abs(y - ay)
            if dy < 0.55 and abs(x) > 0.55:
                bulge = (1.0 - dy / 0.55) ** 2
                x *= 1.0 + 0.12 * bulge
                if z < 0.7:
                    z += 0.08 * bulge
        # Hood center ridge
        if 0.3 < y < 1.6 and abs(x) < 0.35 and z > 0.7:
            z += 0.03 * (1.0 - abs(x) / 0.35)
        v.co = Vector((x, y, z))

    # Soften with another light subdiv pass via ops later
    body = mesh_from_bm("Body", bm)
    apply_bevel(body, width=0.018, segments=2)
    apply_subdiv(body, levels=2)
    shade_smooth(body)
    return body


def create_glass():
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 0.78
        v.co.y *= 0.9
        v.co.z = v.co.z * 0.26 + 0.98
        if abs(v.co.y) > 0.55:
            v.co.z -= 0.1 * (abs(v.co.y) - 0.55)
        # windshield rake
        if v.co.y > 0.2:
            v.co.z -= 0.08
            v.co.y -= 0.05
    obj = mesh_from_bm("Glass", bm)
    apply_subdiv(obj, levels=1)
    shade_smooth(obj)
    return obj


def create_carbon_parts():
    parts = []
    # Front splitter
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 0.98
        v.co.y = v.co.y * 0.16 + 2.05
        v.co.z = v.co.z * 0.05 + 0.2
        if v.co.y > 2.1:
            v.co.z -= 0.02
    splitter = mesh_from_bm("FrontSplitter", bm)
    apply_bevel(splitter, 0.008, 2)
    parts.append(splitter)

    # Side skirts
    for side, sx in (("L", -1.05), ("R", 1.05)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 0.07 + sx
            v.co.y *= 1.5
            v.co.z = v.co.z * 0.07 + 0.24
        parts.append(mesh_from_bm(f"SideSkirt_{side}", bm))

    # Hood vents
    for side, sx in (("L", -0.32), ("R", 0.32)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 0.14 + sx
            v.co.y = v.co.y * 0.32 + 0.9
            v.co.z = v.co.z * 0.035 + 0.93
        parts.append(mesh_from_bm(f"HoodVent_{side}", bm))

    # Rear diffuser
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 0.92
        v.co.y = v.co.y * 0.22 - 2.15
        v.co.z = v.co.z * 0.14 + 0.22
        if v.co.z < 0.22:
            v.co.y -= 0.06
    # fins via extra thin boxes
    diffuser = mesh_from_bm("RearDiffuser", bm)
    parts.append(diffuser)
    for i, fx in enumerate((-0.55, -0.28, 0.0, 0.28, 0.55)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 0.04 + fx
            v.co.y = v.co.y * 0.18 - 2.2
            v.co.z = v.co.z * 0.12 + 0.22
        parts.append(mesh_from_bm(f"DiffuserFin_{i}", bm))

    # GT wing + stalks
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 1.0
        v.co.y = v.co.y * 0.1 - 2.0
        v.co.z = v.co.z * 0.06 + 1.12
        # slight airfoil
        if v.co.y < -2.0:
            v.co.z += 0.03
    wing = mesh_from_bm("GTWing", bm)
    apply_bevel(wing, 0.01, 2)
    parts.append(wing)
    for side, sx in (("L", -0.5), ("R", 0.5)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 0.04 + sx
            v.co.y = v.co.y * 0.04 - 1.9
            v.co.z = v.co.z * 0.22 + 0.85
        parts.append(mesh_from_bm(f"WingStalk_{side}", bm))

    for p in parts:
        shade_smooth(p)
    return parts


def create_mirrors():
    objs = []
    for side, sx in (("L", -1.02), ("R", 1.02)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 0.14 + sx
            v.co.y = v.co.y * 0.12 + 0.45
            v.co.z = v.co.z * 0.08 + 0.88
        objs.append(mesh_from_bm(f"Mirror_{side}", bm))
    return objs


def create_interior():
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 0.65
        v.co.y *= 0.65
        v.co.z = v.co.z * 0.18 + 0.72
    return mesh_from_bm("Interior", bm)


def create_lights():
    objs = []
    for side, sx in (("L", -0.58), ("R", 0.58)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 0.32 + sx
            v.co.y = v.co.y * 0.04 + 2.18
            v.co.z = v.co.z * 0.05 + 0.58
        objs.append(mesh_from_bm(f"Headlight_{side}", bm))
    for side, sx in (("L", -0.52), ("R", 0.52)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 0.38 + sx
            v.co.y = v.co.y * 0.035 - 2.28
            v.co.z = v.co.z * 0.06 + 0.64
        objs.append(mesh_from_bm(f"Taillight_{side}", bm))
    return objs


def create_calipers():
    objs = []
    for key, loc in {
        "FL": (-0.88, 1.28, 0.34),
        "FR": (0.88, 1.28, 0.34),
        "RL": (-0.9, -1.28, 0.34),
        "RR": (0.9, -1.28, 0.34),
    }.items():
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 0.07 + loc[0]
            v.co.y = v.co.y * 0.14 + loc[1]
            v.co.z = v.co.z * 0.14 + loc[2]
        objs.append(mesh_from_bm(f"Caliper_{key}", bm))
    return objs


def rot_y90():
    return Euler((0, math.pi / 2, 0), "XYZ").to_matrix().to_4x4()


def create_wheel(name, location, rubber, rim_mat, carbon):
    """Tire + multi-spoke rim parented under empty at axle pivot."""
    # Tire (torus-like via scaled cylinder)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=48, radius1=0.36, radius2=0.36, depth=0.26)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot_y90())
    for v in bm.verts:
        radial = Vector((0, v.co.y, v.co.z)).length
        if radial > 0.28:
            v.co.y *= 1.03
            v.co.z *= 1.03
    tire = mesh_from_bm(f"{name}_Tire", bm)
    tire.data.materials.append(rubber)
    shade_smooth(tire)

    # Rim barrel
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.24, radius2=0.24, depth=0.18)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot_y90())
    rim = mesh_from_bm(f"{name}_Rim", bm)
    rim.data.materials.append(rim_mat)
    shade_smooth(rim)

    # Spokes
    for i in range(5):
        ang = i / 5 * math.tau
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x *= 0.04
            v.co.y = v.co.y * 0.18
            v.co.z *= 0.05
        spoke = mesh_from_bm(f"{name}_Spoke_{i}", bm)
        spoke.rotation_euler = (0, 0, ang)
        spoke.location = (0, math.sin(ang) * 0.08, math.cos(ang) * 0.08)
        spoke.data.materials.append(carbon)
        shade_smooth(spoke)

    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=0.07)
    for v in bm.verts:
        v.co.x *= 0.45
    hub = mesh_from_bm(f"{name}_Hub", bm)
    hub.data.materials.append(rim_mat)

    wheel = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(wheel)
    wheel.empty_display_type = "SPHERE"
    wheel.empty_display_size = 0.08
    wheel.location = location

    spokes = [o for o in bpy.context.scene.objects if o.name.startswith(f"{name}_Spoke_")]
    for child in [tire, rim, hub, *spokes]:
        # Capture current transform then parent while keeping world
        mw = child.matrix_world.copy()
        child.parent = wheel
        child.matrix_parent_inverse = wheel.matrix_world.inverted()
        child.matrix_world = mw
    return wheel


def normalize_to_length(root, target=4.5):
    bpy.context.view_layer.update()
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
            mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
    length = mx.y - mn.y
    print("pre_scale_length", length)
    if length < 0.1:
        return
    s = target / length
    root.scale = (s, s, s)
    bpy.context.view_layer.update()
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
            mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
    root.location.z -= mn.z
    bpy.context.view_layer.update()
    print("scaled", s, "ground_z", root.location.z, "final_length", (mx.y - mn.y) * 0 + (mx - mn).y)


def main():
    clear_scene()
    paint = make_mat("Paint_CrimsonClearcoat", color=(0.42, 0.02, 0.05, 1), metallic=0.9,
                     roughness=0.16, clearcoat=1.0)
    carbon = make_mat("Carbon_Matte", color=(0.03, 0.03, 0.035, 1), metallic=0.4, roughness=0.52)
    rubber = make_mat("Tire_Rubber", color=(0.015, 0.015, 0.015, 1), roughness=0.88)
    rim_mat = make_mat("Rim_Machined", color=(0.78, 0.78, 0.8, 1), metallic=1.0, roughness=0.22)
    glass = make_mat("Glass_Tint", color=(0.04, 0.06, 0.08, 1), roughness=0.04,
                     transmission=0.92, alpha=0.32)
    interior = make_mat("Interior_Alcantara", color=(0.04, 0.04, 0.045, 1), roughness=0.75)
    head = make_mat("LED_Head", color=(0.9, 0.95, 1, 1), roughness=0.2,
                    emission=(14.0, (0.85, 0.92, 1.0, 1)))
    tail = make_mat("LED_Tail", color=(0.8, 0.02, 0.02, 1), roughness=0.25,
                    emission=(20.0, (1.0, 0.04, 0.02, 1)))
    caliper = make_mat("Caliper_Glow", color=(0.75, 0.05, 0.05, 1), metallic=0.45, roughness=0.32,
                       emission=(5.0, (1.0, 0.08, 0.04, 1)))

    root = bpy.data.objects.new("HeroCar", None)
    bpy.context.collection.objects.link(root)

    body = create_body_shell()
    body.data.materials.append(paint)
    glass_obj = create_glass()
    glass_obj.data.materials.append(glass)
    interior_obj = create_interior()
    interior_obj.data.materials.append(interior)
    carbon_parts = create_carbon_parts()
    for p in carbon_parts:
        p.data.materials.append(carbon)
    mirrors = create_mirrors()
    for m in mirrors:
        m.data.materials.append(paint)
    lights = create_lights()
    for i, L in enumerate(lights):
        L.data.materials.append(head if i < 2 else tail)
    calipers = create_calipers()
    for c in calipers:
        c.data.materials.append(caliper)

    visuals = [body, glass_obj, interior_obj, *carbon_parts, *mirrors, *lights, *calipers]
    for obj in visuals:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        obj.select_set(False)
        obj.parent = root

    for wname, loc in (
        ("Wheel_FL", (-0.95, 1.28, 0.36)),
        ("Wheel_FR", (0.95, 1.28, 0.36)),
        ("Wheel_RL", (-0.97, -1.28, 0.36)),
        ("Wheel_RR", (0.97, -1.28, 0.36)),
    ):
        wheel = create_wheel(wname, loc, rubber, rim_mat, carbon)
        wheel.parent = root

    normalize_to_length(root, 4.5)

    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    for obj in bpy.context.scene.objects:
        if obj.parent == root or (obj.parent and obj.parent.parent == root):
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
    # hierarchy check
    names = [o.name for o in bpy.context.scene.objects if o.name.startswith("Wheel_")]
    print("WHEEL_NODES", sorted(names))
    print(f"EXPORTED {EXPORT} size={EXPORT.stat().st_size}")


main()
