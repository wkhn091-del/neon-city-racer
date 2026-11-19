"""Generate a mid-poly GT supercar and export public/models/hero_car.glb."""
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


EXPORT = Path(r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\public\models\hero_car.glb")
EXPORT.parent.mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.curves, bpy.data.armatures):
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
    elif "Clearcoat" in bsdf.inputs:
        bsdf.inputs["Clearcoat"].default_value = clearcoat
    if transmission > 0 and "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = transmission
    elif transmission > 0 and "Transmission" in bsdf.inputs:
        bsdf.inputs["Transmission"].default_value = transmission
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


def mesh_from_bmesh(name, bm):
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj


def shade_smooth(obj):
    mesh = obj.data
    for poly in mesh.polygons:
        poly.use_smooth = True
    if hasattr(mesh, "use_auto_smooth"):
        mesh.use_auto_smooth = True
        mesh.auto_smooth_angle = math.radians(60)


def apply_all(obj):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.select_set(False)


def create_body():
    bm = bmesh.new()
    # Capsule-like GT body via scaled cube + extrudes
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        x, y, z = v.co
        # Length Y, width X, height Z
        v.co.x = x * 1.05
        v.co.y = y * 2.35
        v.co.z = z * 0.42 + 0.55
    # Taper nose / tail
    for v in bm.verts:
        t = (v.co.y + 2.35) / 4.7
        nose = 1.0 - max(0.0, (abs(v.co.y) - 1.4) / 1.0) * 0.35
        nose = max(0.55, nose)
        v.co.x *= nose
        if v.co.y > 1.6:
            v.co.z *= 0.85
        if v.co.y < -1.7:
            v.co.z *= 0.9
        # Cabin step
        if abs(v.co.y) < 0.9 and v.co.z > 0.7:
            v.co.z += 0.22
    bmesh.ops.subdivide_edges(bm, edges=bm.edges[:], cuts=2, use_grid_fill=True)
    for v in bm.verts:
        # Soften silhouette
        v.co.z += 0.02 * math.sin(v.co.y * 1.3)
        if abs(v.co.x) > 0.85 and v.co.z < 0.55:
            v.co.z -= 0.05  # side skirt dip
    body = mesh_from_bmesh("Body", bm)
    shade_smooth(body)
    return body


def create_splitter():
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 1.0
        v.co.y = v.co.y * 0.18 + 2.15
        v.co.z = v.co.z * 0.06 + 0.18
    obj = mesh_from_bmesh("FrontSplitter", bm)
    shade_smooth(obj)
    return obj


