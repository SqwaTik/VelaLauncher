import { spawn } from "child_process";
import { app, BrowserWindow } from "electron";
import { createWriteStream } from "fs";
import { promises as fs } from "fs";
import { join } from "path";
import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import { IPC } from "../../shared/constants";
import type {
  LauncherUpdateInfo,
  LauncherUpdateProgress,
} from "../../shared/types";

const REPOSITORY = "SqwaTik/VelaLauncher";
const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`;
const USER_AGENT = "SqwaTik/VelaLauncher";

interface LatestRelease {
  tag_name?: string;
  html_url?: string;
  published_at?: string;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
  }>;
}

function normalizedParts(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(/[.-]/)
    .slice(0, 4)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isNewer(latest: string, current: string): boolean {
  const left = normalizedParts(latest);
  const right = normalizedParts(current);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

export async function checkLauncherUpdate(): Promise<LauncherUpdateInfo> {
  const currentVersion = app.getVersion();
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": USER_AGENT,
      },
    },
  );
  if (response.status === 404) {
    return {
      currentVersion,
      latestVersion: currentVersion,
      available: false,
      releaseUrl: RELEASES_URL,
      downloadUrl: null,
      publishedAt: null,
    };
  }
  if (!response.ok)
    throw new Error(`Сервер обновлений ответил кодом ${response.status}.`);

  const release = (await response.json()) as LatestRelease;
  const latestVersion = (release.tag_name || currentVersion).replace(/^v/i, "");
  const installer = release.assets?.find(
    (asset) =>
      /\.exe$/i.test(asset.name || "") &&
      /(setup|installer|royale|vela)/i.test(asset.name || ""),
  );
  return {
    currentVersion,
    latestVersion,
    available: isNewer(latestVersion, currentVersion),
    releaseUrl: release.html_url || RELEASES_URL,
    downloadUrl: installer?.browser_download_url || null,
    publishedAt: release.published_at || null,
  };
}

function emitProgress(progress: LauncherUpdateProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed())
      window.webContents.send(IPC.appUpdateProgress, progress);
  }
}

function updateError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/aborted|timed?\s*out|fetch failed/i.test(raw))
    return "Загрузка обновления прервалась. Проверьте интернет и повторите попытку.";
  return raw
    .replace(/^Error:\s*/i, "")
    .trim()
    .slice(0, 220);
}

async function downloadInstaller(
  url: string,
  destination: string,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const partial = `${destination}.part`;
    await fs.rm(partial, { force: true });
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers: { "User-Agent": USER_AGENT },
      });
      if (!response.ok || !response.body)
        throw new Error(`Сервер загрузки ответил кодом ${response.status}.`);
      const totalBytes = Number(response.headers.get("content-length")) || 0;
      let downloadedBytes = 0;
      let lastEmit = 0;
      const tracker = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          downloadedBytes += chunk.length;
          const now = Date.now();
          if (now - lastEmit > 90 || downloadedBytes === totalBytes) {
            lastEmit = now;
            emitProgress({
              phase: "downloading",
              progress: totalBytes
                ? Math.min(100, (downloadedBytes / totalBytes) * 100)
                : 0,
              downloadedBytes,
              totalBytes,
              message:
                attempt > 1
                  ? `Повторная загрузка · попытка ${attempt}/3`
                  : "Загрузка обновления лаунчера",
            });
          }
          callback(null, chunk);
        },
      });
      await pipeline(
        Readable.fromWeb(
          response.body as unknown as import("stream/web").ReadableStream,
        ),
        tracker,
        createWriteStream(partial),
      );
      const signature = await fs
        .readFile(partial)
        .then((data) => data.subarray(0, 2).toString("ascii"));
      if (signature !== "MZ")
        throw new Error("Полученный файл не является установщиком Windows.");
      await fs.rm(destination, { force: true });
      await fs.rename(partial, destination);
      return;
    } catch (error) {
      lastError = error;
      await fs.rm(partial, { force: true });
      if (attempt === 3) break;
    }
  }
  throw lastError;
}

export async function installLauncherUpdate(): Promise<void> {
  if (!app.isPackaged)
    throw new Error("Автообновление доступно в установленной версии лаунчера.");
  const update = await checkLauncherUpdate();
  if (!update.available)
    throw new Error("У вас уже установлена актуальная версия лаунчера.");
  if (!update.downloadUrl)
    throw new Error("В релизе не найден установщик Vela Launcher.");

  const safeVersion = update.latestVersion.replace(/[^a-z0-9._-]/gi, "");
  const destination = join(
    app.getPath("temp"),
    `Vela-Launcher-${safeVersion}-Setup.exe`,
  );
  try {
    await downloadInstaller(update.downloadUrl, destination);
    emitProgress({
      phase: "installing",
      progress: 100,
      downloadedBytes: 0,
      totalBytes: 0,
      message: "Устанавливаем обновление",
    });
    const installer = spawn(destination, ["/S", "--updated", "--force-run"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    installer.unref();
    setTimeout(() => app.quit(), 650);
  } catch (error) {
    const message = updateError(error);
    emitProgress({
      phase: "error",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      message,
    });
    throw new Error(message);
  }
}
