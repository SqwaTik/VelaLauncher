import { BrowserWindow } from "electron";
import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fs, type Dirent } from "fs";
import { dirname, join } from "path";
import extract from "extract-zip";
import { DownloadTask } from "@xmcl/installer";
import type { TaskContext } from "@xmcl/task";
import { GAME, IPC } from "../../shared/constants";
import type { InstallProgress, JavaInfo } from "../../shared/types";
import { loadState, saveSettings } from "./store";
import { resilientDownloadDispatcher } from "./network";

const execFileAsync = promisify(execFile);

/** Parse `java -version` stderr into major version. */
export function parseJavaVersion(
  text: string,
): { version: string; major: number } | null {
  const match = text.match(/version\s+"([^"]+)"/i);
  if (!match) return null;
  const version = match[1];
  const first = Number(version.split(/[._]/)[0]);
  const major = first === 1 ? Number(version.split(/[._]/)[1]) : first;
  return Number.isFinite(major) ? { version, major } : null;
}

async function probe(javaPath: string): Promise<JavaInfo | null> {
  try {
    const { stderr, stdout } = await execFileAsync(javaPath, ["-version"], {
      timeout: 8_000,
      windowsHide: true,
    });
    const parsed = parseJavaVersion(`${stderr}\n${stdout}`);
    if (!parsed) return null;
    return {
      path: javaPath,
      version: parsed.version,
      majorVersion: parsed.major,
      valid: parsed.major >= GAME.javaMajor,
    };
  } catch {
    return null;
  }
}

async function managedJavaExecutable(): Promise<string> {
  const state = await loadState();
  return join(
    state.settings.storagePath,
    "jre",
    `java${GAME.javaMajor}`,
    "bin",
    "java.exe",
  );
}

/** Common install roots to scan on Windows for a suitable JDK/JRE. */
function candidates(preferred?: string | null, managed?: string): string[] {
  const list: string[] = [];
  if (preferred) list.push(preferred);
  if (managed) list.push(managed);
  list.push("java");
  if (process.env.JAVA_HOME)
    list.push(join(process.env.JAVA_HOME, "bin", "java.exe"));
  const roots = [
    process.env.ProgramFiles,
    process.env["ProgramFiles(x86)"],
    process.env.LOCALAPPDATA,
  ].filter((value): value is string => Boolean(value));
  for (const root of roots) {
    for (const folder of [
      "Eclipse Adoptium",
      "Java",
      "Microsoft",
      "Zulu",
      "Amazon Corretto",
    ]) {
      list.push(join(root, folder, "bin", "java.exe"));
    }
  }
  return [...new Set(list)];
}

async function discoverNested(root: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .flatMap((entry) => [
        join(root, entry.name, "bin", "java.exe"),
        join(root, entry.name, "jre", "bin", "java.exe"),
      ]);
  } catch {
    return [];
  }
}

export async function detectJava(
  preferred?: string | null,
): Promise<JavaInfo | null> {
  const managed = await managedJavaExecutable();
  const expanded = [...candidates(preferred, managed)];
  for (const root of [
    join(process.env.ProgramFiles ?? "C:\\Program Files", "Eclipse Adoptium"),
    join(process.env.ProgramFiles ?? "C:\\Program Files", "Java"),
    join(process.env.LOCALAPPDATA ?? "", "Programs", "Eclipse Adoptium"),
  ])
    expanded.push(...(await discoverNested(root)));

  let fallback: JavaInfo | null = null;
  for (const javaPath of [...new Set(expanded)]) {
    const info = await probe(javaPath);
    if (!info) continue;
    if (info.valid) return info;
    fallback ??= info;
  }
  return fallback;
}

function emitJava(progress: InstallProgress): void {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC.javaProgress, progress);
  }
}

function adoptiumArchitecture(): string {
  if (process.arch === "arm64") return "aarch64";
  if (process.arch === "ia32") return "x86";
  return "x64";
}

async function findJava(root: string): Promise<string | null> {
  const queue = [root];
  while (queue.length) {
    const current = queue.shift()!;
    let entries: Dirent[];
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const path = join(current, entry.name);
      if (
        entry.isFile() &&
        entry.name.toLowerCase() === "java.exe" &&
        dirname(path).toLowerCase().endsWith("\\bin")
      )
        return path;
      if (entry.isDirectory()) queue.push(path);
    }
  }
  return null;
}

/** Install the portable Eclipse Temurin JDK required by the active game stack. */
export async function installRequiredJava(): Promise<JavaInfo> {
  const existing = await probe(await managedJavaExecutable());
  if (existing?.valid) return existing;

  const state = await loadState();
  const jreRoot = join(state.settings.storagePath, "jre");
  const destination = join(jreRoot, `java${GAME.javaMajor}`);
  const work = join(jreRoot, `.java${GAME.javaMajor}-install`);
  const archive = join(jreRoot, `temurin-${GAME.javaMajor}.zip`);
  await fs.mkdir(jreRoot, { recursive: true });
  await fs.rm(work, { recursive: true, force: true });
  await fs.mkdir(work, { recursive: true });

  let lastBytes = 0;
  let lastAt = Date.now();
  let speed = 0;
  const url = `https://api.adoptium.net/v3/binary/latest/${GAME.javaMajor}/ga/windows/${adoptiumArchitecture()}/jdk/hotspot/normal/eclipse`;
  const task = new DownloadTask({
    url,
    destination: archive,
    pendingFile: `${archive}.pending`,
    headers: { "User-Agent": "VelaLauncher/0.1.6" },
    dispatcher: resilientDownloadDispatcher,
    progressController: (_url, _chunk, written, total) => {
      const now = Date.now();
      if (now - lastAt >= 350) {
        speed = Math.max(0, (written - lastBytes) / ((now - lastAt) / 1000));
        lastBytes = written;
        lastAt = now;
      }
      emitJava({
        phase: "java",
        progress: total > 0 ? written / total : 0,
        message: `Скачивание Java ${GAME.javaMajor}`,
        detail: "Eclipse Temurin JDK",
        downloadedBytes: written,
        totalBytes: total,
        bytesPerSecond: speed,
        canPause: false,
      });
    },
  });
  const context: TaskContext = {
    onFailed: (_task, error) =>
      emitJava({
        phase: "error",
        progress: 0,
        message: "Не удалось скачать Java",
        detail: error instanceof Error ? error.message : String(error),
      }),
  };
  await task.startAndWait(context);

  emitJava({
    phase: "java",
    progress: 0.94,
    message: `Установка Java ${GAME.javaMajor}`,
    detail: "Распаковка переносимого JDK",
  });
  await extract(archive, { dir: work });
  const extractedJava = await findJava(work);
  if (!extractedJava)
    throw new Error("В архиве Temurin не найден bin\\java.exe");
  const extractedRoot = dirname(dirname(extractedJava));
  await fs.rm(destination, { recursive: true, force: true });
  await fs.rename(extractedRoot, destination);
  await fs.rm(work, { recursive: true, force: true });
  await fs.rm(archive, { force: true });

  const result = await probe(join(destination, "bin", "java.exe"));
  if (!result?.valid)
    throw new Error(
      `Установленная Java не соответствует версии ${GAME.javaMajor}+`,
    );
  await saveSettings({ ...state.settings, javaPath: result.path });
  emitJava({
    phase: "done",
    progress: 1,
    message: `Java ${result.majorVersion} установлена`,
    detail: result.path,
  });
  return result;
}
