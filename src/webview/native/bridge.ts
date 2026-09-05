import type {
  AppSettings,
  BrowserAuthInfo,
  ClientUpdateInfo,
  Friend,
  ElyLoginInput,
  GameContentSummary,
  InstallProgress,
  InstalledMod,
  JavaInfo,
  LaunchStatus,
  LittleSkinLoginInput,
  MinecraftAppearance,
  MinecraftProfile,
  ModInstallResult,
  ModProject,
  ModSearchResult,
  ModVersionFile,
  MsAuthStatus,
  PersistShape,
  SkinModel,
  StoredAccount,
} from "@shared/types";

type EventCallback = (payload: unknown) => void;
type BridgeResponse = {
  id?: number;
  event?: string;
  ok?: boolean;
  result?: unknown;
  error?: string;
  payload?: unknown;
};

interface WebViewTransport {
  postMessage(message: unknown): void;
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<BridgeResponse>) => void,
  ): void;
}

declare global {
  interface Window {
    chrome?: { webview?: WebViewTransport };
    vela: VelaApi;
  }
}

const pending = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (reason: Error) => void }
>();
const listeners = new Map<string, Set<EventCallback>>();
let sequence = 0;

function transport(): WebViewTransport {
  const value = window.chrome?.webview;
  if (!value) {
    throw new Error("Vela native bridge недоступен. Запустите интерфейс через Vela Launcher.");
  }
  return value;
}

