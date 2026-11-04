/**
 * Shared constants — single source of truth for both main and renderer.
 * Supported game stack shared by installation, instances and the renderer.
 */

export const BRAND = {
  name: "VELA",
  fullName: "Vela",
  tagline: "Клиент для Minecraft",
  repo: "https://github.com/SqwaTik/VelaLauncher",
} as const;

/** Public Discord application ID. Rich Presence never needs a client secret. */
export const DISCORD_APP_ID = "1144713648120549536";

import { CLIENT_VERSION, DEFAULT_TARGET, TARGET_VERSIONS, type GameTarget } from "./targets";

/**
 * The default game stack (the first Vela instance and anything without a version of its own). Each instance picks
 * its own version and loader from TARGETS in ./targets.
 */
export const GAME = {
  minecraftVersion: DEFAULT_TARGET.minecraftVersion,
  supportedMinecraftVersions: TARGET_VERSIONS,
  fabricLoader: DEFAULT_TARGET.loaderVersion,
  fabricApi: DEFAULT_TARGET.fabricApi,
  javaMajor: DEFAULT_TARGET.javaMajor,
  clientVersion: CLIENT_VERSION,
  loader: DEFAULT_TARGET.loader,
} as const;

/**
 * Mods compiled into the Vela client. The loader sees them as part of Vela, so a second copy in the mods folder only
 * clashes with it: the launcher never installs one and disables any it finds. Which of them a build carries is
 * GameTarget.bundledMods.
 */
export const BUNDLED_MODS = [
  { id: "ias", version: "9.0.7", slugs: ["in-game-account-switcher"], title: "In-Game Account Switcher" },
  { id: "modmenu", version: "20.0.3", slugs: ["modmenu"], title: "Mod Menu" },
  { id: "bobby", version: "5.2.15", slugs: ["bobby"], title: "Bobby" },
] as const;

/** The bundled mod matching a mod id or a Modrinth slug; with a target, only the mods that build carries. */
export function bundledMod(idOrSlug: string | null | undefined, target?: GameTarget): (typeof BUNDLED_MODS)[number] | undefined {
  const key = (idOrSlug ?? "").toLowerCase();
  const mod = key ? BUNDLED_MODS.find(mod => mod.id === key || (mod.slugs as readonly string[]).includes(key)) : undefined;
  return mod && (!target || target.bundledMods.includes(mod.id)) ? mod : undefined;
}

export const IPC = {
  // window / app
  windowMinimize: "window:minimize",
  windowMaximize: "window:maximize",
  windowClose: "window:close",
  windowIsMaximized: "window:is-maximized",
  appGetVersion: "app:get-version",
  appCheckUpdate: "app:check-update",
  appInstallUpdate: "app:install-update",
  appUpdateProgress: "app:update-progress",
  openExternal: "app:open-external",
  pickFolder: "app:pick-folder",
  pickImage: "app:pick-image",
  pickJava: "app:pick-java",
  pickMedia: "app:pick-media",
  pickGallery: "app:pick-gallery",
  readImage: "app:read-image",
  systemMemory: "app:system-memory",
  screenshotsList: "app:screenshots-list",
  gameContentSummary: "app:game-content-summary",

  // persistence
  stateGet: "state:get",
  settingsSave: "settings:save",
  accountsSave: "accounts:save",
  instancesSave: "instances:save",
  instanceReveal: "instance:reveal",
  instanceDuplicate: "instance:duplicate",
  friendsSave: "friends:save",
  friendResolve: "friends:resolve",

  // java
  javaDetect: "java:detect",
  javaInstall: "java:install",
  javaProgress: "java:progress",

  authElyLogin: "auth:ely-login",
  authElyRefresh: "auth:ely-refresh",
  authLittleSkinLogin: "auth:littleskin-login",
  authLittleSkinRefresh: "auth:littleskin-refresh",
  discordActivity: "discord:activity",

  // skin / cape profile
  appearanceGet: "appearance:get",
  appearancePickSkin: "appearance:pick-skin",
  appearancePickCape: "appearance:pick-cape",
  appearanceExportSkin: "appearance:export-skin",
  appearanceUploadSkin: "appearance:upload-skin",
  appearanceResetSkin: "appearance:reset-skin",
  appearanceShowCape: "appearance:show-cape",
  appearanceHideCape: "appearance:hide-cape",

  // install / launch
  gameInstall: "game:install",
  gamePause: "game:pause",
  gameResume: "game:resume",
  gameCancel: "game:cancel",
  gameCheckUpdate: "game:check-update",
  gameLaunch: "game:launch",
  gameCancelLaunch: "game:cancel-launch",
  gameProgress: "game:progress", // main -> renderer (event)
  gameLaunchStatus: "game:launch-status", // main -> renderer (event)

  // modrinth / mods
  modSearch: "mod:search",
  modProject: "mod:project",
  modVersions: "mod:versions",
  modInstallProject: "mod:install-project",
  modInstall: "mod:install",
  modInstalledList: "mod:installed-list",
  modToggle: "mod:toggle",
  modRemove: "mod:remove",
  modReveal: "mod:reveal",
  modProgress: "mod:progress", // main -> renderer (event)

  // modrinth / resource packs
  resourceSearch: "resource:search",
  resourceProject: "resource:project",
  resourceInstallProject: "resource:install-project",
  resourceInstalledList: "resource:installed-list",
  resourceRemove: "resource:remove",
  resourceReveal: "resource:reveal",
  resourceProgress: "resource:progress",

  // modrinth / shader packs
  shaderSearch: "shader:search",
  shaderProject: "shader:project",
  shaderInstallProject: "shader:install-project",
  shaderInstalledList: "shader:installed-list",
  shaderRemove: "shader:remove",
  shaderReveal: "shader:reveal",
  shaderProgress: "shader:progress",

  // modpack import / export and OS file-open integration
  modpackImport: "modpack:import",
  modpackExport: "modpack:export",
  modpackProgress: "modpack:progress",
  modpackOpen: "modpack:open",
} as const;

export const MODRINTH_API = "https://api.modrinth.com/v2";
