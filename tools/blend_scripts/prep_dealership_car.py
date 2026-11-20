"""Prep Sketchfab car: Wheel_* hubs, ground Z=0, face -Y, emissives, export GLB."""
import bpy
from mathutils import Vector, Euler
from pathlib import Path


def world_bbox(objs):
    mn = Vector((1e9, 1e9, 1e9))
    mx = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
            mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
    return mn, mx


def center_of(objs):
    mn, mx = world_bbox(objs)
    return (mn + mx) * 0.5


def make_emissive():
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        n = mat.name.lower()
        bsdf = next((node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        if any(k in n for k in ("light", "lamp", "emit", "head", "tail", "backlight", "glass", "front", "rear")):
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = list(bsdf.inputs["Base Color"].default_value)
                bsdf.inputs["Emission Strength"].default_value = 14.0
                print("EMIT", mat.name)


def find_wheel_clusters():
    # DEF-Wheel style parents (rigged cars)
    def_wheels = [
        o
        for o in bpy.data.objects
        if "wheel" in o.name.lower()
        and ("def-" in o.name.lower() or "name-wheel" in o.name.lower() or o.name.lower().startswith("wheel_"))
        and o.type != "MESH"
    ]
    if def_wheels:
        items = []
        for d in def_wheels:
            meshes = [c for c in list(d.children_recursive) if c.type == "MESH"]
            if meshes:
                items.append((d, center_of(meshes), meshes))
        if len(items) >= 4:
            return items

    # Strict: only meshes whose names contain wheel/tyre/tire/rim
    named = [
        o
        for o in bpy.data.objects
        if o.type == "MESH"
        and any(k in o.name.lower() for k in ("tyre", "tire", "wheel", "rim"))
    ]
    candidates = named if len(named) >= 4 else [
        o for o in bpy.data.objects if o.type == "MESH"
    ]
    # Cluster mesh centers into up to 4 corner groups
    clusters = []
    for o in candidates:
        if o.type != "MESH":
            continue
        mn, mx = world_bbox([o])
        sz = mx - mn
        dims = sorted((sz.x, sz.y, sz.z))
        c = (mn + mx) * 0.5
        # skip huge body panels
        if dims[2] > 1.2 or dims[2] < 0.15:
            continue
        if c.z > 1.2:
            continue
        placed = False
        for cl in clusters:
            if (Vector((c.x, c.y, 0)) - Vector((cl["c"].x, cl["c"].y, 0))).length < 0.45:
                cl["meshes"].append(o)
                cl["c"] = center_of(cl["meshes"])
                placed = True
                break
        if not placed:
            clusters.append({"c": c, "meshes": [o]})
    # Keep 4 best (most verts) near corners
    clusters.sort(key=lambda cl: -sum(len(m.data.vertices) for m in cl["meshes"]))
    return [(cl["meshes"][0], cl["c"], cl["meshes"]) for cl in clusters[:8]]


def prep_and_export(export_path: str, target_length=4.5, root_name="DealershipCar"):
    export = Path(export_path)
    export.parent.mkdir(parents=True, exist_ok=True)

    # Parent everything under a temp root, normalize scale/ground FIRST, then find wheels
    root = bpy.data.objects.new(root_name, None)
    bpy.context.collection.objects.link(root)
    for o in list(bpy.data.objects):
        if o == root:
            continue
        if o.parent is None:
            o.parent = root

    bpy.context.view_layer.update()
    meshes_all = [o for o in bpy.data.objects if o.type == "MESH"]
    mn, mx = world_bbox(meshes_all)
    length = max((mx - mn).x, (mx - mn).y)
    if length > 0.1:
        root.scale = (target_length / length,) * 3
        bpy.context.view_layer.update()
    mn, mx = world_bbox(meshes_all)
    root.location.z -= mn.z
    root.location.x -= (mn.x + mx.x) * 0.5
    root.location.y -= (mn.y + mx.y) * 0.5
    bpy.context.view_layer.update()

    # If length is primarily on X, rotate so length is on Y before wheel labeling
    mn, mx = world_bbox(meshes_all)
    size = mx - mn
    if size.x > size.y * 1.15:
        root.rotation_euler = Euler((0.0, 0.0, 1.5707963267948966), "XYZ")
        bpy.context.view_layer.update()
        mn, mx = world_bbox(meshes_all)
        root.location.z -= mn.z
        root.location.x -= (mn.x + mx.x) * 0.5
        root.location.y -= (mn.y + mx.y) * 0.5
        bpy.context.view_layer.update()

    items = find_wheel_clusters()
    print("WHEEL_CANDIDATES", len(items))
    allc = [c for _, c, _ in items]
    if not allc:
        print("NO_WHEELS — creating empty axle pivots from bbox corners")
        mn, mx = world_bbox(meshes_all)
        mid = (mn + mx) * 0.5
        # approximate wheel positions
        approx = {
            "Wheel_FL": Vector((mn.x + (mx.x - mn.x) * 0.18, mx.y - (mx.y - mn.y) * 0.18, mid.z * 0.35)),
            "Wheel_FR": Vector((mx.x - (mx.x - mn.x) * 0.18, mx.y - (mx.y - mn.y) * 0.18, mid.z * 0.35)),
            "Wheel_RL": Vector((mn.x + (mx.x - mn.x) * 0.18, mn.y + (mx.y - mn.y) * 0.18, mid.z * 0.35)),
            "Wheel_RR": Vector((mx.x - (mx.x - mn.x) * 0.18, mn.y + (mx.y - mn.y) * 0.18, mid.z * 0.35)),
        }
        for wname, loc in approx.items():
            pivot = bpy.data.objects.new(wname, None)
            bpy.context.collection.objects.link(pivot)
            pivot.empty_display_type = "SPHERE"
            pivot.empty_display_size = 0.08
            pivot.location = loc
            pivot.parent = root
            print("EMPTY_PIVOT", wname, tuple(round(x, 3) for x in loc))
    else:
        cy = sum(v.y for v in allc) / len(allc)
        cx = sum(v.x for v in allc) / len(allc)
        mapping = {}
        for p, c, meshes in items:
            q = ("F" if c.y >= cy else "R") + ("L" if c.x < cx else "R")
            name = f"Wheel_{q}"
            if name in mapping:
                mapping[name][2].extend([m for m in meshes if m not in mapping[name][2]])
            else:
                mapping[name] = (p, c, list(meshes))
            print("MAP", name, [m.name for m in meshes], tuple(round(x, 3) for x in c))
        for wname, (p, c, meshes) in mapping.items():
            if wname not in ("Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR"):
                continue
            pivot = bpy.data.objects.new(wname, None)
            bpy.context.collection.objects.link(pivot)
            pivot.empty_display_type = "SPHERE"
            pivot.empty_display_size = 0.08
            pivot.location = c.copy()
            pivot.parent = root
            for m in meshes:
                mw = m.matrix_world.copy()
                m.parent = pivot
                m.matrix_world = mw

    # Face -Y → glTF +Z forward
    root.rotation_euler.z += 3.141592653589793
    bpy.context.view_layer.update()
    mn, mx = world_bbox(meshes_all)
    root.location.z -= mn.z
    root.location.x -= (mn.x + mx.x) * 0.5
    root.location.y -= (mn.y + mx.y) * 0.5
    bpy.context.view_layer.update()
    mn, mx = world_bbox(meshes_all)
    print("FINAL", tuple(round(x, 3) for x in (mx - mn)), "z0", round(mn.z, 4))

    make_emissive()

    bpy.ops.object.select_all(action="DESELECT")

    def sel(o):
        o.select_set(True)
        for ch in o.children:
            sel(ch)

    sel(root)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(export),
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )
    print("EXPORTED", export, export.stat().st_size if export.exists() else 0)
    print("PIVOTS", sorted(o.name for o in bpy.data.objects if o.name in ("Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR")))


if __name__ == "__main__":
    prep_and_export(
        r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\public\models\car_starter.glb",
        4.4,
        "CarStarter",
    )
