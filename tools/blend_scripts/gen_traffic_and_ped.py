"""Generate traffic_sedan.glb, traffic_suv.glb, pedestrian.glb."""
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector, Euler, Matrix


OUT = Path(r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\public\models")
BLEND = Path(r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\blend")
OUT.mkdir(parents=True, exist_ok=True)
BLEND.mkdir(parents=True, exist_ok=True)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.actions, bpy.data.armatures):
        for item in list(block):
            block.remove(item)


def make_mat(name, *, color=(0.5, 0.5, 0.5, 1), metallic=0.0, roughness=0.5, emission=None, alpha=1.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        if hasattr(mat, "blend_method"):
            mat.blend_method = "BLEND"
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


def rot_x_matrix():
    return Euler((0, math.pi / 2, 0), "XYZ").to_matrix().to_4x4()


def make_wheel(name, location, rubber, rim_mat):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=0.3, radius2=0.3, depth=0.2)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot_x_matrix())
    tire = mesh_obj(f"{name}_Tire", bm)
    tire.data.materials.append(rubber)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=0.18, radius2=0.18, depth=0.12)
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot_x_matrix())
    rim = mesh_obj(f"{name}_Rim", bm)
    rim.data.materials.append(rim_mat)
    wheel = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(wheel)
    wheel.location = location
    tire.parent = wheel
    rim.parent = wheel
    tire.location = (0, 0, 0)
    rim.location = (0, 0, 0)
    return wheel


def export_root(root, path: Path):
    bpy.ops.object.select_all(action="DESELECT")
    def sel(o):
        o.select_set(True)
        for c in o.children:
            sel(c)
    sel(root)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_materials="EXPORT",
        export_animations=True,
    )
    print(f"EXPORTED {path} size={path.stat().st_size}")


def build_vehicle(kind="sedan"):
    clear_scene()
    if kind == "sedan":
        paint_col = (0.15, 0.35, 0.75, 1)
        length, width, height = 2.1, 0.9, 0.55
        cabin_z = 0.85
        name = "TrafficSedan"
        out = OUT / "traffic_sedan.glb"
    else:
        paint_col = (0.75, 0.55, 0.12, 1)
        length, width, height = 2.3, 1.0, 0.75
        cabin_z = 1.05
        name = "TrafficSUV"
        out = OUT / "traffic_suv.glb"

    paint = make_mat(f"{name}_Paint", color=paint_col, metallic=0.7, roughness=0.28)
    rubber = make_mat(f"{name}_Rubber", color=(0.02, 0.02, 0.02, 1), roughness=0.9)
    rim_mat = make_mat(f"{name}_Rim", color=(0.7, 0.7, 0.72, 1), metallic=1.0, roughness=0.3)
    glass = make_mat(f"{name}_Glass", color=(0.05, 0.07, 0.1, 1), roughness=0.1, alpha=0.4)
    head = make_mat(f"{name}_Head", color=(1, 1, 1, 1), emission=(10, (0.9, 0.95, 1, 1)))
    tail = make_mat(f"{name}_Tail", color=(1, 0, 0, 1), emission=(14, (1, 0.05, 0.02, 1)))

    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= width
        v.co.y *= length
        v.co.z = v.co.z * height + 0.55
        if abs(v.co.y) > length * 0.35:
            v.co.x *= 0.92
    body = mesh_obj("Body", bm)
    body.data.materials.append(paint)

    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= width * 0.85
        v.co.y *= length * 0.45
        v.co.z = v.co.z * 0.35 + cabin_z
    cabin = mesh_obj("CabinGlass", bm)
    cabin.data.materials.append(glass)

    for side, sx in (("L", -width * 0.7), ("R", width * 0.7)):
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 0.22 + sx * 0.5
            v.co.y = v.co.y * 0.05 + length * 0.95
            v.co.z = v.co.z * 0.08 + 0.55
        hl = mesh_obj(f"Headlight_{side}", bm)
        hl.data.materials.append(head)
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            v.co.x = v.co.x * 0.25 + sx * 0.5
            v.co.y = v.co.y * 0.04 - length * 0.95
            v.co.z = v.co.z * 0.08 + 0.55
        tl = mesh_obj(f"Taillight_{side}", bm)
        tl.data.materials.append(tail)

    wheels = [
        make_wheel("Wheel_FL", (-width * 0.85, length * 0.55, 0.3), rubber, rim_mat),
        make_wheel("Wheel_FR", (width * 0.85, length * 0.55, 0.3), rubber, rim_mat),
        make_wheel("Wheel_RL", (-width * 0.85, -length * 0.55, 0.3), rubber, rim_mat),
        make_wheel("Wheel_RR", (width * 0.85, -length * 0.55, 0.3), rubber, rim_mat),
    ]

    for obj in bpy.context.scene.objects:
        if obj != root and obj.parent is None:
            obj.parent = root

    export_root(root, out)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND / f"{kind}.blend"))


