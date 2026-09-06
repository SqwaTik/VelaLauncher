import { createHash } from "crypto";
import { createWriteStream, promises as fs, existsSync } from "fs";
import { dirname, join } from "path";
import { totalmem } from "os";
import { exec, type ChildProcess } from "child_process";
import { promisify } from "util";
import { BrowserWindow } from "electron";
import {
  MinecraftFolder,
  Version,
  launch,
  createMinecraftProcessWatcher,
  LaunchPrecheck,
  type ResolvedLibrary,
  type ResolvedVersion,
} from "@xmcl/core";
import {
  DownloadTask,
  installTask,
  installVersionTask,
  installResolvedLibrariesTask,
  installResolvedAssetsTask,
  installAssetsTask,
  getVersionList,
} from "@xmcl/installer";
import { CancelledError, type Task, type TaskContext } from "@xmcl/task";
import type {
  ClientUpdateInfo,
  InstallProgress,
  InstallPhase,
  LaunchStatus,
  StoredAccount,
} from "../../shared/types";
import { IPC, GAME, BRAND } from "../../shared/constants";
import { gameDir, loadState, updateStats, recordPlaytime } from "./store";
import { detectJava, installRequiredJava } from "./java";
import {
  installProject,
  isJarStructurallyValid,
  repairInstalledMods,
} from "./modrinth";
import { setDiscordActivity } from "./discord";
import { bundledClientUpdate, installBundledClient } from "./bundled-client";
import { syncAppearanceManifest } from "./appearance-export";
import {
  fetchWithRetry,
  resilientDownloadDispatcher,
  resilientFetch,
} from "./network";

const execAsync = promisify(exec);
const USER_AGENT = "SqwaTik/VelaLauncher";
const FABRIC_API_PROJECT = "P7dR8mSH";
const pendingGameLogs = new WeakMap<
  BrowserWindow,
  Array<{ text: string; kind: string }>
>();

let currentTask: Task<unknown> | null = null;
let installing = false;
let buildProcess: ChildProcess | null = null;
let activeMinecraftProcess: ChildProcess | null = null; // Only the process still starting.
const runningProcesses = new Set<ChildProcess>();
const cancelledGenerations = new Set<number>();
let launchInProgress = false;
let launchGeneration = 0;
let cancelRequested = false;
let lastProgress: InstallProgress = { phase: "idle", progress: 0, message: "" };

function emitProgress(progress: InstallProgress): void {
  lastProgress = progress;
  for (const window of BrowserWindow.getAllWindows())
    window.webContents.send(IPC.gameProgress, progress);
}

function emitLaunch(status: LaunchStatus): void {
  for (const window of BrowserWindow.getAllWindows())
    window.webContents.send(IPC.gameLaunchStatus, { ...status, runningCount: runningProcesses.size, preparing: launchInProgress });
}

function createGameLogWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 900,
    height: 540,
    minWidth: 640,
    minHeight: 360,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#0c0e15",
    title: "Vela Launcher — журнал Minecraft",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>Журнал Minecraft</title>