def create_hood_vents():
    objs = []
    for side, sx in (("L", -0.28), ("R", 0.28)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 0.16 + sx
            v.co.y = v.co.y * 0.35 + 0.85
            v.co.z = v.co.z * 0.04 + 0.92
        obj = mesh_from_bmesh(f"HoodVent_{side}", bm)
        shade_smooth(obj)
        objs.append(obj)
    return objs


def create_side_skirts():
    objs = []
    for side, sx in (("L", -1.08), ("R", 1.08)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 0.08 + sx
            v.co.y *= 1.6
            v.co.z = v.co.z * 0.08 + 0.22
        obj = mesh_from_bmesh(f"SideSkirt_{side}", bm)
        shade_smooth(obj)
        objs.append(obj)
    return objs


def create_diffuser():
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 0.95
        v.co.y = v.co.y * 0.25 - 2.2
        v.co.z = v.co.z * 0.12 + 0.2
        if v.co.z < 0.2:
            v.co.y -= 0.05
    obj = mesh_from_bmesh("RearDiffuser", bm)
    shade_smooth(obj)
    return obj


def create_wing():
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 1.05
        v.co.y = v.co.y * 0.12 - 2.05
        v.co.z = v.co.z * 0.08 + 1.05
    wing = mesh_from_bmesh("GTWing", bm)
    # Stalks
    stalks = []
    for side, sx in (("L", -0.55), ("R", 0.55)):
        bm2 = bmesh.new()
        bmesh.ops.create_cube(bm2, size=1.0)
        for v in bm2.verts:
            v.co.x = v.co.x * 0.05 + sx
            v.co.y = v.co.y * 0.05 - 1.95
            v.co.z = v.co.z * 0.25 + 0.8
        stalks.append(mesh_from_bmesh(f"WingStalk_{side}", bm2))
    shade_smooth(wing)
    for s in stalks:
        shade_smooth(s)
    return [wing, *stalks]


def create_mirrors():
    objs = []
    for side, sx in (("L", -1.05), ("R", 1.05)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 0.12 + sx
            v.co.y = v.co.y * 0.1 + 0.55
            v.co.z = v.co.z * 0.08 + 0.85
        objs.append(mesh_from_bmesh(f"Mirror_{side}", bm))
    return objs


def create_glass():
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 0.85
        v.co.y *= 0.95
        v.co.z = v.co.z * 0.28 + 0.95
        if abs(v.co.y) > 0.7:
            v.co.z -= 0.08
    obj = mesh_from_bmesh("Glass", bm)
    shade_smooth(obj)
    return obj


def create_interior():
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= 0.7
        v.co.y *= 0.7
        v.co.z = v.co.z * 0.2 + 0.7
    obj = mesh_from_bmesh("Interior", bm)
    return obj


def create_lights():
    objs = []
    # Headlight LED strips
    for side, sx in (("L", -0.62), ("R", 0.62)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 0.28 + sx
            v.co.y = v.co.y * 0.05 + 2.28
            v.co.z = v.co.z * 0.06 + 0.55
        objs.append(mesh_from_bmesh(f"Headlight_{side}", bm))
    # Taillight bars
    for side, sx in (("L", -0.55), ("R", 0.55)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 0.35 + sx
            v.co.y = v.co.y * 0.04 - 2.35
            v.co.z = v.co.z * 0.08 + 0.62
        objs.append(mesh_from_bmesh(f"Taillight_{side}", bm))
    return objs


def create_calipers():
    objs = []
    positions = {
        "FL": (-0.88, 1.35, 0.32),
        "FR": (0.88, 1.35, 0.32),
        "RL": (-0.9, -1.35, 0.32),
        "RR": (0.9, -1.35, 0.32),
    }
    for key, (x, y, z) in positions.items():
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 0.08 + x
            v.co.y = v.co.y * 0.12 + y
            v.co.z = v.co.z * 0.12 + z
        objs.append(mesh_from_bmesh(f"Caliper_{key}", bm))
    return objs


def create_wheel(name, location):
    # Tire
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=24, v_segments=12, radius=0.34)
    for v in bm.verts:
        # Flatten to tire profile (thin in X for left/right wheels — actually spin around X? 
        # Car forward is +Y, axle is X. Wheel rotates around local X.
        # Make tire torus-like: squash in X (width) wait - width is along axle = X
        v.co.x *= 0.35  # tire width
        # keep YZ as radius plane for rolling around X
    tire_mesh = bpy.data.meshes.new(f"{name}_TireMesh")
    bm.to_mesh(tire_mesh)
    bm.free()

    # Better: cylinder along X as tire, with rim
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=32, radius1=0.34, radius2=0.34, depth=0.24)
    # Cone creates along Z; rotate verts so axis is X
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0),
                     matrix=Matrix_from_euler((0, math.pi / 2, 0)))
    for v in bm.verts:
        # Slight sidewall bulge
        radial = Vector((0, v.co.y, v.co.z)).length
        if radial > 0.28:
            v.co.y *= 1.02
            v.co.z *= 1.02
    tire = mesh_from_bmesh(f"{name}_Tire", bm)
    shade_smooth(tire)

    # Rim
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=0.22, radius2=0.22, depth=0.16)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0),
                     matrix=Matrix_from_euler((0, math.pi / 2, 0)))
    rim = mesh_from_bmesh(f"{name}_Rim", bm)
    shade_smooth(rim)

    # Hub
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.08)
    for v in bm.verts:
        v.co.x *= 0.5
    hub = mesh_from_bmesh(f"{name}_Hub", bm)

    # Empty parent at axle pivot — wheel mesh children centered at origin of parent
    wheel = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(wheel)
    wheel.empty_display_type = "SPHERE"
    wheel.empty_display_size = 0.1
    wheel.location = location

    for child in (tire, rim, hub):
        child.parent = wheel
        # Keep local origin at axle
        child.location = (0, 0, 0)

    return wheel, tire, rim, hub


