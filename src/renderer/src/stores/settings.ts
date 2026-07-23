import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type {
  AppSettings,
  GameContentSummary,
  InstallProgress,
  JavaInfo,
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
    settings.value.backgroundMediaPath = path;
    settings.value.backgroundImagePath = null;
    await saveNow();
  }

  async function pickGallery(): Promise<void> {
    const paths = await window.royale.app.pickGallery();
    if (!paths.length || !settings.value) return;
    settings.value.galleryImagePaths = [...new Set(paths)].slice(0, 12);
    await saveNow();
  }

  async function clearBackground(): Promise<void> {
    if (!settings.value) return;
    settings.value.backgroundMediaPath = null;
    settings.value.backgroundImagePath = null;
    await saveNow();
  }

  async function clearGallery(): Promise<void> {
    if (!settings.value) return;
    settings.value.galleryImagePaths = [];
    await saveNow();
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
    clearGallery,
  };
});
