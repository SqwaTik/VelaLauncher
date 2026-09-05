/** Shared types crossing the IPC boundary (main <-> renderer). */

export type AccountType = "microsoft" | "offline" | "ely" | "littleskin";
export type SkinModel = "classic" | "slim";

export interface CustomCape {
  id: string;
  name: string;
  dataUrl: string;
  createdAt: number;
}

export interface StoredAccount {
  id: string;
  username: string;
  uuid: string;
  type: AccountType;
  skinModel: SkinModel;
  /** Locally edited PNG used by the launcher preview and Vela Client. */
  skinDataUrl?: string;
  /** Cached 2D head composed from the local skin for launcher avatars. */
  skinHeadDataUrl?: string;
  /** Local cape wardrobe used by the launcher preview and Vela Client. */
  customCapes?: CustomCape[];
  activeCustomCapeId?: string | null;
  capeHidden?: boolean;
  activeProviderCapeId?: string | null;
  providerCapeDataUrl?: string;
  /** MS access token, if any (never rendered). */
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  /** Ely.by Yggdrasil client token used for token refresh. */
  clientToken?: string;
}

/** A locally-saved friend (add-by-username; avatar rendered from the UUID). */
export interface Friend {
  id: string;
  username: string;
  uuid: string;
  addedAt: number;
}

export type InstanceSource = "default" | "created" | "imported";

export interface InstanceSharedFolders {
  worlds: boolean;
  resourcePacks: boolean;
  shaderPacks: boolean;
}

/** A separate Minecraft workspace shown as a round item in the launcher rail. */
export interface GameInstance {
  id: string;
  name: string;
  minecraftVersion: string;
  /** Empty only for the original Vela workspace at storagePath root. */
  directory: string;
  source: InstanceSource;
  iconDataUrl?: string | null;
  /** Optional per-instance Java executable. Null means automatic detection. */
  javaPath?: string | null;
  pinned: boolean;
  createdAt: number;
  sharedFolders: InstanceSharedFolders;
}

/** Canonical Minecraft profile returned by Mojang's public profile API. */
export interface MinecraftProfile {
  username: string;
  uuid: string;
}

export interface MinecraftSkin {
  id: string;
  state: "ACTIVE" | "INACTIVE";
  url: string;
  variant: "SLIM" | "CLASSIC";
}

export interface MinecraftCape {
  id: string;
  state: "ACTIVE" | "INACTIVE";
  url: string;
  alias: string;
}

export interface MinecraftAppearance {
  skinDataUrl: string | null;
  skins: MinecraftSkin[];
  capes: MinecraftCape[];
}

export interface AppSettings {
  language: "ru" | "en" | "es";
  storagePath: string;
  telemetry: boolean;
  gpuDedicated: boolean;
  gpuProfile: "auto" | "performance" | "power";
  discordRpc: boolean;
  devMode: boolean;
  streamerMode: boolean;
  quickLaunch: boolean;
  preLaunchCommand: string;
  minecraftArgs: string;
  /** One KEY=value pair per line. */
  environmentVariables: string;
  authlibInjector: boolean;
  elyAuthlib: boolean;
  replaceNativeLibraries: "never" | "old-only" | "always";
  autoInstallJava: boolean;
  onboardingCompleted: boolean;
  memoryAuto: boolean;
  memoryMode: "auto" | "manual" | "system";
  memoryMinMb: number;
  memoryMb: number;
  jvmArgs: string;
  closeOnLaunch: boolean;
  showLog: boolean;
  javaPath: string | null;
  /** Optional image selected by the user for launcher pages. */
  backgroundImagePath: string | null;
  /** Image/GIF/video used as the launcher background. */
  backgroundMediaPath: string | null;
  /** Crop to fill the window or preserve the whole media frame. */
  backgroundFit: "cover" | "contain";
  /** Optional local screenshots shown in the home carousel. */
  galleryImagePaths: string[];
  confirmAccountDelete: boolean;
  confirmModDelete: boolean;
}

export interface LauncherStats {
  playtimeMinutes: number;
  lastPlayed: number | null;
  installed: boolean;
  /** Git commit from which the installed Vela client jar was produced. */
  installedCommitSha?: string | null;
  installedClientVersion?: string | null;
  lastUpdateCheck?: number | null;
}