def Matrix_from_euler(euler):
    from mathutils import Euler, Matrix
    return Euler(euler, "XYZ").to_matrix().to_4x4()


def parent_keep(child, parent):
    child.parent = parent
    child.matrix_parent_inverse = parent.matrix_world.inverted()


def main():
    clear_scene()

    paint = make_mat("Paint_DeepCrimson", color=(0.45, 0.02, 0.05, 1), metallic=0.85,
                     roughness=0.18, clearcoat=1.0)
    carbon = make_mat("Carbon_Matte", color=(0.04, 0.04, 0.045, 1), metallic=0.35, roughness=0.55)
    rubber = make_mat("Tire_Rubber", color=(0.02, 0.02, 0.02, 1), metallic=0.0, roughness=0.85)
    rim_mat = make_mat("Rim_Metal", color=(0.75, 0.75, 0.78, 1), metallic=1.0, roughness=0.25)
    glass = make_mat("Glass_Tint", color=(0.05, 0.08, 0.1, 1), metallic=0.0, roughness=0.05,
                     transmission=0.9, alpha=0.35)
    interior = make_mat("Interior_Dark", color=(0.05, 0.05, 0.055, 1), roughness=0.7)
    head = make_mat("LED_Head", color=(0.9, 0.95, 1, 1), roughness=0.2,
                    emission=(12.0, (0.85, 0.92, 1.0, 1)))
    tail = make_mat("LED_Tail", color=(0.8, 0.02, 0.02, 1), roughness=0.25,
                    emission=(18.0, (1.0, 0.05, 0.02, 1)))
    caliper_mat = make_mat("Caliper_Glow", color=(0.8, 0.05, 0.05, 1), metallic=0.4, roughness=0.35,
                           emission=(4.0, (1.0, 0.1, 0.05, 1)))

    root = bpy.data.objects.new("HeroCar", None)
    bpy.context.collection.objects.link(root)
    root.empty_display_size = 0.5

    body = create_body()
    body.data.materials.append(paint)
    splitter = create_splitter()
    splitter.data.materials.append(carbon)
    vents = create_hood_vents()
    for v in vents:
        v.data.materials.append(carbon)
    skirts = create_side_skirts()
    for s in skirts:
        s.data.materials.append(carbon)
    diffuser = create_diffuser()
    diffuser.data.materials.append(carbon)
    wing_parts = create_wing()
    for w in wing_parts:
        w.data.materials.append(carbon)
    mirrors = create_mirrors()
    for m in mirrors:
        m.data.materials.append(paint)
    glass_obj = create_glass()
    glass_obj.data.materials.append(glass)
    interior_obj = create_interior()
    interior_obj.data.materials.append(interior)
    lights = create_lights()
    for i, L in enumerate(lights):
        L.data.materials.append(head if i < 2 else tail)
    calipers = create_calipers()
    for c in calipers:
        c.data.materials.append(caliper_mat)

    visuals = [body, splitter, diffuser, glass_obj, interior_obj, *vents, *skirts, *wing_parts, *mirrors, *lights, *calipers]
    for obj in visuals:
        apply_all(obj)
        obj.parent = root

    # Wheels at exact axle pivots (local to car root)
    wheel_defs = [
        ("Wheel_FL", (-0.95, 1.35, 0.34)),
        ("Wheel_FR", (0.95, 1.35, 0.34)),
        ("Wheel_RL", (-0.97, -1.35, 0.34)),
        ("Wheel_RR", (0.97, -1.35, 0.34)),
    ]
    for wname, loc in wheel_defs:
        wheel, tire, rim, hub = create_wheel(wname, loc)
        tire.data.materials.append(rubber)
        rim.data.materials.append(rim_mat)
        hub.data.materials.append(rim_mat)
        wheel.parent = root

    # Origin at [0,0,0], applied transforms on meshes already
    root.location = (0, 0, 0)
    root.rotation_euler = (0, 0, 0)

    # Select hierarchy for export
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
        export_animations=False,
    )
    blend_path = EXPORT.with_suffix(".blend")
    bpy.ops.wm.save_as_mainfile(filepath=str(Path(r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\blend\hero_car.blend")))
    print(f"EXPORTED {EXPORT} exists={EXPORT.exists()} size={EXPORT.stat().st_size if EXPORT.exists() else 0}")


main()
