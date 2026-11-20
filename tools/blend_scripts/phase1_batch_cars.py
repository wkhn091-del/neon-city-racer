"""
Phase 1 car repair — scale FIRST (so wheel heuristics work), then pivots, face -Y, Z=0.
Never translates wheel meshes out of arches — only reparents preserving world matrix.
"""
import bpy
from mathutils import Vector, Euler
from pathlib import Path

ROOT = Path(r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\public\models")
OUT = ROOT / "_phase1"
TARGET = 4.5
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
    hit = False
    for o in objs:
        if o.type != "MESH":
            continue
        hit = True
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            mn = Vector((min(mn.x, w.x), min(mn.y, w.y), min(mn.z, w.z)))
            mx = Vector((max(mx.x, w.x), max(mx.y, w.y), max(mx.z, w.z)))
    if not hit:
        return Vector((0, 0, 0)), Vector((0, 0, 0))
    return mn, mx


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for col in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for b in list(col):
            if b.users == 0:
                col.remove(b)


def meshes():
    return [o for o in bpy.data.objects if o.type == "MESH"]


def ensure_root(name):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    for o in list(bpy.data.objects):
        if o != root and o.parent is None:
            mw = o.matrix_world.copy()
            o.parent = root
            o.matrix_world = mw
    return root


def scale_ground_orient(root):
    bpy.context.view_layer.update()
    mn, mx = world_bbox(meshes())
    size = mx - mn
    # Lay down if height is dominant
    if size.z > size.x * 1.2 and size.z > size.y * 1.2:
        root.rotation_euler[0] -= 1.57079632679
        bpy.context.view_layer.update()
        mn, mx = world_bbox(meshes())
        size = mx - mn

    length = max(size.x, size.y, 0.001)
    root.scale *= TARGET / length
    bpy.context.view_layer.update()

    # Make longest horizontal axis = Y (forward/back)
    mn, mx = world_bbox(meshes())
    size = mx - mn
    if size.x > size.y:
        root.rotation_euler[2] += 1.57079632679
        bpy.context.view_layer.update()

    # Face -Y
    root.rotation_euler[2] += 3.14159265359
    bpy.context.view_layer.update()

    mn, mx = world_bbox(meshes())
    c = (mn + mx) * 0.5
    root.location.x -= c.x
    root.location.y -= c.y
    root.location.z -= mn.z
    bpy.context.view_layer.update()
    mn, mx = world_bbox(meshes())
    root.location.z -= mn.z
    bpy.context.view_layer.update()
    mn, mx = world_bbox(meshes())
    print("SCALED_BBOX", tuple(round(v, 3) for v in (mx - mn)), "minZ", round(mn.z, 4))


def find_wheels():
    """After scale — find 4 corner tyre groups."""
    candidates = []
    for o in meshes():
        mn, mx = world_bbox([o])
        sz = mx - mn
        c = (mn + mx) * 0.5
        dims = sorted((sz.x, sz.y, sz.z))
        n = o.name.lower()
        named = any(k in n for k in ("tyre", "tire", "wheel", "rim", "disk"))
        wheelish = 0.2 <= dims[2] <= 1.05 and dims[0] >= 0.08 and (dims[2] / max(dims[0], 1e-6)) < 4.5
        near_ground = -0.15 <= c.z <= 0.95
        if (named or wheelish) and near_ground:
            candidates.append((o, c, sz))

    if len(candidates) < 4:
        # looser fallback: lowest 8 small meshes
        scored = []
        for o in meshes():
            mn, mx = world_bbox([o])
            sz = mx - mn
            c = (mn + mx) * 0.5
            vol = sz.x * sz.y * sz.z
            if vol < 1.2 and c.z < 1.0:
                scored.append((c.z + vol, o, c, sz))
        scored.sort()
        candidates = [(o, c, sz) for _, o, c, sz in scored[:16]]

    all_mn, all_mx = world_bbox(meshes())
    mid = (all_mn + all_mx) * 0.5
    corners = {
        "FL": Vector((all_mn.x, all_mx.y, 0)),
        "FR": Vector((all_mx.x, all_mx.y, 0)),
        "RL": Vector((all_mn.x, all_mn.y, 0)),
        "RR": Vector((all_mx.x, all_mn.y, 0)),
    }
    used = set()
    mapping = {}
    for q, corner in corners.items():
        best = None
        best_d = 1e9
        for o, c, sz in candidates:
            if o.name in used:
                continue
            d = (Vector((c.x, c.y, 0)) - Vector((corner.x, corner.y, 0))).length
            if d < best_d:
                best_d = d
                best = (o, c)
        if not best:
            continue
        o, c = best
        used.add(o.name)
        group = [o]
        for o2, c2, _ in candidates:
            if o2.name in used:
                continue
            if (c2 - c).length < 0.55:
                group.append(o2)
                used.add(o2.name)
        mapping[q] = (c, group)
        print("WHEEL", q, [g.name for g in group], tuple(round(x, 3) for x in c))
    return mapping


def attach_pivots(root, mapping):
    for q, (c, group) in mapping.items():
        pivot = bpy.data.objects.new(f"Wheel_{q}", None)
        bpy.context.collection.objects.link(pivot)
        pivot.empty_display_type = "SPHERE"
        pivot.empty_display_size = 0.12
        pivot.matrix_world = __import__("mathutils").Matrix.Translation(c)
        pivot.parent = root
        pivot.matrix_parent_inverse = root.matrix_world.inverted()
        for m in group:
            mw = m.matrix_world.copy()
            m.parent = pivot
            m.matrix_world = mw
            bpy.ops.object.select_all(action="DESELECT")
            m.select_set(True)
            bpy.context.view_layer.objects.active = m
            bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")


def export_glb(path: Path, root):
    bpy.ops.object.select_all(action="DESELECT")

    def sel(o):
        o.select_set(True)
        for ch in o.children:
            sel(ch)

    sel(root)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        use_selection=True,
        export_format="GLB",
        export_apply=True,
        export_yup=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
    )
    mn, mx = world_bbox(meshes())
    print("EXPORT", path.name, "size", tuple(round(v, 3) for v in (mx - mn)), "minZ", round(mn.z, 4), "bytes", path.stat().st_size)


def process(name):
    src = ROOT / name
    if not src.exists():
        print("MISSING", name)
        return
    print("===", name, "===")
    clear()
    bpy.ops.import_scene.gltf(filepath=str(src))
    root = ensure_root(name.replace(".glb", ""))
    scale_ground_orient(root)
    mapping = find_wheels()
    attach_pivots(root, mapping)
    # re-ground after pivot ops
    mn, mx = world_bbox(meshes())
    root.location.z -= mn.z
    bpy.context.view_layer.update()
    OUT.mkdir(parents=True, exist_ok=True)
    export_glb(OUT / name, root)


OUT.mkdir(parents=True, exist_ok=True)
for car in CARS:
    process(car)
print("BATCH_DONE")
