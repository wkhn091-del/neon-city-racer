"""Start Blender MCP server + enable Sketchfab / Poly Haven after load."""
import bpy


def _enable():
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0

    # Libraries
    if hasattr(scene, "blendermcp_use_polyhaven"):
        scene.blendermcp_use_polyhaven = True
    if hasattr(scene, "blendermcp_use_sketchfab"):
        scene.blendermcp_use_sketchfab = True
    # Sketchfab API key (provided by user for this project)
    key = "cc90a57278054292b04258c49c21ed66"
    for attr in ("blendermcp_sketchfab_api_key", "blendermcp_sketchfab_key"):
        if hasattr(scene, attr):
            setattr(scene, attr, key)
            print("SET_KEY", attr)
    try:
        prefs = bpy.context.preferences.addons["blender_mcp"].preferences
        prefs.sketchfab_api_key = key
        print("SET_PREFS_KEY")
    except Exception as e:
        print("PREFS_ERR", e)

    # Start MCP server
    try:
        bpy.ops.blendermcp.start_server()
        print("MCP_START_OK")
    except Exception as e:
        print("MCP_START_ERR", e)
        # Fallback: call ensure helper if exposed
        try:
            import blender_mcp as bm
            if hasattr(bm, "_blendermcp_ensure_server_running"):
                bm._blendermcp_ensure_server_running()
                print("MCP_ENSURE_CALLED")
        except Exception as e2:
            print("MCP_ENSURE_ERR", e2)

    print("POLY", getattr(scene, "blendermcp_use_polyhaven", None))
    print("SKETCHFAB", getattr(scene, "blendermcp_use_sketchfab", None))
    print("SERVER", getattr(scene, "blendermcp_server_running", None))
    return None


# Run once after Blender finishes loading UI
bpy.app.timers.register(_enable, first_interval=1.0)
print("TIMER_REGISTERED_start_mcp_and_libs")
