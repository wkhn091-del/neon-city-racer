"""Prepare an already-imported Sketchfab car: Wheel_* pivots, ground, forward axis, export."""
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


def mesh_size(o):
    mn, mx = world_bbox([o])
    return mx - mn


def make_emissive():
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        n = mat.name.lower()
        bsdf = next((node for node in mat.node_tree.nodes if node.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        if any(k in n for k in ("light", "lamp", "emit", "head", "tail", "backlight", "glass", "lampada")):
            col = list(bsdf.inputs["Base Color"].default_value)
            if "Emission Color" in bsdf.inputs:
                bsdf.inputs["Emission Color"].default_value = col
                strength = 18.0 if any(k in n for k in ("head", "tail", "back")) else 8.0
                bsdf.inputs["Emission Strength"].default_value = strength
            print("EMIT", mat.name)
        # Heuristic: very bright base colors on small light-looking names
        elif any(k in n for k in ("red", "orange")) and "Emission Strength" in bsdf.inputs:
            if bsdf.inputs["Emission Strength"].default_value < 1.0:
                bsdf.inputs["Emission Color"].default_value = (1.0, 0.05, 0.02, 1.0)
                bsdf.inputs["Emission Strength"].default_value = 12.0
                print("EMIT_HEUR", mat.name)


def find_named_tyres():
    tyre_meshes = [o for o in bpy.data.objects if o.name.startswith("Tyre") and o.type == "MESH"]
    disk_meshes = [o for o in bpy.data.objects if o.name.startswith("Disk") and o.type == "MESH"]
    if not tyre_meshes:
        tyre_meshes = [
            o
            for o in bpy.data.objects
            if o.type == "MESH" and any(k in o.name.lower() for k in ("tyre", "tire", "wheel", "rim"))
        ]
    tyre_parents = []
    for t in tyre_meshes:
        p = t
        while p.parent and any(p.parent.name.lower().startswith(k) for k in ("tyre", "tire", "wheel")):
            p = p.parent
        if p not in tyre_parents:
            tyre_parents.append(p if any(p.name.lower().startswith(k) for k in ("tyre", "tire", "wheel")) else t)

    items = []
    for p in tyre_parents:
        meshes = [p] if p.type == "MESH" else [c for c in p.children_recursive if c.type == "MESH"]
        if not meshes:
            continue
        c = center_of(meshes)
        for d in disk_meshes:
            if (center_of([d]) - c).length < 0.6 and d not in meshes:
                meshes.append(d)
        items.append((p, c, meshes))
    return items


def find_wheels_by_geometry():
    """Cluster near-ground roughly-cubic meshes into 4 corner wheel groups."""
    candidates = []
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        sz = mesh_size(o)
        c = center_of([o])
        # wheel-ish: 0.25–0.9m extents, near ground
        dims = sorted((sz.x, sz.y, sz.z))
        if dims[2] < 0.25 or dims[2] > 1.0:
            continue
        if dims[0] < 0.08:
            continue
        # aspect not a long body panel
        if dims[2] / max(dims[0], 1e-6) > 4.0:
            continue
        if c.z > 0.85 or c.z < -0.2:
            continue
        candidates.append((o, c, sz))

    if len(candidates) < 4:
        print("GEO_CANDIDATES_LOW", len(candidates))
        for o, c, sz in candidates:
            print("  ", o.name, tuple(round(x, 3) for x in c), tuple(round(x, 3) for x in sz))
        return []

    # Prefer objects with similar sizes near 4 corners of overall car
    all_meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    mn, mx = world_bbox(all_meshes)
    mid = (mn + mx) * 0.5
    corners = {
        "FL": Vector((mn.x, mx.y, 0)),
        "FR": Vector((mx.x, mx.y, 0)),
        "RL": Vector((mn.x, mn.y, 0)),
        "RR": Vector((mx.x, mn.y, 0)),
    }
    # Rank by how wheel-like (closer to cubic + more verts + lower z)
    scored = []
    for o, c, sz in candidates:
        cubic = min(sz.x, sz.y, sz.z) / max(sz.x, sz.y, sz.z)
        score = cubic * 2.0 + (len(o.data.vertices) / 5000.0) - abs(c.z) * 0.5
        scored.append((score, o, c))
    scored.sort(reverse=True)

    used = set()
    mapping_items = []
    for q, corner in corners.items():
        best = None
        best_d = 1e9
        for score, o, c in scored:
            if o.name in used:
                continue
            d = (Vector((c.x, c.y, 0)) - Vector((corner.x, corner.y, 0))).length
            # also prefer outside of center
            if d < best_d:
                best_d = d
                best = (o, c)
        if not best or best_d > 2.5:
            print("MISS_CORNER", q, best_d)
            continue
        o, c = best
        used.add(o.name)
        # Pull nearby related meshes (rim/disk/brake) into same wheel
        group = [o]
        for score2, o2, c2 in scored:
            if o2.name in used:
                continue
            if (c2 - c).length < 0.55:
                group.append(o2)
                used.add(o2.name)
        mapping_items.append((o, c, group))
        print("GEO_MAP", f"Wheel_{q}", [g.name for g in group], tuple(round(x, 3) for x in c))
    return mapping_items


def prep_and_export(export_path: str, target_length=4.5, root_name="HeroCar"):
    export = Path(export_path)
    export.parent.mkdir(parents=True, exist_ok=True)

    tops = [o for o in bpy.data.objects if o.parent is None]
    print("TOPS", [o.name for o in tops])

    items = find_named_tyres()
    if len(items) < 4:
        print("FALLBACK_GEOMETRY_WHEELS", "named=", len(items))
        items = find_wheels_by_geometry()

    def quadrant(c):
        # Use relative to overall center
        all_c = [c for _, c, _ in items]
        if not all_c:
            return "FL"
        cy = sum(v.y for v in all_c) / len(all_c)
        cx = sum(v.x for v in all_c) / len(all_c)
        return ("F" if c.y >= cy else "R") + ("L" if c.x < cx else "R")

    mapping = {}
    for p, c, meshes in items:
        q = quadrant(c)
        name = f"Wheel_{q}"
        # avoid overwrite: keep first
        if name in mapping:
            # merge meshes
            mapping[name][2].extend([m for m in meshes if m not in mapping[name][2]])
        else:
            mapping[name] = (p, c, list(meshes))
        print("MAP", name, p.name if hasattr(p, "name") else p, tuple(round(x, 3) for x in c))

    # Create root empty
    root = bpy.data.objects.new(root_name, None)
    bpy.context.collection.objects.link(root)

    wheel_meshes = {m for _, _, ms in mapping.values() for m in ms}
    for o in list(bpy.data.objects):
        if o == root:
            continue
        if o in wheel_meshes:
            continue
        if o.name.startswith("Wheel_"):
            continue
        if o.parent is None:
            o.parent = root

    for wname, (p, c, meshes) in mapping.items():
        if wname not in ("Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR"):
            continue
        pivot = bpy.data.objects.new(wname, None)
        bpy.context.collection.objects.link(pivot)
        pivot.empty_display_type = "SPHERE"
        pivot.empty_display_size = 0.1
        pivot.location = c.copy()
        pivot.parent = root
        for m in meshes:
            mw = m.matrix_world.copy()
            m.parent = pivot
            m.matrix_world = mw

    bpy.context.view_layer.update()

    meshes_all = [o for o in bpy.data.objects if o.type == "MESH"]
    mn, mx = world_bbox(meshes_all)
    size = mx - mn
    length = max(size.x, size.y)
    if length > 0.1:
        s = target_length / length
        root.scale = (s, s, s)
        bpy.context.view_layer.update()

    mn, mx = world_bbox(meshes_all)
    root.location.z -= mn.z
    root.location.x -= (mn.x + mx.x) * 0.5
    root.location.y -= (mn.y + mx.y) * 0.5
    bpy.context.view_layer.update()

    # Face -Y so glTF Y-up export maps forward to +Z
    root.rotation_euler = Euler((0.0, 0.0, 3.141592653589793), "XYZ")
    bpy.context.view_layer.update()

    mn, mx = world_bbox(meshes_all)
    root.location.z -= mn.z
    root.location.x -= (mn.x + mx.x) * 0.5
    root.location.y -= (mn.y + mx.y) * 0.5
    bpy.context.view_layer.update()
    mn, mx = world_bbox(meshes_all)
    print("FINAL_BBOX", tuple(mn), tuple(mx), "size", tuple(mx - mn))

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
    print("PIVOTS", [o.name for o in bpy.data.objects if o.name in ("Wheel_FL", "Wheel_FR", "Wheel_RL", "Wheel_RR")])


if __name__ == "__main__":
    prep_and_export(
        r"C:\Users\user\OneDrive\Desktop\stydy\neon-city-racer\public\models\hero_car.glb",
        4.5,
        "HeroCar",
    )
