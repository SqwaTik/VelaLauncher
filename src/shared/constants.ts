/**
 * Shared constants — single source of truth for both main and renderer.
 * Version data mirrors the Royale Master client repo (gradle.properties / fabric.mod.json).
 */

export const BRAND = {
  name: "VELA",
  fullName: "Vela",
  tagline: "Клиент для Minecraft",
  repo: "https://github.com/SqwaTik/Royale-Master",
} as const;

/** Public Discord application ID. Rich Presence never needs a client secret. */
export const DISCORD_APP_ID = "1144713648120549536";

/** Target game + loader versions the launcher installs. */
export const GAME = {
  /** Minecraft version the Royale client is built for. */
  minecraftVersion: "1.21.11",
  yarnMappings: "1.21.11+build.4",
  fabricLoader: "0.18.4",
  fabricApi: "0.141.5+1.21.11",
  javaMajor: 21,
  /** Royale client mod version. */
  clientVersion: "1.0.13",
  loader: "fabric" as const,
} as const;

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
