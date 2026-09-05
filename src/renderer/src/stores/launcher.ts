import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { GAME } from "@shared/constants";
import type {
  ClientUpdateInfo,
  InstallProgress,
  LaunchStatus,
} from "@shared/types";
import { useAccountStore } from "./account";

export type InstallState =
  | "not-installed"
  | "downloading"
  | "paused"
  | "installed"
  | "launching"
  | "running";

function userFacingError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const cleaned = raw
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
  if (!cleaned || /^aggregate\s*error$/i.test(cleaned))
    return "Не удалось подключиться к серверу загрузки. Проверьте интернет и повторите попытку.";
  return cleaned.length > 280 ? `${cleaned.slice(0, 277)}…` : cleaned;
}

/**
 * Launcher state backed by the real main-process pipeline: install downloads
 * Minecraft + Fabric (+ the Royale client mod), launch spawns the JVM. Progress
 * and launch status arrive as IPC events.
 */
export const useLauncherStore = defineStore("launcher", () => {
  const state = ref<InstallState>("not-installed");
  const progress = ref(0);
  const statusText = ref("");
  const errorText = ref("");
  const installProgress = ref<InstallProgress | null>(null);
  const updateInfo = ref<ClientUpdateInfo | null>(null);
  const updateChecking = ref(false);
  const updateError = ref("");
  const updateCheckedAt = ref<number | null>(null);
  const crash = ref<LaunchStatus | null>(null);
  const transportBusy = ref(false);

  const playtimeMinutes = ref(0);
  const lastPlayed = ref<number | null>(null);

  const version = computed(() => GAME.minecraftVersion);
  const isInstalled = computed(() =>
    ["installed", "launching", "running"].includes(state.value),
  );

  const playtimeLabel = computed(() => {
    const m = playtimeMinutes.value;
    if (m <= 0) return "—";
    const h = Math.floor(m / 60);
    return h > 0 ? `${h} ч ${m % 60} мин` : `${m} мин`;
  });

  const lastPlayedLabel = computed(() => {
    if (!lastPlayed.value) return "Ещё не запускали";
    const diff = Date.now() - lastPlayed.value;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Только что";
    if (mins < 60) return `${mins} мин назад`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} ч назад`;
    return `${Math.floor(hours / 24)} дн назад`;
  });

  let unsubProgress: (() => void) | null = null;
  let unsubLaunch: (() => void) | null = null;
  let unsubJava: (() => void) | null = null;
  let pauseRequested = false;

  /** Load persisted stats + install status and subscribe to backend events. */
  async function hydrate(): Promise<void> {
    const s = await window.royale.state.get();
    playtimeMinutes.value = s.stats.playtimeMinutes;
    lastPlayed.value = s.stats.lastPlayed;
    if (s.stats.installed) state.value = "installed";
    void checkUpdate();

    unsubProgress?.();
    unsubProgress = window.royale.game.onProgress((p: InstallProgress) => {
      installProgress.value = p;
      progress.value = Math.round(p.progress * 100);
      if (
        !pauseRequested ||
        ["paused", "idle", "error", "done"].includes(p.phase)
      )
        statusText.value = p.message;
      if (p.phase === "paused") {
        pauseRequested = true;
        state.value = "paused";
      } else if (p.phase === "idle") {
        pauseRequested = false;
        state.value = s.stats.installed ? "installed" : "not-installed";
        installProgress.value = null;
        progress.value = 0;
        statusText.value = "";
        errorText.value = "";
      } else if (p.phase === "error") {
        pauseRequested = false;
        errorText.value = userFacingError(p.detail || p.message);
        state.value = s.stats.installed ? "installed" : "not-installed";
      } else if (p.phase === "done") {
        pauseRequested = false;
        state.value = "installed";
        statusText.value = "";
        progress.value = 0;
        void checkUpdate();
      } else {
        state.value = pauseRequested ? "paused" : "downloading";
      }
    });

    unsubJava?.();
    unsubJava = window.royale.java.onProgress((p: InstallProgress) => {
      if (state.value !== "downloading") return;
      installProgress.value = p;
      progress.value = Math.round(p.progress * 7);
      statusText.value = p.message;
    });

    unsubLaunch?.();
    unsubLaunch = window.royale.game.onLaunchStatus((st: LaunchStatus) => {
      switch (st.state) {
        case "launching":
          state.value = "launching";
          statusText.value = st.message || "Подготовка запуска";
          break;
        case "running":
          state.value = "running";
          statusText.value = "Игра запущена";
          break;
        case "exited":
        case "crashed":
          state.value = "installed";
          statusText.value = "";
          if (st.state === "crashed") {
            crash.value = st;
            errorText.value = "";
          }
          void refreshStats();
          break;
        case "error":
          state.value = "installed";
          statusText.value = "";
          errorText.value = userFacingError(st.message || "Ошибка запуска");
          break;
      }
    });
  }

  async function refreshStats(): Promise<void> {
    const s = await window.royale.state.get();
    playtimeMinutes.value = s.stats.playtimeMinutes;
    lastPlayed.value = s.stats.lastPlayed;
  }

  async function install(): Promise<void> {
    if (state.value === "downloading" || state.value === "paused") return;
    pauseRequested = false;
    errorText.value = "";
    state.value = "downloading";
    progress.value = 0;
    statusText.value = "Начало установки…";
    try {
      await window.royale.game.install();
    } catch (e) {
      errorText.value = userFacingError(e);
      const persisted = await window.royale.state.get();
      state.value = persisted.stats.installed ? "installed" : "not-installed";
    }
  }

  async function pause(): Promise<void> {
    if (state.value !== "downloading" || transportBusy.value) return;
    pauseRequested = true;
    transportBusy.value = true;
    state.value = "paused";
    statusText.value = "Приостанавливаем загрузку…";
    try {
      if (await window.royale.game.pause()) {
        state.value = "paused";
        statusText.value = "Загрузка приостановлена";
      } else {
        pauseRequested = false;
        state.value = "downloading";
        statusText.value = "Загрузка продолжается";
      }
    } catch (cause) {
      pauseRequested = false;
      state.value = "downloading";
      errorText.value = userFacingError(cause);
    } finally {
      transportBusy.value = false;
    }
  }

  async function resume(): Promise<void> {
    if (state.value !== "paused" || transportBusy.value) return;
    pauseRequested = false;
    transportBusy.value = true;
    state.value = "downloading";
    statusText.value = "Продолжаем загрузку…";
    try {
      if (await window.royale.game.resume()) {
        state.value = "downloading";
        statusText.value = "Загрузка продолжена";
      } else {
        pauseRequested = true;
        state.value = "paused";
        statusText.value = "Загрузка приостановлена";
      }
    } catch (cause) {
      pauseRequested = true;
      state.value = "paused";
      errorText.value = userFacingError(cause);
    } finally {
      transportBusy.value = false;
    }
  }

  async function cancel(): Promise<void> {
    if (!["downloading", "paused"].includes(state.value)) return;
    const previousState = state.value;
    pauseRequested = false;
    transportBusy.value = true;
    errorText.value = "";
    statusText.value = "Останавливаем установку…";
    try {
      await window.royale.game.cancel();
      const persisted = await window.royale.state.get();
      state.value = persisted.stats.installed ? "installed" : "not-installed";
      installProgress.value = null;
      progress.value = 0;
      statusText.value = "";
    } catch (cause) {
      pauseRequested = previousState === "paused";
      state.value = previousState;
      errorText.value = userFacingError(cause);
    } finally {
      transportBusy.value = false;
    }
  }

  async function checkUpdate(): Promise<void> {
    if (updateChecking.value) return;
    updateChecking.value = true;
    updateError.value = "";
    try {
      updateInfo.value = await window.royale.game.checkUpdate();
    } catch (error) {
      updateError.value =
        userFacingError(error) || "Сервис обновлений недоступен";
    } finally {
      updateCheckedAt.value = Date.now();
      updateChecking.value = false;
    }
  }

  async function play(): Promise<void> {
    if (state.value !== "installed") return;
    const accountStore = useAccountStore();
    let account = accountStore.active;
    if (!account) {
      errorText.value = "Сначала добавьте учётную запись";
      return;
    }
    errorText.value = "";
    crash.value = null;
    try {
      account = await accountStore.ensureActiveSession();
      if (!account) throw new Error("Не удалось подготовить учётную запись");
      await window.royale.game.launch({
        id: account.id,
        username: account.username,
        uuid: account.uuid,
        type: account.type,
        skinModel: account.skinModel,
        accessToken: account.accessToken,
      });
    } catch (e) {
      errorText.value = userFacingError(e);
      state.value = "installed";
    }
  }

  async function stopLaunch(): Promise<void> {
    if (state.value !== "launching" || transportBusy.value) return;
    transportBusy.value = true;
    errorText.value = "";
    statusText.value = "Останавливаем запуск…";
    try {
      const stopped = await window.royale.game.cancelLaunch();
      if (!stopped) {
        state.value = "installed";
        statusText.value = "";
      }
    } catch (error) {
      errorText.value = userFacingError(error);
    } finally {
      transportBusy.value = false;
    }
  }

  return {
    state,
    progress,
    statusText,
    errorText,
    installProgress,
    updateInfo,
    updateChecking,
    updateError,
    updateCheckedAt,
    crash,
    transportBusy,
    version,
    isInstalled,
    playtimeMinutes,
    playtimeLabel,
    lastPlayedLabel,
    hydrate,
    refreshStats,
    install,
    pause,
    resume,
    cancel,
    checkUpdate,
    play,
    stopLaunch,
    dismissCrash: () => {
      crash.value = null;
    },
  };
});