export interface PersistShape {
  settings: AppSettings;
  accounts: StoredAccount[];
  activeAccountId: string | null;
  instances: GameInstance[];
  activeInstanceId: string;
  friends: Friend[];
  stats: LauncherStats;
}

/** Install/launch progress events streamed to the renderer. */
export type InstallPhase =
  | "idle"
  | "java"
  | "metadata"
  | "libraries"
  | "assets"
  | "fabric"
  | "client"
  | "royale"
  | "build"
  | "paused"
  | "verify"
  | "done"
  | "error";

export interface InstallProgress {
  phase: InstallPhase;
  /** 0..1 overall */
  progress: number;
  message: string;
  detail?: string;
  downloadedBytes?: number;
  totalBytes?: number;
  bytesPerSecond?: number;
  canPause?: boolean;
}

export interface ClientUpdateInfo {
  checkedAt: number;
  available: boolean;
  installed: boolean;
  localCommitSha: string | null;
  remoteCommitSha: string | null;
  remoteVersion: string | null;
  commitMessage: string | null;
  commitDate: string | null;
  /** Release jar when available, otherwise the launcher builds the public source commit. */
  delivery: "release" | "source-build" | null;
}

export interface LauncherUpdateInfo {
  currentVersion: string;
  latestVersion: string;
  available: boolean;
  releaseUrl: string;
  downloadUrl: string | null;
  publishedAt: string | null;
}

export interface LauncherUpdateProgress {
  phase: "downloading" | "installing" | "error";
  progress: number;
  downloadedBytes: number;
  totalBytes: number;
  message: string;
}

export interface GameContentSummary {
  mods: number;
  resourcePacks: number;
  shaderPacks: number;
  worlds: number;
  screenshots: number;
  worldItems: GameContentItem[];
}

export interface GameContentItem {
  name: string;
  iconDataUrl?: string | null;
}

export interface ElyLoginInput {
  username: string;
  password: string;
  totp?: string;
}

export interface LittleSkinLoginInput {
  username: string;
  password: string;
}

export interface LaunchStatus {
  state: "launching" | "running" | "exited" | "error" | "crashed";
  message?: string;
  code?: number;
  runningCount?: number;
  preparing?: boolean;
  crashReport?: string;
  crashReportLocation?: string;
}

export interface JavaInfo {
  path: string;
  version: string;
  majorVersion: number;
  valid: boolean;
}

export interface SystemMemoryInfo {
  totalMb: number;
  freeMb: number;
}

/* ---------- Modrinth ---------- */

export interface ModProject {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  body?: string;
  author: string;
  downloads: number;
  follows: number;
  categories: string[];
  icon_url: string | null;
  gallery: string[];
  project_type: string;
}

export interface ModSearchResult {
  hits: ModProject[];
  total_hits: number;
  offset: number;
}

export interface ModVersionFile {
  version_id: string;
  name: string;
  version_number: string;
  downloads: number;
  date_published: string;
  filename: string;
  url: string;
  size: number;
  sha1: string;
  sha512?: string;
  dependencies: ModDependency[];
}

export type ModDependencyType =
  "required" | "optional" | "incompatible" | "embedded";

export interface ModDependency {
  versionId: string | null;
  projectId: string | null;
  fileName: string | null;
  type: ModDependencyType;
}

export interface InstalledMod {
  filename: string;
  size: number;
  enabled: boolean;
  sha1?: string;
  expectedSize?: number;
  validatedMtimeMs?: number;
  projectId?: string;
  title?: string;
  versionNumber?: string;
  versionId?: string;
  slug?: string;
  description?: string;
  body?: string;
  iconUrl?: string | null;
  gallery?: string[];
  updateAvailable?: boolean;
  latestVersionNumber?: string;
}

export interface InstalledResourcePack extends InstalledMod {}

export interface InstalledShaderPack extends InstalledMod {}

export interface ModInstallResult {
  root: InstalledMod;
  installed: InstalledMod[];
  dependencyTitles: string[];
}

export interface ModpackProgress {
  phase: "reading" | "downloading" | "copying" | "packing" | "done";
  progress: number;
  message: string;
  detail?: string;
}

export interface ModpackResult {
  path: string;
  name: string;
  instanceId?: string;
  mods: number;
  resourcePacks: number;
  shaderPacks: number;
  files: number;
}