def build_pedestrian():
    clear_scene()
    skin = make_mat("Ped_Skin", color=(0.55, 0.4, 0.32, 1), roughness=0.65)
    cloth = make_mat("Ped_Cloth", color=(0.15, 0.25, 0.45, 1), roughness=0.7)
    pants = make_mat("Ped_Pants", color=(0.1, 0.1, 0.12, 1), roughness=0.75)

    # Armature
    arm_data = bpy.data.armatures.new("PedArmature")
    arm_obj = bpy.data.objects.new("PedArmature", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    bones = arm_data.edit_bones

    def add_bone(name, head, tail, parent=None):
        b = bones.new(name)
        b.head = head
        b.tail = tail
        if parent:
            b.parent = bones[parent]
        return b

    add_bone("Root", (0, 0, 0), (0, 0, 0.2))
    add_bone("Hips", (0, 0, 0.95), (0, 0, 1.1), "Root")
    add_bone("Spine", (0, 0, 1.1), (0, 0, 1.45), "Hips")
    add_bone("Chest", (0, 0, 1.45), (0, 0, 1.65), "Spine")
    add_bone("Neck", (0, 0, 1.65), (0, 0, 1.75), "Chest")
    add_bone("Head", (0, 0, 1.75), (0, 0, 1.95), "Neck")
    add_bone("Thigh_L", (-0.12, 0, 0.95), (-0.12, 0, 0.5), "Hips")
    add_bone("Shin_L", (-0.12, 0, 0.5), (-0.12, 0, 0.1), "Thigh_L")
    add_bone("Foot_L", (-0.12, 0, 0.1), (-0.12, 0.18, 0.05), "Shin_L")
    add_bone("Thigh_R", (0.12, 0, 0.95), (0.12, 0, 0.5), "Hips")
    add_bone("Shin_R", (0.12, 0, 0.5), (0.12, 0, 0.1), "Thigh_R")
    add_bone("Foot_R", (0.12, 0, 0.1), (0.12, 0.18, 0.05), "Shin_R")
    add_bone("UpperArm_L", (-0.18, 0, 1.55), (-0.45, 0, 1.35), "Chest")
    add_bone("ForeArm_L", (-0.45, 0, 1.35), (-0.55, 0, 1.1), "UpperArm_L")
    add_bone("UpperArm_R", (0.18, 0, 1.55), (0.45, 0, 1.35), "Chest")
    add_bone("ForeArm_R", (0.45, 0, 1.35), (0.55, 0, 1.1), "UpperArm_R")
    bpy.ops.object.mode_set(mode="OBJECT")

    # Body mesh parts (stylized)
    parts = []
    def capsule(name, loc, scale, mat):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=12, v_segments=8, radius=0.5)
        for v in bm.verts:
            v.co.x *= scale[0]
            v.co.y *= scale[1]
            v.co.z *= scale[2]
            v.co += Vector(loc)
        obj = mesh_obj(name, bm)
        obj.data.materials.append(mat)
        parts.append(obj)
        return obj

    capsule("Torso", (0, 0, 1.35), (0.28, 0.18, 0.35), cloth)
    capsule("Pelvis", (0, 0, 1.0), (0.26, 0.16, 0.15), pants)
    capsule("HeadMesh", (0, 0.02, 1.85), (0.16, 0.18, 0.18), skin)
    capsule("ThighL", (-0.12, 0, 0.72), (0.1, 0.1, 0.28), pants)
    capsule("ThighR", (0.12, 0, 0.72), (0.1, 0.1, 0.28), pants)
    capsule("ShinL", (-0.12, 0, 0.3), (0.08, 0.09, 0.22), pants)
    capsule("ShinR", (0.12, 0, 0.3), (0.08, 0.09, 0.22), pants)
    capsule("ArmL", (-0.35, 0, 1.4), (0.2, 0.07, 0.07), cloth)
    capsule("ArmR", (0.35, 0, 1.4), (0.2, 0.07, 0.07), cloth)

    # Join meshes
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    body = bpy.context.view_layer.objects.active
    body.name = "PedBody"

    # Parent with automatic weights
    body.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")

    # Walk cycle
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="POSE")
    action = bpy.data.actions.new("Walk")
    arm_obj.animation_data_create()
    arm_obj.animation_data.action = action
    fps = 24
    frames = [1, 12, 24]
    pose = arm_obj.pose.bones

    def key_rot(bone_name, frame, euler):
        bone = pose[bone_name]
        bone.rotation_mode = "XYZ"
        bone.rotation_euler = euler
        bone.keyframe_insert(data_path="rotation_euler", frame=frame)

    # Simple opposing limb walk
    key_rot("Thigh_L", 1, (math.radians(25), 0, 0))
    key_rot("Thigh_R", 1, (math.radians(-25), 0, 0))
    key_rot("Shin_L", 1, (math.radians(-10), 0, 0))
    key_rot("Shin_R", 1, (math.radians(-5), 0, 0))
    key_rot("UpperArm_L", 1, (0, 0, math.radians(-20)))
    key_rot("UpperArm_R", 1, (0, 0, math.radians(20)))

    key_rot("Thigh_L", 12, (math.radians(-25), 0, 0))
    key_rot("Thigh_R", 12, (math.radians(25), 0, 0))
    key_rot("Shin_L", 12, (math.radians(-5), 0, 0))
    key_rot("Shin_R", 12, (math.radians(-10), 0, 0))
    key_rot("UpperArm_L", 12, (0, 0, math.radians(20)))
    key_rot("UpperArm_R", 12, (0, 0, math.radians(-20)))

    key_rot("Thigh_L", 24, (math.radians(25), 0, 0))
    key_rot("Thigh_R", 24, (math.radians(-25), 0, 0))
    key_rot("Shin_L", 24, (math.radians(-10), 0, 0))
    key_rot("Shin_R", 24, (math.radians(-5), 0, 0))
    key_rot("UpperArm_L", 24, (0, 0, math.radians(-20)))
    key_rot("UpperArm_R", 24, (0, 0, math.radians(20)))

    # Mark action as looping via fake user / NLA
    action.use_fake_user = True
    bpy.ops.object.mode_set(mode="OBJECT")

    root = bpy.data.objects.new("Pedestrian", None)
    bpy.context.collection.objects.link(root)
    arm_obj.parent = root
    if body.parent is None:
        body.parent = root

    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 24

    export_root(root, OUT / "pedestrian.glb")
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND / "pedestrian.blend"))


def main():
    build_vehicle("sedan")
    build_vehicle("suv")
    build_pedestrian()
    print("ALL_TRAFFIC_PED_DONE")


main()
