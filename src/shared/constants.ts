/**
 * Shared constants — single source of truth for both main and renderer.
 * Version data mirrors Vela Client 26.2.
 */

export const BRAND = {
  name: "VELA",
  fullName: "Vela Client",
  tagline: "Чистый клиент для Minecraft",
  repo: "https://github.com/SqwaTik/Vela-Client",
} as const;

/**
 * Azure AD application (client) ID used for Microsoft/Xbox login.
 *
 * Replace the placeholder with your own Azure app registration client ID.
 * The app must be registered as a "public client" with these device-code
 * requirements enabled and the "XboxLive.signin offline_access" scopes.
 * Until a real ID is provided, MS login will fail with an honest error.
 */
export const MS_CLIENT_ID = "66e755ad-931b-4da8-ba37-7242d585a21f";

/** Public Discord application ID. Rich Presence never needs a client secret. */
export const DISCORD_APP_ID = "1144713648120549536";

/** Microsoft OAuth 2.0 endpoints for native browser auth with PKCE. */
export const MS_OAUTH = {
  authorize:
    "https://login.microsoftonline.com/consumers/oauth2/v2.0/authorize",
  token: "https://login.microsoftonline.com/consumers/oauth2/v2.0/token",
  scope: "XboxLive.signin offline_access",
} as const;

/** Target game + loader versions the launcher installs. */
export const GAME = {
  minecraftVersion: "26.2",
  yarnMappings: "26.2+build.1",
  fabricLoader: "0.19.4",
  fabricApi: "0.158.0+26.2",
  javaMajor: 25,
  clientVersion: "0.1.0",
  loader: "fabric" as const,
} as const;

export const IPC = {
  // window / app
  windowMinimize: "window:minimize",
  windowMaximize: "window:maximize",
  windowClose: "window:close",
  windowIsMaximized: "window:is-maximized",
  appGetVersion: "app:get-version",
  openExternal: "app:open-external",
  pickFolder: "app:pick-folder",
  pickImage: "app:pick-image",
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
  friendsSave: "friends:save",
  friendResolve: "friends:resolve",

  // java
  javaDetect: "java:detect",
  javaInstall: "java:install",
  javaProgress: "java:progress",

  // microsoft auth
  authMsStart: "auth:ms-start", // open system browser and start OAuth code + PKCE flow
  authMsCancel: "auth:ms-cancel", // abort an in-flight flow
  authMsRefresh: "auth:ms-refresh", // refresh a stored MS account's token
  authMsStatus: "auth:ms-status", // main -> renderer (event): polling progress
  authElyLogin: "auth:ely-login",
  authElyRefresh: "auth:ely-refresh",
  authLittleSkinLogin: "auth:littleskin-login",
  authLittleSkinRefresh: "auth:littleskin-refresh",
  discordActivity: "discord:activity",

  // skin / cape profile
  appearanceGet: "appearance:get",
  appearancePickSkin: "appearance:pick-skin",
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
  modProgress: "mod:progress", // main -> renderer (event)
} as const;

export const MODRINTH_API = "https://api.modrinth.com/v2";
