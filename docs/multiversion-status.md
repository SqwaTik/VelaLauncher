# Vela on every version and loader (launcher)

Branch `port/multiversion`. Vela client stays 0.2.1.

## What the launcher does now

- `src/shared/targets.ts` lists the 10 supported stacks: Minecraft 26.3, 26.2, 1.21.11, 1.21.5 and 1.21.4, each on Fabric and NeoForge. Each stack has its loader version, Java major and the Vela build file.
- Every instance stores `minecraftVersion` and `loader`. Instances without a stack, or with one Vela is not built for, fall back to 26.2 Fabric.
- Install and launch (`game.ts`) work per instance:
  - The matching Java is found or installed: 25 for 26.x, 21 for 1.21.x.
  - The Fabric profile is created, or NeoForge is installed with `@xmcl/installer` `installNeoForgedTask`.
  - The bundled Vela build for that stack is put in place.
- How Vela loads (`client-runtime.ts`, `bundled-client.ts`):
  - On Fabric, Vela loads from `.vela-runtime/vela-client.jar` via `-Dfabric.addMods`, as before.
  - On NeoForge it loads from `mods/vela-client-0.2.1-managed.jar`. The mods screen hides that file.
  - Switching an instance's folder between loaders moves the other copy to `mod-backups`.
- Modrinth search, the version picker, installed-mod checks and modpack import/export use the instance's version and loader. An MRPACK for a stack Vela is not built for is refused with a clear message.
- UI:
  - The create-instance dialog has loader cards (Fabric / NeoForge) and version cards grouped into current and classic 1.21. Each card shows its Java, and a summary line sits under them.
  - The instance list shows `version · loader` with the loader logo.
  - The edit dialog shows the instance's stack and the Java it needs.
  - Home, Mods, Settings and onboarding show the selected instance's version, loader and Java instead of a fixed 26.2 / Fabric / Java 25.
- The bundled builds live in `build/clients/vela-client-<mc>-<loader>.jar` and ship as `resources/clients`. The single `build/vela-client.jar` is gone.

## Checks

- `npm run typecheck`
- `npx tsc --noEmit -p tsconfig.node.json --composite false`
- `node scripts/verify-runtime.mjs`: 15/15. It includes a check that every stack's bundle installs and verifies, and a Fabric/NeoForge switch check.
- `npm run build`

## Not verified yet

- A real NeoForge install and launch through the launcher UI. It needs network and a clean instance.
- A real 1.21.x Fabric launch through the launcher with Java 21.
