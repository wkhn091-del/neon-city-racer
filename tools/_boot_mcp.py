import bpy
import addon_utils
import time

print("=== MCP BOOT ===")
print("addons path:", bpy.utils.user_resource("SCRIPTS", path="addons"))

# Enable by module filename stem
ok = False
for mod in ("blender_mcp",):
    try:
        bpy.ops.preferences.addon_enable(module=mod)
        print("enabled via prefs:", mod)
        ok = True
    except Exception as e:
        print("prefs enable failed:", mod, e)
    try:
        addon_utils.enable(mod, default_set=True, persistent=True)
        print("enabled via addon_utils:", mod)
        ok = True
    except Exception as e:
        print("addon_utils failed:", mod, e)

# Persist prefs
try:
    bpy.ops.wm.save_userpref()
    print("saved userpref")
except Exception as e:
    print("save_userpref failed", e)

# Start server after deps loaded
def _start():
    try:
        scene = bpy.context.scene
        scene.blendermcp_port = 9876
        scene.blendermcp_auto_start_server = True
        scene.blendermcp_use_polyhaven = True
        bpy.ops.blendermcp.start_server()
        print("SERVER_STARTED", getattr(scene, "blendermcp_server_running", None))
    except Exception as e:
        print("SERVER_START_FAIL", e)
    return None

bpy.app.timers.register(_start, first_interval=1.0)
print("=== MCP BOOT DONE ===")
