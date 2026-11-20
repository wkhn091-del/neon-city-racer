"""Assemble city_track.glb from Sketchfab templates + Poly Haven asphalt.
Road/collision layout only — all Visual_* buildings/props are Sketchfab instances.
"""
import math
import bpy
from mathutils import Vector, Matrix, Euler
from pathlib import Path


EXPORT = Path(r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\public\models\city_track.glb")


def ensure_collections():
    scene = bpy.context.scene.collection
    names = ["Visual_Buildings", "Visual_Props", "Visual_Track", "Colliders"]
    cols = {}
    for n in names:
        c = bpy.data.collections.get(n) or bpy.data.collections.new(n)
        if c.name not in scene.children:
            scene.children.link(c)
        cols[n] = c
    return cols


def link_to(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)


def world_bbox_hierarchy(root):
    meshes = [root] if root.type == "MESH" else []
    meshes += [c for c in root.children_recursive if c.type == "MESH"]
    if not meshes:
        return Vector((0, 0, 0)), Vector((0, 0, 0))
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
            mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
    return mn, mx


def ground_template(root):
    mn, mx = world_bbox_hierarchy(root)
    root.location.z -= mn.z
    bpy.context.view_layer.update()


def duplicate_hierarchy(root, name):
    # Deep copy via bpy.ops is fragile; use object.copy recursively
    mapping = {}

    def copy_obj(o, parent=None):
        no = o.copy()
        if o.data:
            no.data = o.data.copy()
        bpy.context.scene.collection.objects.link(no)
        mapping[o] = no
        if parent:
            no.parent = parent
            no.matrix_parent_inverse = o.matrix_parent_inverse.copy()
        for ch in o.children:
            copy_obj(ch, no)
        return no

    new_root = copy_obj(root, None)
    new_root.name = name
    return new_root


def make_track_curve(name="RaceCircuit", rx=280.0, ry=200.0):
    """Stadium oval ~1.5km+ perimeter."""
    # Approximate perimeter of ellipse: 2π√((a²+b²)/2)
    # a=280,b=200 → ~1520m
    curve_data = bpy.data.curves.new(name, type="CURVE")
    curve_data.dimensions = "3D"
    spline = curve_data.splines.new("BEZIER")
    # 8 control points for smooth stadium
    pts = []
    for i in range(8):
        a = i * math.pi / 4
        # squash sides for longer straights feel
        x = rx * math.cos(a)
        y = ry * math.sin(a)
        if abs(math.cos(a)) > 0.7:
            x *= 1.05
        pts.append((x, y, 0.0))
    spline.bezier_points.add(len(pts) - 1)
    for i, (x, y, z) in enumerate(pts):
        bp = spline.bezier_points[i]
        bp.co = (x, y, z)
        # handle length
        t = math.atan2(y, x) if False else i * math.pi / 4
        hx = -math.sin(t) * (rx + ry) * 0.18
        hy = math.cos(t) * (rx + ry) * 0.18
        bp.handle_left_type = "ALIGNED"
        bp.handle_right_type = "ALIGNED"
        bp.handle_left = (x - hx, y - hy, z)
        bp.handle_right = (x + hx, y + hy, z)
    spline.use_cyclic_u = True

    obj = bpy.data.objects.new(name, curve_data)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def curve_to_road_mesh(curve_obj, width=16.0, name="Visual_Track"):
    curve_obj.data.bevel_depth = width * 0.5
    curve_obj.data.bevel_resolution = 2
    curve_obj.data.use_fill_caps = False
    curve_obj.data.resolution_u = 64
    bpy.context.view_layer.update()

    # Convert to mesh
    bpy.ops.object.select_all(action="DESELECT")
    curve_obj.select_set(True)
    bpy.context.view_layer.objects.active = curve_obj
    bpy.ops.object.convert(target="MESH")
    road = bpy.context.view_layer.objects.active
    road.name = name

    # Assign asphalt
    mat = bpy.data.materials.get("asphalt_pit_lane")
    if mat:
        road.data.materials.clear()
        road.data.materials.append(mat)
        # scale mapping for tiling
        if mat.use_nodes:
            for n in mat.node_tree.nodes:
                if n.type == "MAPPING":
                    # road is huge — tile many times
                    n.inputs["Scale"].default_value = (40.0, 40.0, 40.0)
    return road


def make_collider_road(visual_road):
    col = visual_road.copy()
    col.data = visual_road.data.copy()
    bpy.context.scene.collection.objects.link(col)
    col.name = "Collider_Road"
    # invisible / no materials needed
    col.data.materials.clear()
    return col


def make_collider_walls(rx=280.0, ry=200.0, road_half=8.0, wall_h=2.5, samples=96):
    """Invisible wall ribbon along inner/outer edges — physics only."""
    verts = []
    faces = []

    def ring(scale, z0, z1):
        base = len(verts)
        for i in range(samples):
            a = 2 * math.pi * i / samples
            x = scale[0] * math.cos(a)
            y = scale[1] * math.sin(a)
            verts.append((x, y, z0))
            verts.append((x, y, z1))
        for i in range(samples):
            i0 = base + 2 * i
            i1 = base + 2 * ((i + 1) % samples)
            faces.append((i0, i1, i1 + 1, i0 + 1))

    # outer wall slightly outside road
    ring((rx + road_half + 1.5, ry + road_half + 1.5), 0.0, wall_h)
    # inner wall
    ring((rx - road_half - 1.5, ry - road_half - 1.5), 0.0, wall_h)

    mesh = bpy.data.meshes.new("Collider_Walls")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new("Collider_Walls", mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def sample_track_points(rx, ry, n):
    pts = []
    for i in range(n):
        a = 2 * math.pi * i / n
        # tangent angle
        tx = -rx * math.sin(a)
        ty = ry * math.cos(a)
        tang = math.atan2(ty, tx)
        x = rx * math.cos(a)
        y = ry * math.sin(a)
        # outward normal (left of tangent in XY)
        nx = -math.sin(tang)
        ny = math.cos(tang)
        pts.append((Vector((x, y, 0)), tang, Vector((nx, ny, 0))))
    return pts


def place_buildings(cols, rx, ry):
    templates = [o for o in bpy.data.objects if o.name.startswith("Template_Building_")]
    for t in templates:
        ground_template(t)

    pts = sample_track_points(rx, ry, 36)
    # place outside road
    offset = 28.0
    for i, (p, tang, nrm) in enumerate(pts):
        tmpl = templates[i % len(templates)]
        inst = duplicate_hierarchy(tmpl, f"Visual_Building_{i:02d}")
        # ground
        ground_template(inst)
        pos = p + nrm * offset
        # slight inward/outward alternate density
        if i % 3 == 0:
            pos = p + nrm * (offset + 35.0)
        inst.location = pos
        # face track
        inst.rotation_euler = Euler((0, 0, tang + math.pi / 2), "XYZ")
        # vary scale slightly
        s = 0.85 + (i % 5) * 0.08
        inst.scale = (s, s, s * (0.9 + (i % 4) * 0.12))
        link_to(inst, cols["Visual_Buildings"])
        # also place on inner side every other
        if i % 2 == 0:
            inst2 = duplicate_hierarchy(tmpl, f"Visual_Building_IN_{i:02d}")
            ground_template(inst2)
            pos2 = p - nrm * (offset + 10.0)
            inst2.location = pos2
            inst2.rotation_euler = Euler((0, 0, tang - math.pi / 2), "XYZ")
            s2 = 0.7 + (i % 3) * 0.1
            inst2.scale = (s2, s2, s2)
            link_to(inst2, cols["Visual_Buildings"])
    print("BUILDINGS_PLACED", len([o for o in bpy.data.objects if o.name.startswith("Visual_Building")]))


def place_props(cols, rx, ry):
    lamp = bpy.data.objects.get("Template_Lamp")
    sign = bpy.data.objects.get("Template_Sign")
    if lamp:
        ground_template(lamp)
    if sign:
        ground_template(sign)

    pts = sample_track_points(rx, ry, 48)
    for i, (p, tang, nrm) in enumerate(pts):
        if lamp:
            inst = duplicate_hierarchy(lamp, f"Visual_Lamp_{i:02d}")
            ground_template(inst)
            inst.location = p + nrm * 10.5
            inst.rotation_euler = Euler((0, 0, tang), "XYZ")
            link_to(inst, cols["Visual_Props"])
            # emissive boost on lamp materials
        if sign and i % 4 == 0:
            inst = duplicate_hierarchy(sign, f"Visual_Sign_{i:02d}")
            ground_template(inst)
            inst.location = p + nrm * 14.0
            inst.rotation_euler = Euler((0, 0, tang + math.pi / 2), "XYZ")
            link_to(inst, cols["Visual_Props"])

    # emissive for lamps/signs
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        n = mat.name.lower()
        bsdf = next((node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        if any(k in n for k in ("emit", "emiss", "light", "lamp", "bulb", "neon", "flare", "shell")):
            bsdf.inputs["Emission Color"].default_value = list(bsdf.inputs["Base Color"].default_value)
            bsdf.inputs["Emission Strength"].default_value = 20.0
    print("PROPS_PLACED")


def boost_building_windows():
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        n = mat.name.lower()
        bsdf = next((node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        if any(k in n for k in ("window", "glass", "emiss", "emmisi", "bulb", "flare", "lobby")):
            if "Emission Strength" in bsdf.inputs:
                col = list(bsdf.inputs["Base Color"].default_value)
                bsdf.inputs["Emission Color"].default_value = col
                strength = bsdf.inputs["Emission Strength"].default_value
                if strength < 2.0:
                    bsdf.inputs["Emission Strength"].default_value = 8.0


def assemble():
    cols = ensure_collections()
    rx, ry = 280.0, 200.0

    # Hide templates
    for o in bpy.data.objects:
        if o.name.startswith("Template_"):
            o.hide_render = True
            o.hide_viewport = True
            ground_template(o)

    curve = make_track_curve("RaceCircuit", rx, ry)
    road = curve_to_road_mesh(curve, width=16.0, name="Visual_Track")
    link_to(road, cols["Visual_Track"])

    collider_road = make_collider_road(road)
    link_to(collider_road, cols["Colliders"])
    walls = make_collider_walls(rx, ry, road_half=8.0)
    link_to(walls, cols["Colliders"])

    place_buildings(cols, rx, ry)
    place_props(cols, rx, ry)
    boost_building_windows()

    # Select everything except templates for export
    bpy.ops.object.select_all(action="DESELECT")
    export_roots = []
    for o in bpy.data.objects:
        if o.name.startswith("Template_"):
            continue
        if o.name.startswith("Visual_") or o.name.startswith("Collider_"):
            o.select_set(True)
            export_roots.append(o.name)
    print("EXPORT_COUNT", len(export_roots))

    EXPORT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(EXPORT),
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )
    print("EXPORTED", EXPORT, EXPORT.stat().st_size if EXPORT.exists() else 0)


if __name__ == "__main__":
    assemble()