function invoke<T>(method: string, ...args: unknown[]): Promise<T> {
  const id = ++sequence;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: (value) => resolve(value as T),
      reject,
    });
    try {
      transport().postMessage({ id, method, args });
    } catch (error) {
      pending.delete(id);
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function subscribe<T>(event: string, callback: (payload: T) => void): () => void {
  const group = listeners.get(event) ?? new Set<EventCallback>();
  const wrapped: EventCallback = (payload) => callback(payload as T);
  group.add(wrapped);
  listeners.set(event, group);
  return () => group.delete(wrapped);
}

window.chrome?.webview?.addEventListener("message", (event) => {
  const message = event.data;
  if (message.event) {
    listeners.get(message.event)?.forEach((callback) => callback(message.payload));
    return;
  }
  if (typeof message.id !== "number") return;
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  if (message.ok) request.resolve(message.result);
  else request.reject(new Error(message.error || "Неизвестная ошибка Vela Launcher"));
});

export const velaApi = {
  app: {
    getVersion: () => invoke<string>("app.getVersion"),
    openExternal: (url: string) => invoke<void>("app.openExternal", url),
    pickFolder: () => invoke<string | null>("app.pickFolder"),
    pickImage: () => invoke<string | null>("app.pickImage"),
    pickMedia: () => invoke<string | null>("app.pickMedia"),
    pickGallery: () => invoke<string[]>("app.pickGallery"),
    readImage: (path: string) => invoke<string>("app.readImage", path),
    importJson: <T = unknown>() => invoke<T | null>("app.importJson"),
    exportJson: (suggestedName: string, value: unknown) => invoke<boolean>("app.exportJson", suggestedName, value),
    systemMemory: () =>
      invoke<{ totalMb: number; freeMb: number }>("app.systemMemory"),
    screenshots: () => invoke<string[]>("app.screenshots"),
    contentSummary: () => invoke<GameContentSummary>("app.contentSummary"),
  },
  window: {
    drag: () => void invoke<void>("window.drag"),
    minimize: () => void invoke<void>("window.minimize"),
    maximize: () => void invoke<void>("window.maximize"),
    close: () => void invoke<void>("window.close"),
    isMaximized: () => invoke<boolean>("window.isMaximized"),
  },
  state: {
    get: () => invoke<PersistShape>("state.get"),
    saveSettings: (settings: AppSettings) =>
      invoke<PersistShape>("state.saveSettings", settings),
    saveAccounts: (accounts: StoredAccount[], activeId: string | null) =>
      invoke<PersistShape>("state.saveAccounts", accounts, activeId),
    saveFriends: (friends: Friend[]) =>
      invoke<PersistShape>("state.saveFriends", friends),
  },
  friends: {
    resolve: (username: string) =>
      invoke<MinecraftProfile>("friends.resolve", username),
  },
  auth: {
    msStart: () => invoke<BrowserAuthInfo>("auth.msStart"),
    msCancel: () => invoke<void>("auth.msCancel"),
    msRefresh: (account: StoredAccount) =>
      invoke<StoredAccount>("auth.msRefresh", account),
    createOffline: (username: string) =>
      invoke<StoredAccount>("auth.offlineCreate", username),
    elyLogin: (input: ElyLoginInput) =>
      invoke<StoredAccount>("auth.elyLogin", input),
    elyRefresh: (account: StoredAccount) =>
      invoke<StoredAccount>("auth.elyRefresh", account),
    littleSkinLogin: (input: LittleSkinLoginInput) =>
      invoke<StoredAccount>("auth.littleSkinLogin", input),
    littleSkinRefresh: (account: StoredAccount) =>
      invoke<StoredAccount>("auth.littleSkinRefresh", account),
    onStatus: (callback: (status: MsAuthStatus) => void) =>
      subscribe("auth.status", callback),
  },
  appearance: {
    get: (account: StoredAccount) =>
      invoke<MinecraftAppearance>("appearance.get", account),
    pickSkin: () => invoke<string | null>("appearance.pickSkin"),
    exportSkin: (dataUrl: string) =>
      invoke<boolean>("appearance.exportSkin", dataUrl),
    uploadSkin: (account: StoredAccount, dataUrl: string, model: SkinModel) =>
      invoke<MinecraftAppearance>("appearance.uploadSkin", account, dataUrl, model),
    resetSkin: (account: StoredAccount) =>
      invoke<MinecraftAppearance>("appearance.resetSkin", account),
    showCape: (account: StoredAccount, capeId: string) =>
      invoke<MinecraftAppearance>("appearance.showCape", account, capeId),
    hideCape: (account: StoredAccount) =>
      invoke<MinecraftAppearance>("appearance.hideCape", account),
  },
  java: {
    detect: (preferred?: string | null) =>
      invoke<JavaInfo | null>("java.detect", preferred),
    install: () => invoke<JavaInfo>("java.install"),
    onProgress: (callback: (progress: InstallProgress) => void) =>
      subscribe("java.progress", callback),
  },
  game: {
    install: () => invoke<void>("game.install"),
    pause: () => invoke<boolean>("game.pause"),
    resume: () => invoke<boolean>("game.resume"),
    cancel: () => invoke<boolean>("game.cancel"),
    checkUpdate: () => invoke<ClientUpdateInfo>("game.checkUpdate"),
    launch: (account: StoredAccount) => invoke<void>("game.launch", account),
    onProgress: (callback: (progress: InstallProgress) => void) =>
      subscribe("game.progress", callback),
    onLaunchStatus: (callback: (status: LaunchStatus) => void) =>
      subscribe("game.launchStatus", callback),
  },
  discord: {
    activity: (details: string, state?: string) =>
      invoke<void>("discord.activity", { details, state }),
  },
  mods: {
    search: (query: string, category: string, sort: string, offset: number) =>
      invoke<ModSearchResult>("mods.search", query, category, sort, offset),
    project: (projectId: string) =>
      invoke<ModProject>("mods.project", projectId),
    versions: (projectId: string) =>
      invoke<ModVersionFile[]>("mods.versions", projectId),
    installProject: (projectId: string, title: string) =>
      invoke<ModInstallResult>("mods.installProject", projectId, title),
    install: (
      version: ModVersionFile,
      meta?: { projectId: string; title: string },
    ) => invoke<InstalledMod>("mods.install", version, meta),
    installedList: () => invoke<InstalledMod[]>("mods.installedList"),
    toggle: (filename: string, enabled: boolean) =>
      invoke<void>("mods.toggle", filename, enabled),
    remove: (filename: string) => invoke<void>("mods.remove", filename),
    onProgress: (
      callback: (progress: {
        filename: string;
        progress: number;
        done: boolean;
        error?: string;
      }) => void,
    ) => subscribe("mods.progress", callback),
  },
};

export type VelaApi = typeof velaApi;
window.vela = velaApi;

export {};
