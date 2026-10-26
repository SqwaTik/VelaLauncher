# Frame generation integration audit — 2026-09-18

## Current state

Vela targets Minecraft 26.2 / Fabric. Minecraft owns graphics backend selection and Vulkan-to-OpenGL fallback. The launcher initializes Vulkan only when there is no explicit recognized preference; existing OpenGL/Vulkan preferences are preserved. The most recent inspected game log reports Vulkan on an RTX 3050 Laptop GPU, driver 610.88.

No frame generation bridge is currently implemented or bundled. The new launcher probe observes the current child process's backend/device announcements, handles split output and fallback, and logs why FG remains inactive. GPU family classification indicates only a candidate, not runtime support. It does not load DLLs, change drivers, change the selected renderer, or promise performance gains.

## Upstream evidence

- DLSSG SM86: https://github.com/sdli1995/dlssg_for_sm86/blob/main/README.en.md — experimental RTX 20/30 support, Windows x64/D3D12; Vulkan is on its roadmap. Not a standalone Minecraft integration.
- MC-DLSSFG: https://github.com/Tunanodra/MC-DLSSFG — Forge 1.20.1, native bridge and Windows/NVIDIA FG. Requires a port, not direct installation into Fabric 26.2.
- MC DLSS Prototype: https://github.com/CAN230921/mc-dlss-prototype — experimental 1.21.1 GL/D3D12 interop, Iris/Sodium targets; same-window presentation remains experimental.
- Oslo-Render: https://www.curseforge.com/minecraft/mc-mods/oslo-render — publisher advertises Fabric 26.2 Vulkan, DLSS/FSR FG and native-resolution HUD. Publisher states RTX 40 for DLSS FG, plus a separate FSR path. Compatibility with Vela/RTX 3050 is unverified; no binaries have been executed or redistributed. All Rights Reserved license requires separate redistribution review.

## Integration gates

1. Build a native bridge for the exact Minecraft backend/version. Vulkan and OpenGL require distinct resource-sharing and synchronization paths.
2. Obtain capability results from the active GPU/native runtime, not a GPU-name allowlist or cached log. Verify the physical device used by both sides matches on hybrid laptops.
3. Capture color, depth, motion vectors and frame timing. Keep HUD/menus/cursor separate from generated world frames. Preserve native output resolution unless the user opts into upscaling.
4. Reset frame history after resize, backend change, world/dimension change, teleport and resource reload. Never reuse previous-world resources.
5. Fall back to ordinary rendering on initialization failure/device loss. Experimental failure must not persistently break the normal launch profile.
6. Validate HUD, markers, account menus, transparency, resource packs, AutoClicker and Render Tweaks on both backends. FG must not multiply ticks or synthetic input.
7. Measure base FPS, presented FPS, frame time, latency and VRAM independently. Enable an automatic policy only after repeatable in-game validation.

## Pending

### Binary inspection — 2026-09-19

The Oslo file `oslo-render-0.1.0-complet.jar` (CurseForge file 8785469) was downloaded to an audit directory and inspected without execution. Its Fabric metadata identifies `projectomega`. `OmegaCompositor.compose` requires both `replaceMinecraftTerrain` and native device sharing; it is not an independent frame-generation stage for Vela's existing terrain renderer. The bundled configuration defaults `frameGeneration` to false. The archive includes a native path-tracing renderer and NVIDIA/Streamline DLLs. Installing it would replace rendering behavior and still would not establish working FG on the current GPU. No such renderer replacement has been installed.

Far has since been integrated separately using Bobby 5.2.15 for Minecraft 26.2. This does not resolve the FG integration gates above.

Native bridge implementation, live capability query, resource interop, presentation, rollback and in-game benchmarking are not complete. FG changes are diagnostic infrastructure only. On 2026-09-19 the installed client was launched to its main menu and a vanilla resource reload completed successfully. This is a startup smoke test, not an FG or crowded-world performance benchmark.
