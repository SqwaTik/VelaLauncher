import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  AppSettings,
  GameContentSummary,
  InstallProgress,
  JavaInfo,
  LauncherUpdateInfo,
  LauncherUpdateProgress,
  SystemMemoryInfo,
} from "@shared/types";

function mediaUrl(path: string): string {
  return `royale-media://local/${encodeURIComponent(path)}`;
}

function mediaKind(path: string | null | undefined): "image" | "video" {
  return path && /\.(mp4|webm|m4v|mov)$/i.test(path) ? "video" : "image";
}

/** Persisted launcher settings plus local-media URLs safe for the renderer. */
export const useSettingsStore = defineStore("settings", () => {
  const settings = ref<AppSettings | null>(null);
  const java = ref<JavaInfo | null>(null);
  const systemMemory = ref<SystemMemoryInfo | null>(null);
  const detectingJava = ref(false);
  const installingJava = ref(false);
  const javaInstallProgress = ref<InstallProgress | null>(null);
  const launcherUpdate = ref<LauncherUpdateInfo | null>(null);
  const launcherUpdateChecking = ref(false);
  const launcherUpdateError = ref("");
  const launcherUpdateProgress = ref<LauncherUpdateProgress | null>(null);
  const launcherUpdateInstalling = ref(false);
  const backgroundError = ref("");
  const screenshotPaths = ref<string[]>([]);
  const content = ref<GameContentSummary>({
    mods: 0,
    resourcePacks: 0,
    shaderPacks: 0,
    worlds: 0,
    screenshots: 0,
  });

  const backgroundUrl = computed(() => {
    const path =
      settings.value?.backgroundMediaPath ||
      settings.value?.backgroundImagePath;
    return path ? mediaUrl(path) : null;
  });
  const backgroundKind = computed(() =>
    mediaKind(
      settings.value?.backgroundMediaPath ||
        settings.value?.backgroundImagePath,
    ),
  );
  const galleryUrls = computed(() =>
    (settings.value?.galleryImagePaths ?? []).map((path) => ({
      path,
      url: mediaUrl(path),
    })),
  );
  const screenshotUrls = computed(() =>
    screenshotPaths.value.map((path) => ({ path, url: mediaUrl(path) })),
  );

  async function hydrate(): Promise<void> {
    const state = await window.royale.state.get();
    settings.value = state.settings;
    const [memory, screenshots, summary] = await Promise.allSettled([
      window.royale.app.systemMemory(),
      window.royale.app.screenshots(),
      window.royale.app.contentSummary(),
    ]);
    if (memory.status === "fulfilled") systemMemory.value = memory.value;
    if (screenshots.status === "fulfilled")
      screenshotPaths.value = screenshots.value;
    if (summary.status === "fulfilled") content.value = summary.value;
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  function snapshot(): AppSettings | null {
    return settings.value
      ? (JSON.parse(JSON.stringify(settings.value)) as AppSettings)
      : null;
  }
  function save(): void {
    const value = snapshot();
    if (!value) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(
      () => void window.royale.state.saveSettings(value),
      220,
    );
  }
  async function saveNow(): Promise<void> {
    const value = snapshot();
    if (!value) return;
    if (saveTimer) clearTimeout(saveTimer);
    await window.royale.state.saveSettings(value);
  }

  async function detectJava(): Promise<void> {
    detectingJava.value = true;
    try {
      java.value = await window.royale.java.detect(
        settings.value?.javaPath ?? null,
      );
    } finally {
      detectingJava.value = false;
    }
  }

  async function installJava(): Promise<void> {
    if (installingJava.value) return;
    installingJava.value = true;
    const unsubscribe = window.royale.java.onProgress(
      (progress) => (javaInstallProgress.value = progress),
    );
    try {
      java.value = await window.royale.java.install();
      if (settings.value) settings.value.javaPath = java.value.path;
    } finally {
      unsubscribe();
      installingJava.value = false;
    }
  }

  async function refreshGameContent(): Promise<void> {
    const [screenshots, summary] = await Promise.allSettled([
      window.royale.app.screenshots(),
      window.royale.app.contentSummary(),
    ]);
    if (screenshots.status === "fulfilled")
      screenshotPaths.value = screenshots.value;
    if (summary.status === "fulfilled") content.value = summary.value;
  }

  async function pickStorageFolder(): Promise<void> {
    const dir = await window.royale.app.pickFolder();
    if (dir && settings.value) {
      settings.value.storagePath = dir;
      await saveNow();
    }
  }

  async function pickBackground(): Promise<void> {
    const path = await window.royale.app.pickMedia();
    if (!path || !settings.value) return;
    backgroundError.value = "";
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    // Persist first. The custom media protocol only serves paths already
    // whitelisted in the main-process state; changing the reactive value
    // before IPC completed caused the first request to receive 403 forever.
    const next: AppSettings = {
      ...snapshot()!,
      backgroundMediaPath: path,
      backgroundImagePath: null,
    };
    const persisted = await window.royale.state.saveSettings(next);
    settings.value = persisted.settings;
  }

  async function pickGallery(): Promise<void> {
    const paths = await window.royale.app.pickGallery();
    if (!paths.length || !settings.value) return;
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    const next: AppSettings = {
      ...snapshot()!,
      galleryImagePaths: [...new Set(paths)].slice(0, 12),
    };
    const persisted = await window.royale.state.saveSettings(next);
    settings.value = persisted.settings;
  }

  async function clearBackground(): Promise<void> {
    if (!settings.value) return;
    settings.value.backgroundMediaPath = null;
    settings.value.backgroundImagePath = null;
    backgroundError.value = "";
    await saveNow();
  }

  function backgroundFailed(): void {
    backgroundError.value =
      "Не удалось открыть этот файл. Проверьте, что он не перемещён и использует поддерживаемый кодек.";
  }

  async function clearGallery(): Promise<void> {
    if (!settings.value) return;
    settings.value.galleryImagePaths = [];
    await saveNow();
  }

  async function checkLauncherUpdate(): Promise<void> {
    if (launcherUpdateChecking.value) return;
    launcherUpdateChecking.value = true;
    launcherUpdateError.value = "";
    try {
      launcherUpdate.value = await window.royale.app.checkUpdate();
    } catch (cause) {
      const raw = cause instanceof Error ? cause.message : String(cause);
      launcherUpdateError.value =
        raw
          .replace(/^Error invoking remote method '[^']+':\s*/i, "")
          .replace(/^Error:\s*/i, "")
          .trim()
          .slice(0, 180) || "Сервис обновлений временно недоступен.";
    } finally {
      launcherUpdateChecking.value = false;
    }
  }

  let updateSubscribed = false;
  function subscribeLauncherUpdate(): void {
    if (updateSubscribed) return;
    updateSubscribed = true;
    window.royale.app.onUpdateProgress((progress) => {
      launcherUpdateProgress.value = progress;
      launcherUpdateInstalling.value =
        progress.phase === "downloading" || progress.phase === "installing";
      if (progress.phase === "error")
        launcherUpdateError.value = progress.message;
    });
  }

  async function installLauncherUpdate(): Promise<void> {
    const update = launcherUpdate.value;
    if (!update?.available) {
      await checkLauncherUpdate();
      return;
    }
    if (launcherUpdateInstalling.value) return;
    subscribeLauncherUpdate();
    launcherUpdateError.value = "";
    launcherUpdateProgress.value = {
      phase: "downloading",
      progress: 0,
      downloadedBytes: 0,
      totalBytes: 0,
      message: "Подготавливаем обновление",
    };
    launcherUpdateInstalling.value = true;
    try {
      await window.royale.app.installUpdate();
    } catch (cause) {
      const raw = cause instanceof Error ? cause.message : String(cause);
      launcherUpdateError.value =
        raw
          .replace(/^Error invoking remote method '[^']+':\s*/i, "")
          .replace(/^Error:\s*/i, "")
          .trim()
          .slice(0, 220) || "Не удалось установить обновление.";
      launcherUpdateInstalling.value = false;
    }
  }

  return {
    settings,
    java,
    systemMemory,
    detectingJava,
    backgroundUrl,
    backgroundKind,
    galleryUrls,
    screenshotUrls,
    content,
    installingJava,
    javaInstallProgress,
    launcherUpdate,
    launcherUpdateChecking,
    launcherUpdateError,
    launcherUpdateProgress,
    launcherUpdateInstalling,
    backgroundError,
    hydrate,
    save,
    saveNow,
    detectJava,
    installJava,
    refreshGameContent,
    pickStorageFolder,
    pickBackground,
    pickGallery,
    clearBackground,
    backgroundFailed,
    clearGallery,
    checkLauncherUpdate,
    installLauncherUpdate,
  };
});
