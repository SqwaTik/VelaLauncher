import { app, shell, BrowserWindow, protocol } from "electron";
import { createReadStream } from "fs";
import { stat } from "fs/promises";
import { join, normalize, relative, extname } from "path";
import { Readable } from "stream";
import { registerIpc } from "./ipc";
import { loadState } from "./services/store";
import { destroyDiscord, initDiscord } from "./services/discord";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "royale-media",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

let mainWindow: BrowserWindow | null = null;

const mediaTypes: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

async function streamMedia(
  requestedPath: string,
  request: Request,
): Promise<Response> {
  const info = await stat(requestedPath);
  if (!info.isFile()) return new Response("Not found", { status: 404 });

  const contentType =
    mediaTypes[extname(requestedPath).toLocaleLowerCase()] ||
    "application/octet-stream";
  const range = request.headers.get("range");
  let start = 0;
  let end = info.size - 1;
  let status = 200;

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
    if (!match || (!match[1] && !match[2])) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${info.size}` },
      });
    }
    if (!match[1]) {
      const suffix = Math.min(info.size, Number(match[2]));
      start = info.size - suffix;
    } else {
      start = Number(match[1]);
    }
    if (match[2] && match[1]) end = Math.min(end, Number(match[2]));
    if (start < 0 || start >= info.size || end < start) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${info.size}` },
      });
    }
    status = 206;
  }

  const nodeStream = createReadStream(requestedPath, { start, end });
  const body = Readable.toWeb(nodeStream) as unknown as BodyInit;
  const headers: Record<string, string> = {
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Length": String(end - start + 1),
    "Content-Type": contentType,
  };
  if (status === 206) {
    headers["Content-Range"] = `bytes ${start}-${end}/${info.size}`;
  }
  return new Response(body, { status, headers });
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 740,
    minWidth: 940,
    minHeight: 600,
    show: false,
    frame: false,
    icon: app.isPackaged
      ? join(process.resourcesPath, "icon.ico")
      : join(process.cwd(), "build", "icon.ico"),
    backgroundColor: "#0e0f16",
    titleBarStyle: "hidden",
    webPreferences: {
      preload: join(__dirname, "../preload/index.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on("ready-to-show", () => mainWindow?.show());

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  // electron-vite injects the dev server URL in development.
  const devUrl = process.env["ELECTRON_RENDERER_URL"];
  if (devUrl) {
    mainWindow.loadURL(devUrl);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  protocol.handle("royale-media", async (request) => {
    const requestedPath = decodeURIComponent(
      new URL(request.url).pathname.slice(1),
    );
    const state = await loadState();
    const allowed = [
      state.settings.backgroundMediaPath,
      state.settings.backgroundImagePath,
      ...state.settings.galleryImagePaths,
    ]
      .filter((entry): entry is string => Boolean(entry))
      .map((entry) => normalize(entry).toLocaleLowerCase());
    const screenshotsRoot = normalize(
      join(state.settings.storagePath, "screenshots"),
    ).toLocaleLowerCase();
    const normalizedRequested = normalize(requestedPath).toLocaleLowerCase();
    const screenshotRelative = relative(screenshotsRoot, normalizedRequested);
    const isScreenshot =
      screenshotRelative !== "" &&
      !screenshotRelative.startsWith("..") &&
      !screenshotRelative.includes(":");

    if (!allowed.includes(normalizedRequested) && !isScreenshot) {
      return new Response("Media path is not allowed", { status: 403 });
    }
    try {
      // A real ranged file stream keeps even large MP4/WebM backgrounds
      // responsive and never copies or recompresses the user's video.
      return await streamMedia(requestedPath, request);
    } catch {
      return new Response("Media file is unavailable", { status: 404 });
    }
  });
  registerIpc(() => mainWindow);
  createWindow();
  void initDiscord();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  void destroyDiscord();
  if (process.platform !== "darwin") app.quit();
});
