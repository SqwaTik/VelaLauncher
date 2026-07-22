import { app, shell, BrowserWindow, ipcMain, dialog } from "electron";
import { promises as fs } from "fs";
import { extname } from "path";
import { totalmem, freemem } from "os";
import { IPC } from "../shared/constants";
import type {
  AppSettings,
  StoredAccount,
  ModVersionFile,
  Friend,
  ElyLoginInput,
  LittleSkinLoginInput,
} from "../shared/types";
import {
  loadState,
  saveSettings,
  saveAccounts,
  saveFriends,
} from "./services/store";
import { detectJava, installJava21 } from "./services/java";
import {
  installGame,
  launchGame,
  isInstalled,
  pauseInstall,
  resumeInstall,
  cancelInstall,
  checkClientUpdate,
} from "./services/game";
import {
  startMicrosoftLogin,
  cancelMicrosoftLogin,
  refreshMicrosoft,
} from "./services/auth";
import { loginEly, refreshEly } from "./services/ely";
import { loginLittleSkin, refreshLittleSkin } from "./services/littleskin";
import { resolveMinecraftProfile } from "./services/profiles";
import * as modrinth from "./services/modrinth";
import * as appearance from "./services/appearance";
import { contentSummary, listScreenshots } from "./services/content";
import { setDiscordActivity, syncDiscordSetting } from "./services/discord";

