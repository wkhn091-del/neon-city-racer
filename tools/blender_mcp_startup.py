"""Launch helper: enable MCP for Blender and start the socket server on port 9876."""
import addon_utils
import bpy


def _enable_mcp():
    # Prefer installed module name from mcp-for-blender install-addon
    for module_name in ("blender_mcp", "blender-mcp", "mcp_for_blender"):
        try:
            addon_utils.enable(module_name, default_set=True, persistent=True)
            print(f"[neon-city-racer] Enabled addon module: {module_name}")
            return True
        except Exception as exc:  # noqa: BLE001
            print(f"[neon-city-racer] Could not enable {module_name}: {exc}")
    return False


def _start_server():
    scene = bpy.context.scene
    if hasattr(scene, "blendermcp_port"):
        scene.blendermcp_port = 9876
    if hasattr(scene, "blendermcp_auto_start_server"):
        scene.blendermcp_auto_start_server = True
    if hasattr(scene, "blendermcp_use_polyhaven"):
        scene.blendermcp_use_polyhaven = True
    try:
        bpy.ops.blendermcp.start_server()
        print("[neon-city-racer] MCP server start operator invoked (port 9876)")
    except Exception as exc:  # noqa: BLE001
        print(f"[neon-city-racer] start_server operator failed (auto-start may still work): {exc}")


_enable_mcp()
_start_server()
print("[neon-city-racer] Blender MCP startup script complete")
