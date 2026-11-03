<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch, watchEffect } from "vue";
import { useRouter } from "vue-router";
import TitleBar from "./components/TitleBar.vue";
import SideBar from "./components/SideBar.vue";
import BootScreen from "./components/BootScreen.vue";
import OnboardingFlow from "./components/OnboardingFlow.vue";
import CrashDialog from "./components/CrashDialog.vue";
import { useAccountStore } from "./stores/account";
import { useSettingsStore } from "./stores/settings";
import { useLauncherStore } from "./stores/launcher";
import { useModsStore } from "./stores/mods";
import { useInstancesStore } from "./stores/instances";

const account = useAccountStore();
const settings = useSettingsStore();
const launcher = useLauncherStore();
const mods = useModsStore();
const instances = useInstancesStore();
const router = useRouter();

const ready = ref(false);
const showOnboarding = computed(
  () => ready.value && settings.settings?.onboardingCompleted === false,
);
const navigating = ref(false);
// While Minecraft runs or the window is minimised the launcher only has to wait: the background video and the
// decorative animations stop, so the GPU and CPU go to the game.
const windowHidden = ref(document.hidden);
const quiet = computed(() => windowHidden.value || launcher.runningCount > 0);
const videoBackground = computed(
  () => Boolean(settings.backgroundUrl) && settings.backgroundKind === "video",
);
const backgroundVideo = ref<HTMLVideoElement | null>(null);
function syncVisibility(): void {
  windowHidden.value = document.hidden;
}
// On <html>, so dialogs teleported to <body> follow too (main.scss).
watchEffect(() => {
  document.documentElement.classList.toggle("video-bg", videoBackground.value);
  document.documentElement.classList.toggle("quiet", quiet.value);
});
watch([quiet, backgroundVideo], ([isQuiet, video]) => {
  if (!video) return;
  if (isQuiet) video.pause();
  else void video.play().catch(() => undefined);
});
let navigationTimer: ReturnType<typeof setTimeout> | null = null;
let navigationDoneTimer: ReturnType<typeof setTimeout> | null = null;
let removeOpenModpackListener: (() => void) | null = null;

async function refreshActiveInstance(): Promise<void> {
  await launcher.hydrate();
  await Promise.allSettled([
    mods.loadInstalled(),
    settings.refreshGameContent(),
  ]);
}

const removeBeforeGuard = router.beforeEach((to, from) => {
  if (to.fullPath === from.fullPath) return;
  if (navigationTimer) clearTimeout(navigationTimer);
  navigationTimer = setTimeout(() => (navigating.value = true), 80);
});
const removeAfterGuard = router.afterEach((to) => {
  if (navigationTimer) clearTimeout(navigationTimer);
  if (navigationDoneTimer) clearTimeout(navigationDoneTimer);
  navigationDoneTimer = setTimeout(() => (navigating.value = false), 35);
  void nextTick(() => {
    document
      .querySelector<HTMLElement>(".content")
      ?.scrollTo({ top: 0, left: 0, behavior: "auto" });
  });
  const activity =
    to.name === "mods"
      ? "Просматривает моды"
      : to.name === "resources"
        ? "Выбирает ресурспаки"
        : to.name === "shaders"
          ? "Выбирает шейдеры"
        : to.name === "account"
          ? "Настраивает профиль"
          : to.name === "settings"
            ? "Настраивает лаунчер"
            : "В главном меню";
  void window.royale.discord.activity(activity);
});
// Load persisted state and wire up IPC event subscriptions once, at startup.
// The BootScreen stays up until the essential state has hydrated.
onMounted(async () => {
  try {
    await Promise.all([
      account.hydrate(),
      settings.hydrate(),
      instances.hydrate(),
    ]);
    await launcher.hydrate();
    mods.subscribe();
    removeOpenModpackListener = window.royale.modpacks.onOpen((path) => {
      void router.push({ path: "/mods", query: { tab: "installed" } });
      void mods.importPack(path);
    });
    void settings.detectJava();
    void settings.checkLauncherUpdate();
    window.addEventListener("royale:instance-changed", refreshActiveInstance);
    document.addEventListener("visibilitychange", syncVisibility);
  } finally {
    ready.value = true;
  }
});
onBeforeUnmount(() => {
  removeBeforeGuard();
  removeAfterGuard();
  if (navigationTimer) clearTimeout(navigationTimer);
  if (navigationDoneTimer) clearTimeout(navigationDoneTimer);
  removeOpenModpackListener?.();
  window.removeEventListener("royale:instance-changed", refreshActiveInstance);
  document.removeEventListener("visibilitychange", syncVisibility);
});
</script>

