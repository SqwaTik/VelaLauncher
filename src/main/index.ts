import { app, shell, BrowserWindow, net, protocol } from "electron";
import { join, normalize, relative } from "path";
import { pathToFileURL } from "url";
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
    // Forward Range headers: large/long videos seek and start without loading
    // the whole file into memory first.
    return net.fetch(pathToFileURL(requestedPath).toString(), {
      headers: request.headers,
    });
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
