"""
Phase 1 car repair (Blender):
- Scale longest axis to ~4.5 m
- Face -Y (Three.js +Z after glTF)
- Lowest tire point flush on Z=0
- Create Wheel_FL/FR/RL/RR empties at tire centers WITHOUT moving wheel meshes out of arches
- Parent tyre meshes to those empties; origin centered on wheel mesh data
"""
import bpy
from mathutils import Vector, Matrix
from pathlib import Path

TARGET_LEN = 4.5
ROOT = Path(r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\public\models")
CARS = [
    "car_starter.glb",
    "car_muscle.glb",
    "car_super.glb",
    "car_hyper.glb",
    "traffic_sedan.glb",
    "traffic_suv.glb",
]


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


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for col in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.armatures):
        for block in list(col):
            if block.users == 0:
                col.remove(block)


def gather_meshes():
    return [o for o in bpy.data.objects if o.type == "MESH"]


def find_tyre_clusters(meshes):
    """Group tyre/wheel meshes by proximity; return list of (center, mesh_list)."""
    candidates = []
    for o in meshes:
        n = o.name.lower()
        if any(k in n for k in ("tyre", "tire", "wheel", "rim", "disk")):
            candidates.append(o)
    if len(candidates) < 4:
        # fallback: smallest near-disk meshes at bottom corners
        scored = []
        for o in meshes:
            mn, mx = world_bbox([o])
            size = mx - mn
            vol = max(size.x, 0.001) * max(size.y, 0.001) * max(size.z, 0.001)
            if vol < 2.5 and size.z < 1.2:
                scored.append((vol, o))
        scored.sort(key=lambda t: t[0])
        candidates = [o for _, o in scored[:12]]

    clusters = []
    used = set()
    for o in candidates:
        if o.name in used:
            continue
        c = world_bbox([o])
        center = (c[0] + c[1]) * 0.5
        group = [o]
        used.add(o.name)
        for other in candidates:
            if other.name in used:
                continue
            oc = world_bbox([other])
            ocenter = (oc[0] + oc[1]) * 0.5
            if (ocenter - center).length < 0.85:
                group.append(other)
                used.add(other.name)
                c2 = world_bbox(group)
                center = (c2[0] + c2[1]) * 0.5
        clusters.append((center, group))
    clusters.sort(key=lambda t: (t[0].y, t[0].x))
    return clusters


def assign_corners(clusters):
    """Map up to 4 clusters to FL/FR/RL/RR by X/Y quadrants (Blender: +X right, +Y forward before flip)."""
    if len(clusters) < 4:
        return {}
    # pick 4 farthest from center of car
    xs = [c[0].x for c in clusters]
    ys = [c[0].y for c in clusters]
    mid_x = (min(xs) + max(xs)) * 0.5
    mid_y = (min(ys) + max(ys)) * 0.5
    fl = fr = rl = rr = None
    for center, group in clusters:
        if center.y >= mid_y and center.x < mid_x:
            fl = (center, group)
        elif center.y >= mid_y and center.x >= mid_x:
            fr = (center, group)
        elif center.y < mid_y and center.x < mid_x:
            rl = (center, group)
        else:
            rr = (center, group)
    # fill missing with nearest unused
    mapping = {"FL": fl, "FR": fr, "RL": rl, "RR": rr}
    unused = [c for c in clusters if c not in mapping.values()]
    for key in list(mapping.keys()):
        if mapping[key] is None and unused:
            mapping[key] = unused.pop(0)
    return {k: v for k, v in mapping.items() if v is not None}