<style>
*{box-sizing:border-box}html,body{margin:0;height:100%;background:#0c0e15;color:#d7e0d9;font:13px/1.55 "Cascadia Mono",Consolas,monospace}
header{position:sticky;top:0;display:flex;align-items:center;gap:10px;height:48px;padding:0 18px;background:#11141eef;border-bottom:1px solid #282d40;backdrop-filter:blur(14px)}
header i{width:8px;height:8px;border-radius:50%;background:#7668ff;box-shadow:0 0 14px #7668ff}header b{font:600 13px/1 system-ui;color:#f4f3ff}
pre{min-height:calc(100% - 48px);margin:0;padding:16px 18px 28px;white-space:pre-wrap;overflow-wrap:anywhere}
.stderr{color:#ff9b9b}.system{color:#43c7f4}
</style></head><body><header><i></i><b>Vela · журнал запуска</b></header><pre id="log"><span class="system">Подготовка процесса Minecraft…</span>\n</pre>
<script>
window.appendRoyaleLog=(text,kind)=>{const log=document.getElementById("log");const line=document.createElement("span");line.className=kind||"";line.textContent=text;log.appendChild(line);window.scrollTo({top:document.body.scrollHeight,behavior:"instant"})}
</script></body></html>`;
  pendingGameLogs.set(window, []);
  void window.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(html)}`,
  );
  window.webContents.once("did-finish-load", () => {
    const pending = pendingGameLogs.get(window) ?? [];
    pendingGameLogs.delete(window);
    for (const entry of pending) appendGameLog(window, entry.text, entry.kind);
  });
  window.once("ready-to-show", () => window.show());
  return window;
}

function appendGameLog(
  window: BrowserWindow | null,
  text: string,
  kind = "",
): void {
  if (!window || window.isDestroyed()) return;
  const pending = pendingGameLogs.get(window);
  if (pending) {
    pending.push({ text, kind });
    return;
  }
  void window.webContents
    .executeJavaScript(
      `window.appendRoyaleLog?.(${JSON.stringify(text)},${JSON.stringify(kind)})`,
      true,
    )
    .catch(() => undefined);
}

function report(
  phase: InstallPhase,
  progress: number,
  message: string,
  detail?: string,
  extra?: Partial<InstallProgress>,
): void {
  if (cancelRequested && phase !== "idle" && phase !== "error") return;
  const normalized = Math.min(1, Math.max(0, progress));
  const monotonic =
    phase === "idle" || phase === "done" || phase === "error"
      ? normalized
      : Math.max(lastProgress.progress, normalized);
  emitProgress({ phase, progress: monotonic, message, detail, ...extra });
}

export function fabricVersionId(): string {
  return `${GAME.minecraftVersion}-fabric-${GAME.fabricLoader}`;
}

export async function isInstalled(): Promise<boolean> {
  try {
    const folder = MinecraftFolder.from(await gameDir());
    return existsSync(folder.getVersionJson(fabricVersionId()));
  } catch {
    return false;
  }
}

export async function checkClientUpdate(): Promise<ClientUpdateInfo> {
  return bundledClientUpdate(await gameDir());
}

async function ensureFabricProfile(folder: MinecraftFolder): Promise<void> {
  const path = folder.getVersionJson(fabricVersionId());
  try {
    const local = JSON.parse(await fs.readFile(path, "utf8"));
    if (local.velaProfileVersion === 1 && local.inheritsFrom === GAME.minecraftVersion) return;
  } catch { /* install official profile below */ }
  const response = await fetchWithRetry(
    `https://meta.fabricmc.net/v2/versions/loader/${GAME.minecraftVersion}/${GAME.fabricLoader}/profile/json`,
    { headers: { "User-Agent": USER_AGENT } },
  );
  if (!response.ok) throw new Error(`Fabric: HTTP ${response.status}`);
  const profile = await response.json() as Record<string, any>;
  if (profile.inheritsFrom !== GAME.minecraftVersion || profile.mainClass !== "net.fabricmc.loader.impl.launch.knot.KnotClient" || !Array.isArray(profile.libraries))
    throw new Error("Fabric вернул несовместимый профиль");
  await fs.mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.vela.tmp`;
  await fs.writeFile(temporary, JSON.stringify({ ...profile, id: fabricVersionId(), velaProfileVersion: 1 }, null, 2));
  await fs.rename(temporary, path);
  const resolved = await Version.parse(folder, fabricVersionId());
  await installResolvedLibrariesTask(resolved.libraries, folder, {
    dispatcher: resilientDownloadDispatcher,
    librariesDownloadConcurrency: 4,
  }).startAndWait();
}

function minecraftTaskContext(
  rootTask: Task<unknown>,
  onActivity?: () => void,
): TaskContext {
  let lastBytes = 0;
  let lastAt = Date.now();
  let speed = 0;
  let detail = "Файлы игры";
  let detailChangedAt = 0;
  return {
    onUpdate(task) {
      if (cancelRequested) return;
      onActivity?.();
      const now = Date.now();
      const total = Math.max(0, rootTask.total);
      const written = Math.max(0, rootTask.progress);
      if (now - lastAt > 300) {
        speed = Math.max(0, (written - lastBytes) / ((now - lastAt) / 1000));
        lastBytes = written;
        lastAt = now;
      }
      if (task.to && now - detailChangedAt > 450) {
        detail = task.to;
        detailChangedAt = now;
      }
      const fraction = total > 0 ? Math.min(1, written / total) : 0.1;
      report(
        "client",
        0.08 + 0.62 * fraction,
        `Загрузка файлов Minecraft ${GAME.minecraftVersion}`,
        detail,
        {
          downloadedBytes: written,
          totalBytes: total,
          bytesPerSecond: speed,
          canPause: true,
        },
      );
    },
    onPaused() {
      report(
        "paused",
        lastProgress.progress,
        "Загрузка приостановлена",
        lastProgress.detail,
        { canPause: true },
      );
    },
    onResumed() {
      if (cancelRequested) return;
      onActivity?.();
      emitProgress({
        ...lastProgress,
        phase: "client",
        message: "Загрузка продолжена",
        canPause: true,
      });
    },
  };
}

async function runDownload(
  url: string,
  destination: string,
  phase: InstallPhase,
  start: number,
  span: number,
  message: string,
  detail: string,
): Promise<void> {
  let lastBytes = 0;
  let lastAt = Date.now();
  let speed = 0;
  const task = new DownloadTask({
    url,
    destination,
    pendingFile: `${destination}.part`,
    headers: { "User-Agent": USER_AGENT },
    dispatcher: resilientDownloadDispatcher,
    progressController: (_url, _chunk, written, total) => {
      if (cancelRequested) return;
      const now = Date.now();
      if (now - lastAt > 300) {
        speed = Math.max(0, (written - lastBytes) / ((now - lastAt) / 1000));
        lastBytes = written;
        lastAt = now;
      }
      report(
        phase,
        start + span * (total > 0 ? written / total : 0),
        message,
        detail,
        {
          downloadedBytes: written,
          totalBytes: total,
          bytesPerSecond: speed,
          canPause: true,
        },
      );
    },
  });
  currentTask = task;
  try {
    await task.startAndWait({
      onPaused: () =>
        report(
          "paused",
          lastProgress.progress,
          "Загрузка приостановлена",
          detail,
          { canPause: true },
        ),
      onResumed: () =>
        report(phase, lastProgress.progress, "Загрузка продолжена", detail, {
          canPause: true,
        }),
    });
  } finally {
    if (currentTask === task) currentTask = null;
  }
}

export async function pauseInstall(): Promise<boolean> {
  const task = currentTask;
  if (!task?.isRunning) return false;
  await task.pause();
  return task.isPaused;
}

export async function resumeInstall(): Promise<boolean> {
  const task = currentTask;
  if (!task?.isPaused) return false;
  await task.resume();
  return task.isRunning;
}

export async function cancelInstall(): Promise<boolean> {
  const task = currentTask;
  const process = buildProcess;
  const hadActiveInstall = Boolean(task || process);
  cancelRequested = true;
  currentTask = null;
  buildProcess = null;
  if (task?.isPaused) await task.resume().catch(() => undefined);
  if (task && !task.isDone) await task.cancel(1_200).catch(() => undefined);
  if (process) process.kill();
  return hadActiveInstall;
}

function installationErrorMessage(error: unknown): string {
  const messages: string[] = [];
  const visit = (value: unknown): void => {
    if (!value) return;
    if (value instanceof AggregateError) {
      for (const nested of value.errors) visit(nested);
      if (value.cause) visit(value.cause);
      return;
    }
    if (value instanceof Error) {
      if (value.message && !/^aggregate\s*error$/i.test(value.message))
        messages.push(value.message);
      if (value.cause) visit(value.cause);
      return;
    }
    if (typeof value === "string" && value.trim()) messages.push(value.trim());
  };
  visit(error);
  const unique = [...new Set(messages.map((message) => message.trim()))];
  if (!unique.length)
    return "Не удалось подключиться к серверу загрузки. Проверьте интернет и повторите попытку.";
  if (
    unique.some((message) =>
      /timed?\s*out|timeout|UND_ERR_(?:CONNECT|HEADERS|BODY)_TIMEOUT|ETIMEDOUT/i.test(
        message,
      ),
    )
  ) {
    return "Сервер загрузки слишком долго не отвечал. Запустите загрузку ещё раз — уже полученные файлы проверятся и повторно скачиваться не будут.";
  }
  const useful = unique.filter(
    (message) =>
      !/^aggregate\s*error$/i.test(message) &&
      !/^fetch failed$/i.test(message) &&
      !/^error$/i.test(message),
  );
  const joined = (useful.length ? useful : unique).slice(0, 2).join(" · ");
  return joined.length > 280 ? `${joined.slice(0, 277)}…` : joined;
}

export function gameOperationBusy(): boolean { return launchInProgress || installing; }

export async function installGame(): Promise<void> {
  if (launchInProgress || runningProcesses.size) throw new Error("Закройте Minecraft перед обновлением файлов игры");
  if (installing || currentTask || buildProcess) throw new Error("Установка уже выполняется");
  installing = true;
  cancelRequested = false;
  try {
    const state = await loadState();
    let java = await detectJava(state.settings.javaPath);
    if (!java?.valid) java = await installRequiredJava();
    if (!java?.valid)
      throw new Error(
        `Для установки Vela нужна Java ${GAME.javaMajor}+`,
      );

    const dir = await gameDir();
    await fs.mkdir(dir, { recursive: true });
    const folder = MinecraftFolder.from(dir);
    report(
      "metadata",
      0.01,
      "Получение манифеста версий",
      GAME.minecraftVersion,
      { canPause: false },
    );
    const list = await getVersionList({ fetch: resilientFetch });
    const meta = list.versions.find(
      (version) => version.id === GAME.minecraftVersion,
    );
    if (!meta)
      throw new Error(
        `Версия Minecraft ${GAME.minecraftVersion} не найдена в официальном манифесте`,
      );

    let resolved: ResolvedVersion | null = null;
    const totalAttempts = 4;
    for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
      // Reduce parallel traffic after a failed pass. Completed and verified
      // files are reused, so a retry only requests what is still missing.
      const task = installTask(meta, folder, {
        dispatcher: resilientDownloadDispatcher,
        fetch: resilientFetch,
        assetsDownloadConcurrency: Math.max(3, 9 - attempt * 2),
        librariesDownloadConcurrency: Math.max(2, 5 - attempt),
      });
      currentTask = task;
      try {
        resolved = await task.startAndWait(minecraftTaskContext(task));
        currentTask = null;
        break;
      } catch (cause) {
        currentTask = null;
        if (
          cancelRequested ||
          cause instanceof CancelledError ||
          attempt === totalAttempts
        ) {
          throw cause;
        }
        report(
          "metadata",
          lastProgress.progress,
          "Восстанавливаем загрузку",
          `Автоматическая попытка ${attempt + 1} из ${totalAttempts}`,
          { canPause: false },
        );
        await new Promise<void>((resolve) =>
          setTimeout(resolve, 900 * attempt),
        );
      }
    }
    if (!resolved)
      throw new Error(
        `Не удалось загрузить Minecraft после ${totalAttempts} попыток. Проверьте соединение.`,
      );
    if (cancelRequested) throw new Error("Установка отменена");

    report(
      "fabric",
      0.71,
      `Установка Fabric ${GAME.fabricLoader}`,
      GAME.minecraftVersion,
      { canPause: false },
    );
    await ensureFabricProfile(folder);
    report("fabric", 0.76, "Установка Fabric API", GAME.fabricApi, {
      canPause: false,
    });
    await installProject(FABRIC_API_PROJECT, "Fabric API");

    const modsPath = join(dir, "mods");
    await fs.mkdir(modsPath, { recursive: true });
    await installBundledClient(dir);
    await repairInstalledMods((message) =>
      report("verify", 0.95, message, undefined, { canPause: false }),
      java.majorVersion,
    );
    report(
      "verify",
      0.97,
      "Проверка файлов",
      "Minecraft, Fabric, Fabric API и Vela",
      { canPause: false },
    );
    await Version.parse(folder, fabricVersionId());
    await updateStats({ installed: true });
    report(
      "done",
      1,
      "Готово к запуску",
      `Vela ${GAME.clientVersion}`,
      { canPause: false },
    );
    void resolved;
  } catch (error) {
    currentTask = null;
    buildProcess = null;
    const message = installationErrorMessage(error);
    if (
      cancelRequested ||
      error instanceof CancelledError ||
      /cancel/i.test(message) ||
      /отмен/i.test(message)
    ) {
      report("idle", 0, "Установка отменена");
      return;
    } else {
      report("error", lastProgress.progress, "Ошибка установки", message);
    }
    throw new Error(message);
  } finally {
    installing = false;
  }
}

function splitArgs(value: string): string[] {
  const result: string[] = [];
  const expression =
    /"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|([^\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = expression.exec(value)))
    result.push((match[1] ?? match[2] ?? match[3]).replace(/\\(["'])/g, "$1"));
  return result;
}

function environmentFromText(value: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const line of value.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) env[key] = line.slice(index + 1);
  }
  return env;
}

async function ensureAuthlibInjector(storagePath: string): Promise<string> {
  const root = join(storagePath, "authlib-injector");
  const jar = join(root, "authlib-injector.jar");
  await fs.mkdir(root, { recursive: true });
  const metadata = await fetchWithRetry(
    "https://authlib-injector.yushi.moe/artifact/latest.json",
    {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    },
  );
  if (!metadata.ok)
    throw new Error(
      `Не удалось проверить authlib-injector: ${metadata.status}`,
    );
  const latest = (await metadata.json()) as {
    version: string;
    download_url: string;
    checksums: { sha256: string };
  };
  let valid = false;
  if (existsSync(jar)) {
    const digest = createHash("sha256")
      .update(await fs.readFile(jar))
      .digest("hex");
    valid = digest === latest.checksums.sha256;
  }
  if (!valid) {
    await runDownload(
      latest.download_url,
      jar,
      "client",
      0,
      0,
      "Загрузка authlib-injector",
      latest.version,
    );
    const digest = createHash("sha256")
      .update(await fs.readFile(jar))
      .digest("hex");
    if (digest !== latest.checksums.sha256)
      throw new Error("SHA-256 authlib-injector не совпал");
  }
  return jar;
}

function librariesFromLaunchError(error: unknown): ResolvedLibrary[] | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "error" in error &&
    error.error === "MissingLibraries" &&
    "libraries" in error &&
    Array.isArray(error.libraries)
  ) {
    return error.libraries as ResolvedLibrary[];
  }
  return null;
}

async function repairLaunchFiles(
  folder: MinecraftFolder,
  versionId: string,
  initial: ResolvedVersion,
  quickLaunch: boolean,
): Promise<ResolvedVersion> {
  let resolved = initial;
  let versionBroken = !existsSync(
    folder.getVersionJar(resolved.minecraftVersion),
  );
  if (!quickLaunch && !versionBroken) {
    try {
      await LaunchPrecheck.checkVersion(
        folder,
        resolved,
        {} as Parameters<typeof LaunchPrecheck.checkVersion>[2],
      );
    } catch {
      versionBroken = true;
    }
  }
  if (versionBroken) {
    emitLaunch({
      state: "launching",
      message: "Восстанавливаем файлы Minecraft",
    });
    const list = await getVersionList({ fetch: resilientFetch });
    const metadata = list.versions.find(
      (entry) => entry.id === resolved.minecraftVersion,
    );
    if (!metadata)
      throw new Error(
        `Не удалось найти Minecraft ${resolved.minecraftVersion} для восстановления.`,
      );
    await installVersionTask(metadata, folder, {
      dispatcher: resilientDownloadDispatcher,
    }).startAndWait();
    resolved = await Version.parse(folder, versionId);
  }

  let missingLibraries: ResolvedLibrary[] = [];
  if (quickLaunch) {
    missingLibraries = resolved.libraries.filter(
      (library) => !existsSync(folder.getLibraryByPath(library.download.path)),
    );
  } else {
    try {
      await LaunchPrecheck.checkLibraries(
        folder,
        resolved,
        {} as Parameters<typeof LaunchPrecheck.checkLibraries>[2],
      );
    } catch (error) {
      const libraries = librariesFromLaunchError(error);
      if (!libraries) throw error;
      missingLibraries = libraries;
    }
  }
  if (missingLibraries.length) {
    emitLaunch({
      state: "launching",
      message: `Докачиваем ${missingLibraries.length} библиотек`,
    });
    await installResolvedLibrariesTask(missingLibraries, folder, {
      dispatcher: resilientDownloadDispatcher,
      librariesDownloadConcurrency: 4,
    }).startAndWait();
  }

  if (!quickLaunch) {
    const indexCandidates = [
      folder.getAssetsIndex(resolved.assets),
      resolved.assetIndex?.sha1
        ? folder.getAssetsIndex(resolved.assetIndex.sha1)
        : "",
    ].filter(Boolean);
    let index:
      | {
          objects?: Record<string, { hash: string; size: number }>;
        }
      | undefined;
    for (const candidate of indexCandidates) {
      try {
        index = JSON.parse(
          await fs.readFile(candidate, "utf8"),
        ) as typeof index;
        break;
      } catch {
        /* try the next supported asset-index name */
      }
    }
    if (!index?.objects) {
      emitLaunch({
        state: "launching",
        message: "Восстанавливаем ассеты Minecraft",
      });
      await installAssetsTask(resolved, {
        dispatcher: resilientDownloadDispatcher,
        fetch: resilientFetch,
        assetsDownloadConcurrency: 8,
        prevalidSizeOnly: true,
      }).startAndWait();
    } else {
      const unique = new Map<
        string,
        { name: string; hash: string; size: number }
      >();
      for (const [name, asset] of Object.entries(index.objects)) {
        if (!unique.has(asset.hash)) unique.set(asset.hash, { name, ...asset });
      }
      const missing = (
        await Promise.all(
          [...unique.values()].map(async (asset) => {
            const size = await fs
              .stat(folder.getAsset(asset.hash))
              .then((stat) => stat.size)
              .catch(() => -1);
            return size === asset.size ? null : asset;
          }),
        )
      ).filter((asset): asset is { name: string; hash: string; size: number } =>
        Boolean(asset),
      );
      if (missing.length) {
        emitLaunch({
          state: "launching",
          message: `Докачиваем ${missing.length} файлов игры`,
        });
        await installResolvedAssetsTask(missing, folder, {
          dispatcher: resilientDownloadDispatcher,
          fetch: resilientFetch,
          assetsDownloadConcurrency: 8,
          prevalidSizeOnly: true,
        }).startAndWait();
      }
    }
  }
  return Version.parse(folder, versionId);
}

export async function launchGame(account: StoredAccount): Promise<void> {
  if (launchInProgress || installing)
    throw new Error("Подготовка игры уже выполняется");
  const generation = ++launchGeneration;
  const cancelled = (): boolean => cancelledGenerations.has(generation);
  launchInProgress = true;
  try {
    const state = structuredClone(await loadState());
    if (cancelled()) return;
    const dir = await gameDir();
    const instance = state.instances.find(
      (item) => item.id === state.activeInstanceId,
    );
    const folder = MinecraftFolder.from(dir);
    const id = fabricVersionId();
    if (!existsSync(folder.getVersionJson(id))) {
      if (generation === launchGeneration) launchInProgress = false;
      emitLaunch({ state: "error", message: "Игра не установлена" });
      return;
    }

    let java = await detectJava(instance?.javaPath ?? state.settings.javaPath);
    if (!java?.valid) java = await installRequiredJava();
    if (cancelled()) return;
    if (!java?.valid) {
      emitLaunch({
        state: "error",
        message: `Не найдена Java ${GAME.javaMajor}+. Установите её в настройках.`,
      });
      if (generation === launchGeneration) launchInProgress = false;
      return;
    }

    emitLaunch({ state: "launching", message: "Подготовка запуска" });
    await setDiscordActivity({
      details: "Запускает Vela",
      state: `Minecraft ${GAME.minecraftVersion}`,
    });
    if (cancelled()) return;
    if (state.settings.preLaunchCommand.trim()) {
      emitLaunch({
        state: "launching",
        message: "Выполнение команды перед запуском",
      });
      await execAsync(state.settings.preLaunchCommand, {
        cwd: dir,
        windowsHide: true,
        env: environmentFromText(state.settings.environmentVariables),
      });
    }
    if (cancelled()) return;
    await ensureFabricProfile(folder);
    let resolved = await Version.parse(folder, id);
    emitLaunch({ state: "launching", message: "Проверяем файлы игры" });
    resolved = await repairLaunchFiles(
      folder,
      id,
      resolved,
      state.settings.quickLaunch,
    );
    if (cancelled()) return;
    // Lightweight damage (partial/corrupt Modrinth archives) is repaired
    // silently before Fabric sees it. The launch button keeps one calm status
    // instead of exposing technical recovery work to the player.
    await installBundledClient(dir);
    await installProject(FABRIC_API_PROJECT, "Fabric API");
    await repairInstalledMods(undefined, java.majorVersion);
    if (cancelled()) return;
    const automaticMax = Math.min(
      8192,
      Math.max(
        4096,
        Math.floor(((totalmem() / 1024 / 1024) * 0.5) / 512) * 512,
      ),
    );
    const mode =
      state.settings.memoryMode ??
      (state.settings.memoryAuto ? "auto" : "manual");
    const minMemory =
      mode === "system"
        ? undefined
        : mode === "auto"
          ? Math.max(2048, Math.floor(automaticMax / 2))
          : state.settings.memoryMinMb;
    const maxMemory =
      mode === "system"
        ? undefined
        : mode === "auto"
          ? automaticMax
          : state.settings.memoryMb;
    const environment = environmentFromText(
      state.settings.environmentVariables,
    );
    if (state.settings.devMode) environment.VELA_LAUNCHER_DEV_MODE = "1";
    if (state.settings.gpuDedicated && state.settings.gpuProfile !== "power") {
      environment.SHIM_MCCOMPAT = "0x800000001";
      environment.__NV_PRIME_RENDER_OFFLOAD = "1";
      environment.AmdPowerXpressRequestHighPerformance = "1";
    }
    const authServer =
      account.type === "ely"
        ? "ely.by"
        : account.type === "littleskin"
          ? "https://littleskin.cn/api/yggdrasil"
          : null;
    const authlibJar = authServer ? await ensureAuthlibInjector(dir) : null;
    const nativeRoot = join(dir, "versions", id, `${id}-natives`);
    if (state.settings.replaceNativeLibraries === "always")
      await fs.rm(nativeRoot, { recursive: true, force: true });
    const prechecks = state.settings.quickLaunch
      ? []
      : state.settings.replaceNativeLibraries === "never"
        ? [LaunchPrecheck.checkVersion, LaunchPrecheck.checkLibraries]
        : undefined;

    const appearanceManifest = await syncAppearanceManifest(state.settings.storagePath, state.accounts);
    const developerJvmArgs = state.settings.devMode
      ? ["-Dvela.launcher.devMode=true"]
      : [];
    const { independentSpawn } = await import('./independent-process');
    const process = await launch({
      spawn: independentSpawn(join(dir, 'logs', 'launcher')) as typeof import('node:child_process').spawn,
      gamePath: dir,
      resourcePath: dir,
      javaPath: java.path,
      version: resolved,
      minMemory,
      maxMemory,
      extraJVMArgs: [...splitArgs(state.settings.jvmArgs), ...developerJvmArgs, `-Dvela.appearance.manifest=${appearanceManifest}`],
      extraMCArgs: splitArgs(state.settings.minecraftArgs),
      extraExecOption: { env: environment, windowsHide: true },
      prechecks,
      gameProfile: {
        name: account.username,
        id: account.uuid.replace(/-/g, ""),
      },
      accessToken: account.accessToken ?? "0",
      userType: account.type === "offline" ? "legacy" : "mojang",
      launcherName: "VelaLauncher",
      launcherBrand: BRAND.name,
      yggdrasilAgent:
        authlibJar && authServer
          ? { jar: authlibJar, server: authServer }
          : undefined,
    });
    if (cancelled()) {
      process.kill();
      return;
    }
    activeMinecraftProcess = process;

    const watcher = createMinecraftProcessWatcher(process);
    const launcherWindow = BrowserWindow.getAllWindows()[0];
    const logWindow = state.settings.showLog ? createGameLogWindow() : null;
    let logStream: ReturnType<typeof createWriteStream> | null = null;
    let recentOutput = "";
    if (state.settings.devMode) {
      const logDirectory = join(dir, "logs");
      await fs.mkdir(logDirectory, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      logStream = createWriteStream(
        join(logDirectory, `vela-launch-${timestamp}.log`),
        { flags: "a" },
      );
      logStream.write(
        `[Vela Launcher] Minecraft ${GAME.minecraftVersion}, PID ${process.pid ?? "unknown"}\n`,
      );
    }
    const pipeLog = (
      chunk: Buffer | string,
      kind: "stdout" | "stderr",
    ): void => {
      const text = chunk.toString();
      recentOutput = `${recentOutput}${text}`.slice(-32_000);
      logStream?.write(`[${kind}] ${text}`);
      appendGameLog(logWindow, text, kind === "stderr" ? "stderr" : "");
    };
    process.stdout?.on("data", (chunk: Buffer | string) =>
      pipeLog(chunk, "stdout"),
    );
    process.stderr?.on("data", (chunk: Buffer | string) =>
      pipeLog(chunk, "stderr"),
    );
    let minecraftWindowReady = false;
    let launcherHidden = false;
    const started = Date.now();
    watcher.once("minecraft-window-ready", () => {
      if (cancelled()) return;
      if (minecraftWindowReady) return;
      minecraftWindowReady = true;
      runningProcesses.add(process);
      if (activeMinecraftProcess === process) activeMinecraftProcess = null;
      if (generation === launchGeneration) launchInProgress = false;
      emitLaunch({ state: "running", message: "Игра запущена" });
      void setDiscordActivity({
        details: "Играет в Vela",
        state: account.username,
        startedAt: Date.now(),
      });
      if (state.settings.closeOnLaunch && launcherWindow) {
        launcherHidden = true;
        launcherWindow.hide();
      }
    });
    watcher.on("error", (error) => {
      runningProcesses.delete(process);
      if (activeMinecraftProcess === process) activeMinecraftProcess = null;
      if (cancelled()) return;
      if (generation === launchGeneration) launchInProgress = false;
      emitLaunch({
        state: "crashed",
        message: error instanceof Error ? error.message : String(error),
        crashReport:
          error instanceof Error ? error.stack || error.message : String(error),
      });
    });
    watcher.on(
      "minecraft-exit",
      ({ code, crashReport, crashReportLocation }) => {
        runningProcesses.delete(process);
        if (activeMinecraftProcess === process) activeMinecraftProcess = null;
        if (generation === launchGeneration) launchInProgress = false;
        logStream?.end(
          `\n[Vela Launcher] Процесс завершён с кодом ${code ?? 0}.\n`,
        );
        appendGameLog(
          logWindow,
          `\nПроцесс Minecraft завершён с кодом ${code ?? 0}.\n`,
          "system",
        );
        if (cancelled()) return;
        const minutes = Math.max(
          0,
          Math.round((Date.now() - started) / 60_000),
        );
        void recordPlaytime(minutes);
        if (launcherWindow && (launcherHidden || !launcherWindow.isVisible())) {
          launcherWindow.show();
          launcherWindow.focus();
        }
        void setDiscordActivity({ details: "В главном меню" });
        const failed = Boolean(crashReport) || (code ?? 0) !== 0;
        emitLaunch(
          failed
            ? {
                state: "crashed",
                message: "Vela завершился с ошибкой",
                code,
                crashReport:
                  crashReport ||
                  recentOutput ||
                  `Minecraft завершился с кодом ${code ?? "неизвестно"}.`,
                crashReportLocation,
              }
            : { state: "exited", code },
        );
      },
    );
  } catch (error) {
    if (generation === launchGeneration) launchInProgress = false;
    if (cancelled()) return;
    const process = activeMinecraftProcess;
    activeMinecraftProcess = null;
    if (process && !process.killed) process.kill();
    emitLaunch({
      state: "crashed",
      message: error instanceof Error ? error.message : String(error),
      crashReport:
        error instanceof Error ? error.stack || error.message : String(error),
    });
    await setDiscordActivity({ details: "В главном меню" });
  } finally {
    if (!activeMinecraftProcess && generation === launchGeneration) {
      launchInProgress = false;
      if (cancelled()) emitLaunch({ state: "exited", code: 0 });
    }
    cancelledGenerations.delete(generation);
  }
}

export async function cancelLaunch(): Promise<boolean> {
  if (!launchInProgress) return false;
  cancelledGenerations.add(launchGeneration);
  const pending = activeMinecraftProcess;
  if (pending && !pending.killed) {
    pending.kill();
    activeMinecraftProcess = null;
    launchInProgress = false;
    emitLaunch({ state: "exited", code: 0 });
  } else {
    emitLaunch({ state: "launching", message: "Ожидаем завершения текущей проверки…" });
  }
  return true;
}
