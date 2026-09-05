import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import { IPC } from "../shared/constants";
import type {
  AppSettings,
  StoredAccount,
  PersistShape,
  JavaInfo,
  ModSearchResult,
  ModVersionFile,
  InstalledMod,
  InstallProgress,
  LaunchStatus,
  Friend,
  MinecraftProfile,
  BrowserAuthInfo,
  MsAuthStatus,
  MinecraftAppearance,
  SkinModel,
  ModInstallResult,
  ModProject,
  ClientUpdateInfo,
  GameContentSummary,
  ElyLoginInput,
  LittleSkinLoginInput,
} from "../shared/types";

/** Subscribe helper: returns an unsubscribe fn so callers can clean up. */
function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, payload: T): void => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

const api = {
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.appGetVersion),
    openExternal: (url: string): Promise<void> =>
      ipcRenderer.invoke(IPC.openExternal, url),
    pickFolder: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.pickFolder),
    pickImage: (): Promise<string | null> => ipcRenderer.invoke(IPC.pickImage),
    pickMedia: (): Promise<string | null> => ipcRenderer.invoke(IPC.pickMedia),
    pickGallery: (): Promise<string[]> => ipcRenderer.invoke(IPC.pickGallery),
    readImage: (path: string): Promise<string> =>
      ipcRenderer.invoke(IPC.readImage, path),
    systemMemory: (): Promise<{ totalMb: number; freeMb: number }> =>
      ipcRenderer.invoke(IPC.systemMemory),
    screenshots: (): Promise<string[]> =>
      ipcRenderer.invoke(IPC.screenshotsList),
    contentSummary: (): Promise<GameContentSummary> =>
      ipcRenderer.invoke(IPC.gameContentSummary),
  },
  window: {
    minimize: (): void => ipcRenderer.send(IPC.windowMinimize),
    maximize: (): void => ipcRenderer.send(IPC.windowMaximize),
    close: (): void => ipcRenderer.send(IPC.windowClose),
    isMaximized: (): Promise<boolean> =>
      ipcRenderer.invoke(IPC.windowIsMaximized),
  },
  state: {
    get: (): Promise<PersistShape> => ipcRenderer.invoke(IPC.stateGet),
    saveSettings: (settings: AppSettings): Promise<PersistShape> =>
      ipcRenderer.invoke(IPC.settingsSave, settings),
    saveAccounts: (
      accounts: StoredAccount[],
      activeId: string | null,
    ): Promise<PersistShape> =>
      ipcRenderer.invoke(IPC.accountsSave, accounts, activeId),
    saveFriends: (friends: Friend[]): Promise<PersistShape> =>
      ipcRenderer.invoke(IPC.friendsSave, friends),
  },
  friends: {
    resolve: (username: string): Promise<MinecraftProfile> =>
      ipcRenderer.invoke(IPC.friendResolve, username),
  },
  auth: {
    msStart: (): Promise<BrowserAuthInfo> =>
      ipcRenderer.invoke(IPC.authMsStart),
    msCancel: (): Promise<void> => ipcRenderer.invoke(IPC.authMsCancel),
    msRefresh: (account: StoredAccount): Promise<StoredAccount> =>
      ipcRenderer.invoke(IPC.authMsRefresh, account),
    elyLogin: (input: ElyLoginInput): Promise<StoredAccount> =>
      ipcRenderer.invoke(IPC.authElyLogin, input),
    elyRefresh: (account: StoredAccount): Promise<StoredAccount> =>
      ipcRenderer.invoke(IPC.authElyRefresh, account),
    littleSkinLogin: (input: LittleSkinLoginInput): Promise<StoredAccount> =>
      ipcRenderer.invoke(IPC.authLittleSkinLogin, input),
    littleSkinRefresh: (account: StoredAccount): Promise<StoredAccount> =>
      ipcRenderer.invoke(IPC.authLittleSkinRefresh, account),
    onStatus: (cb: (s: MsAuthStatus) => void): (() => void) =>
      on(IPC.authMsStatus, cb),
  },
  appearance: {
    get: (account: StoredAccount): Promise<MinecraftAppearance> =>
      ipcRenderer.invoke(IPC.appearanceGet, account),
    pickSkin: (): Promise<string | null> =>
      ipcRenderer.invoke(IPC.appearancePickSkin),
    exportSkin: (dataUrl: string): Promise<boolean> =>
      ipcRenderer.invoke(IPC.appearanceExportSkin, dataUrl),
    uploadSkin: (
      account: StoredAccount,
      dataUrl: string,
      model: SkinModel,
    ): Promise<MinecraftAppearance> =>
      ipcRenderer.invoke(IPC.appearanceUploadSkin, account, dataUrl, model),
    resetSkin: (account: StoredAccount): Promise<MinecraftAppearance> =>
      ipcRenderer.invoke(IPC.appearanceResetSkin, account),
    showCape: (
      account: StoredAccount,
      capeId: string,
    ): Promise<MinecraftAppearance> =>
      ipcRenderer.invoke(IPC.appearanceShowCape, account, capeId),
    hideCape: (account: StoredAccount): Promise<MinecraftAppearance> =>
      ipcRenderer.invoke(IPC.appearanceHideCape, account),
  },
  java: {
    detect: (preferred?: string | null): Promise<JavaInfo | null> =>
      ipcRenderer.invoke(IPC.javaDetect, preferred),
    install: (): Promise<JavaInfo> => ipcRenderer.invoke(IPC.javaInstall),
    onProgress: (cb: (p: InstallProgress) => void): (() => void) =>
      on(IPC.javaProgress, cb),
  },
  game: {
    install: (): Promise<void> => ipcRenderer.invoke(IPC.gameInstall),
    pause: (): Promise<boolean> => ipcRenderer.invoke(IPC.gamePause),
    resume: (): Promise<boolean> => ipcRenderer.invoke(IPC.gameResume),
    cancel: (): Promise<boolean> => ipcRenderer.invoke(IPC.gameCancel),
    checkUpdate: (): Promise<ClientUpdateInfo> =>
      ipcRenderer.invoke(IPC.gameCheckUpdate),
    launch: (account: StoredAccount): Promise<void> =>
      ipcRenderer.invoke(IPC.gameLaunch, account),
    onProgress: (cb: (p: InstallProgress) => void): (() => void) =>
      on(IPC.gameProgress, cb),
    onLaunchStatus: (cb: (s: LaunchStatus) => void): (() => void) =>
      on(IPC.gameLaunchStatus, cb),
  },
  discord: {
    activity: (details: string, state?: string): Promise<void> =>
      ipcRenderer.invoke(IPC.discordActivity, { details, state }),
  },
  mods: {
    search: (
      query: string,
      category: string,
      sort: string,
      offset: number,
    ): Promise<ModSearchResult> =>
      ipcRenderer.invoke(IPC.modSearch, query, category, sort, offset),
    project: (projectId: string): Promise<ModProject> =>
      ipcRenderer.invoke(IPC.modProject, projectId),
    versions: (projectId: string): Promise<ModVersionFile[]> =>
      ipcRenderer.invoke(IPC.modVersions, projectId),
    installProject: (
      projectId: string,
      title: string,
    ): Promise<ModInstallResult> =>
      ipcRenderer.invoke(IPC.modInstallProject, projectId, title),
    install: (
      version: ModVersionFile,
      meta?: { projectId: string; title: string },
    ): Promise<InstalledMod> =>
      ipcRenderer.invoke(IPC.modInstall, version, meta),
    installedList: (): Promise<InstalledMod[]> =>
      ipcRenderer.invoke(IPC.modInstalledList),
    toggle: (filename: string, enabled: boolean): Promise<void> =>
      ipcRenderer.invoke(IPC.modToggle, filename, enabled),
    remove: (filename: string): Promise<void> =>
      ipcRenderer.invoke(IPC.modRemove, filename),
    onProgress: (
      cb: (p: {
        filename: string;
        progress: number;
        done: boolean;
        error?: string;
      }) => void,
    ): (() => void) => on(IPC.modProgress, cb),
  },
};

export type RoyaleApi = typeof api;

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld("royale", api);
} else {
  // @ts-ignore fallback when context isolation is disabled
  window.royale = api;
}