<template>
  <BootScreen :ready="ready" />
  <OnboardingFlow v-if="showOnboarding" />
  <CrashDialog />
  <div class="app-shell">
    <div class="background-media" aria-hidden="true">
      <video
        v-if="settings.backgroundUrl && settings.backgroundKind === 'video'"
        ref="backgroundVideo"
        :key="settings.backgroundUrl"
        :src="settings.backgroundUrl"
        autoplay
        muted
        loop
        playsinline
        preload="auto"
        :style="{ objectFit: settings.settings?.backgroundFit || 'cover' }"
        @error="settings.backgroundFailed()"
      />
      <img
        v-else-if="settings.backgroundUrl"
        class="background-image"
        :src="settings.backgroundUrl"
        alt=""
        :style="{
          objectFit: settings.settings?.backgroundFit || 'cover',
        }"
        @error="settings.backgroundFailed()"
      />
      <div v-else class="ambient-backdrop" />
    </div>
    <TitleBar />
    <div class="body">
      <SideBar />
      <main class="content">
        <Transition name="route-loading">
          <div v-if="navigating" class="route-loading" aria-live="polite">
            <span><i /><i /><i /></span>
            <b>Загружаем раздел</b>
          </div>
        </Transition>
        <RouterView v-slot="{ Component }">
          <Transition name="slide" mode="out-in" appear>
            <!-- The account page keeps its 3D skin viewer (a WebGL context and compiled shaders) between visits. -->
            <KeepAlive include="AccountView">
              <component :is="Component" :key="$route.fullPath" />
            </KeepAlive>
          </Transition>
        </RouterView>
      </main>
    </div>
  </div>
</template>

<style scoped lang="scss">
.app-shell {
  position: relative;
  isolation: isolate;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: transparent;
}
.background-media {
  position: absolute;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background: var(--surface-0);
}
.app-shell > :not(.background-media) {
  position: relative;
  z-index: 1;
}
// Custom wallpapers keep a readable left side (where the text sits) and a dim lower edge.
.background-media:has(video, img)::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(
      90deg,
      rgba(10, 13, 21, 0.9),
      rgba(10, 13, 21, 0.5) 55%,
      rgba(10, 13, 21, 0.72)
    ),
    linear-gradient(180deg, rgba(10, 13, 21, 0.2), rgba(10, 13, 21, 0.6));
}
.background-media video,
.background-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  animation: media-in 0.24s var(--ease) both;
}
.background-image {
  display: block;
  object-position: center;
}
// Drawn once: two soft lights in the Sail's colours over the navy base, nothing animated.
.ambient-backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      900px 620px at 88% -8%,
      rgba(117, 108, 255, 0.2),
      transparent 64%
    ),
    radial-gradient(
      700px 520px at 62% 112%,
      rgba(92, 203, 255, 0.1),
      transparent 66%
    ),
    var(--surface-0);
}
@keyframes media-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.content {
  position: relative;
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  overflow-x: hidden;
}
.route-loading {
  position: absolute;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 11px;
  color: var(--text-2);
  background: rgba(10, 13, 21, 0.55);
}
.route-loading > span {
  display: flex;
  gap: 5px;
}
.route-loading i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--green);
  animation: route-dot 0.85s ease-in-out infinite alternate;
}
.route-loading i:nth-child(2) {
  animation-delay: 0.13s;
}
.route-loading i:nth-child(3) {
  animation-delay: 0.26s;
}
.route-loading b {
  font-size: 11px;
  letter-spacing: 0.03em;
}
.route-loading-enter-active,
.route-loading-leave-active {
  transition: opacity 0.14s var(--ease);
}
.route-loading-enter-from,
.route-loading-leave-to {
  opacity: 0;
}
@keyframes route-dot {
  to {
    opacity: 0.28;
    transform: translateY(-5px);
  }
}
</style>