async function readImageDataUrl(path: string): Promise<string> {
  const bytes = await fs.readFile(path);
  if (bytes.length > 20 * 1024 * 1024)
    throw new Error("Изображение слишком большое (максимум 20 МБ).");
  const mime =
    extname(path).toLowerCase() === ".jpg" ||
    extname(path).toLowerCase() === ".jpeg"
      ? "image/jpeg"
      : extname(path).toLowerCase() === ".webp"
        ? "image/webp"
        : "image/png";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

/**
 * All IPC handlers in one place. `handle` for request/response, `on` for
 * fire-and-forget. Errors thrown here surface as rejected promises in the
 * renderer, which the stores turn into user-facing messages.
 */
export function registerIpc(getWindow: () => BrowserWindow | null): void {
  // ---- window / app ----
  ipcMain.handle(IPC.appGetVersion, () => app.getVersion());
  ipcMain.on(IPC.windowMinimize, () => getWindow()?.minimize());
  ipcMain.on(IPC.windowMaximize, () => {
    const w = getWindow();
    if (!w) return;
    w.isMaximized() ? w.unmaximize() : w.maximize();
  });
  ipcMain.on(IPC.windowClose, () => getWindow()?.close());
  ipcMain.handle(
    IPC.windowIsMaximized,
    () => getWindow()?.isMaximized() ?? false,
  );
  ipcMain.handle(IPC.openExternal, (_e, url: string) =>
    shell.openExternal(url),
  );
  ipcMain.handle(IPC.pickFolder, async () => {
    const w = getWindow();
    if (!w) return null;
    const res = await dialog.showOpenDialog(w, {
      properties: ["openDirectory", "createDirectory"],
    });
    return res.canceled ? null : res.filePaths[0];
  });
  ipcMain.handle(IPC.pickImage, async () => {
    const window = getWindow();
    if (!window) return null;
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [
        { name: "Изображения", extensions: ["png", "jpg", "jpeg", "webp"] },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle(IPC.pickMedia, async () => {
    const window = getWindow();
    if (!window) return null;
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [
        {
          name: "Фон: изображение, GIF или видео",
          extensions: [
            "png",
            "jpg",
            "jpeg",
            "webp",
            "gif",
            "mp4",
            "webm",
            "m4v",
            "mov",
          ],
        },
      ],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  ipcMain.handle(IPC.pickGallery, async () => {
    const window = getWindow();
    if (!window) return [];
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Скриншоты",
          extensions: ["png", "jpg", "jpeg", "webp", "gif"],
        },
      ],
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle(IPC.readImage, (_event, path: string) =>
    readImageDataUrl(path),
  );
  ipcMain.handle(IPC.systemMemory, () => ({
    totalMb: Math.round(totalmem() / 1024 / 1024),
    freeMb: Math.round(freemem() / 1024 / 1024),
  }));
  ipcMain.handle(IPC.screenshotsList, () => listScreenshots());
  ipcMain.handle(IPC.gameContentSummary, () => contentSummary());

  // ---- persistence ----
  ipcMain.handle(IPC.stateGet, async () => {
    const state = await loadState();
    // reflect real on-disk install status
    state.stats.installed = await isInstalled();
    return state;
  });
  ipcMain.handle(IPC.settingsSave, async (_e, settings: AppSettings) => {
    const result = await saveSettings(settings);
    await syncDiscordSetting();
    return result;
  });
  ipcMain.handle(
    IPC.accountsSave,
    (_e, accounts: StoredAccount[], activeId: string | null) =>
      saveAccounts(accounts, activeId),
  );
  ipcMain.handle(IPC.friendsSave, (_e, friends: Friend[]) =>
    saveFriends(friends),
  );
  ipcMain.handle(IPC.friendResolve, (_e, username: string) =>
    resolveMinecraftProfile(username),
  );

  // ---- java ----
  ipcMain.handle(IPC.javaDetect, async (_e, preferred?: string | null) =>
    detectJava(preferred),
  );
  ipcMain.handle(IPC.javaInstall, () => installJava21());

  // ---- microsoft auth ----
  ipcMain.handle(IPC.authMsStart, () => startMicrosoftLogin(getWindow));
  ipcMain.handle(IPC.authMsCancel, () => cancelMicrosoftLogin());
  ipcMain.handle(IPC.authMsRefresh, (_e, account: StoredAccount) =>
    refreshMicrosoft(account),
  );
  ipcMain.handle(IPC.authElyLogin, (_e, input: ElyLoginInput) =>
    loginEly(input),
  );
  ipcMain.handle(IPC.authElyRefresh, (_e, account: StoredAccount) =>
    refreshEly(account),
  );
  ipcMain.handle(IPC.authLittleSkinLogin, (_e, input: LittleSkinLoginInput) =>
    loginLittleSkin(input),
  );
  ipcMain.handle(IPC.authLittleSkinRefresh, (_e, account: StoredAccount) =>
    refreshLittleSkin(account),
  );
  ipcMain.handle(
    IPC.discordActivity,
    (_e, activity: { details: string; state?: string }) =>
      setDiscordActivity(activity),
  );

  // ---- Minecraft appearance ----
  ipcMain.handle(IPC.appearanceGet, (_event, account: StoredAccount) =>
    appearance.getAppearance(account),
  );
  ipcMain.handle(IPC.appearancePickSkin, async () => {
    const window = getWindow();
    if (!window) return null;
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "Minecraft skin", extensions: ["png"] }],
    });
    return result.canceled ? null : readImageDataUrl(result.filePaths[0]);
  });
  ipcMain.handle(IPC.appearanceExportSkin, async (_event, dataUrl: string) => {
    const window = getWindow();
    if (!window) return false;
    const result = await dialog.showSaveDialog(window, {
      defaultPath: "royale-skin.png",
      filters: [{ name: "PNG", extensions: ["png"] }],
    });
    if (result.canceled || !result.filePath) return false;
    await fs.writeFile(
      result.filePath,
      appearance.skinBufferFromDataUrl(dataUrl),
    );
    return true;
  });
  ipcMain.handle(
    IPC.appearanceUploadSkin,
    (
      _event,
      account: StoredAccount,
      dataUrl: string,
      model: "classic" | "slim",
    ) => appearance.uploadSkin(account, dataUrl, model),
  );
  ipcMain.handle(IPC.appearanceResetSkin, (_event, account: StoredAccount) =>
    appearance.resetSkin(account),
  );
  ipcMain.handle(
    IPC.appearanceShowCape,
    (_event, account: StoredAccount, capeId: string) =>
      appearance.showCape(account, capeId),
  );
  ipcMain.handle(IPC.appearanceHideCape, (_event, account: StoredAccount) =>
    appearance.hideCape(account),
  );

  // ---- install / launch ----
  ipcMain.handle(IPC.gameInstall, () => installGame());
  ipcMain.handle(IPC.gamePause, () => pauseInstall());
  ipcMain.handle(IPC.gameResume, () => resumeInstall());
  ipcMain.handle(IPC.gameCancel, () => cancelInstall());
  ipcMain.handle(IPC.gameCheckUpdate, () => checkClientUpdate());
  ipcMain.handle(IPC.gameLaunch, (_e, account: StoredAccount) =>
    launchGame(account),
  );

  // ---- modrinth ----
  ipcMain.handle(
    IPC.modSearch,
    (_e, query: string, category: string, sort: string, offset: number) =>
      modrinth.search(query, category, sort, offset),
  );
  ipcMain.handle(IPC.modProject, (_e, projectId: string) =>
    modrinth.project(projectId),
  );
  ipcMain.handle(IPC.modVersions, (_e, projectId: string) =>
    modrinth.versions(projectId),
  );
  ipcMain.handle(
    IPC.modInstallProject,
    (_e, projectId: string, title: string) =>
      modrinth.installProject(projectId, title),
  );
  ipcMain.handle(
    IPC.modInstall,
    (
      _e,
      version: ModVersionFile,
      meta?: { projectId: string; title: string },
    ) => modrinth.installMod(version, meta),
  );
  ipcMain.handle(IPC.modInstalledList, () => modrinth.listInstalled());
  ipcMain.handle(IPC.modToggle, (_e, filename: string, enabled: boolean) =>
    modrinth.toggleMod(filename, enabled),
  );
  ipcMain.handle(IPC.modRemove, (_e, filename: string) =>
    modrinth.removeMod(filename),
  );
  ipcMain.handle(IPC.modReveal, (_e, filename: string) =>
    modrinth.revealMod(filename),
  );
}