def origin_to_geometry(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")


def repair_current(export_path: Path):
    meshes = gather_meshes()
    if not meshes:
        print("NO_MESHES", export_path.name)
        return False

    # Parent all under CarRoot
    root = bpy.data.objects.new("CarRoot", None)
    bpy.context.collection.objects.link(root)
    for o in list(bpy.data.objects):
        if o == root:
            continue
        if o.parent is None:
            o.parent = root

    mn, mx = world_bbox(meshes)
    size = mx - mn
    # If Z is longest, model is upright-wrong — rotate -90 around X
    if size.z > size.x * 1.15 and size.z > size.y * 1.15:
        root.rotation_euler[0] -= 1.57079632679
        bpy.context.view_layer.update()
        mn, mx = world_bbox(gather_meshes())
        size = mx - mn

    length = max(size.x, size.y, 0.001)
    scale = TARGET_LEN / length
    root.scale *= scale
    bpy.context.view_layer.update()

    mn, mx = world_bbox(gather_meshes())
    center = (mn + mx) * 0.5
    # Face -Y: if length is along X, rotate 90° around Z
    size = mx - mn
    if size.x > size.y:
        root.rotation_euler[2] += 1.57079632679
        bpy.context.view_layer.update()
        mn, mx = world_bbox(gather_meshes())
        center = (mn + mx) * 0.5

    # Center X, put length mid on Y=0? Keep nose toward -Y: translate so center.x=0, min.z=0
    # Orient: after glTF, Blender -Y becomes Three +Z. Nose should be -Y.
    # Move so geometric center X=0, front (-Y) stays, Z min = 0
    root.location.x -= center.x
    root.location.y -= center.y
    bpy.context.view_layer.update()
    mn, mx = world_bbox(gather_meshes())
    root.location.z -= mn.z
    bpy.context.view_layer.update()

    # Ensure forward is -Y: check which end is "front" by looking at badge/hood names, else keep
    # Flip 180 around Z if needed so max extent of body detail — skip heuristic, assume Sketchfab Y-forward was +Y so rotate 180
    # Many Sketchfab cars face +Y; we want -Y
    root.rotation_euler[2] += 3.14159265359
    bpy.context.view_layer.update()
    mn, mx = world_bbox(gather_meshes())
    center = (mn + mx) * 0.5
    root.location.x -= center.x
    root.location.y -= center.y
    root.location.z -= mn.z
    bpy.context.view_layer.update()
    mn, mx = world_bbox(gather_meshes())
    root.location.z -= mn.z
    bpy.context.view_layer.update()

    meshes = gather_meshes()
    clusters = find_tyre_clusters(meshes)
    corners = assign_corners(clusters)
    print("WHEEL_CLUSTERS", len(clusters), "ASSIGNED", list(corners.keys()))

    for wid, (center, group) in corners.items():
        empty = bpy.data.objects.new(f"Wheel_{wid}", None)
        empty.empty_display_type = "SPHERE"
        empty.empty_display_size = 0.15
        bpy.context.collection.objects.link(empty)
        empty.matrix_world = Matrix.Translation(center)
        empty.parent = root
        # Keep world matrix after parenting
        empty.matrix_parent_inverse = root.matrix_world.inverted()
        for mesh in group:
            # Do NOT translate mesh — only reparent preserving world transform
            mw = mesh.matrix_world.copy()
            mesh.parent = empty
            mesh.matrix_world = mw
            origin_to_geometry(mesh)

    mn, mx = world_bbox(gather_meshes())
    print(
        "FINAL",
        export_path.name,
        "size",
        tuple(round(v, 3) for v in (mx - mn)),
        "minZ",
        round(mn.z, 4),
        "wheels",
        [o.name for o in bpy.data.objects if o.name.startswith("Wheel_")],
    )

    # Apply root transforms for clean export
    bpy.ops.object.select_all(action="DESELECT")
    root.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    export_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(export_path),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_yup=True,
    )
    print("EXPORTED", export_path)
    return True


def run_all():
    for name in CARS:
        src = ROOT / name
        if not src.exists():
            print("MISSING", name)
            continue
        clear_scene()
        bpy.ops.import_scene.gltf(filepath=str(src))
        out = ROOT / "_phase1" / name
        repair_current(out)
    print("PHASE1_CARS_DONE")


if __name__ == "__main__":
    run_all()
