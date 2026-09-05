<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
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
      <div v-else class="ambient-backdrop"><i /><i /><i /></div>
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
            <component :is="Component" :key="$route.fullPath" />
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
  inset: var(--titlebar-h) 0 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background: #090a12;
}
.app-shell > :not(.background-media) {
  position: relative;
  z-index: 1;
}
.background-media::after {
  content: "";
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(
      90deg,
      rgba(9, 10, 18, 0.89),
      rgba(9, 10, 18, 0.46) 52%,
      rgba(9, 10, 18, 0.76)
    ),
    linear-gradient(180deg, rgba(7, 8, 17, 0.1), rgba(7, 8, 17, 0.56));
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
.ambient-backdrop {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(
      720px 520px at 76% 18%,
      rgba(118, 104, 255, 0.24),
      transparent 66%
    ),
    radial-gradient(
      520px 420px at 52% 92%,
      rgba(67, 199, 244, 0.18),
      transparent 68%
    ),
    linear-gradient(140deg, #090a12, #111624 55%, #090a12);
}
.ambient-backdrop::before {
  content: "";
  position: absolute;
  inset: 0;
  opacity: 0.38;
  background-image:
    linear-gradient(
      30deg,
      rgba(118, 104, 255, 0.11) 12%,
      transparent 12.5%,
      transparent 87%,
      rgba(118, 104, 255, 0.11) 87.5%
    ),
    linear-gradient(
      150deg,
      rgba(67, 199, 244, 0.09) 12%,
      transparent 12.5%,
      transparent 87%,
      rgba(67, 199, 244, 0.09) 87.5%
    );
  background-size: 90px 156px;
  mask-image: linear-gradient(90deg, transparent 18%, #000);
}
.ambient-backdrop i {
  position: absolute;
  width: 360px;
  height: 360px;
  border: 1px solid rgba(94, 216, 121, 0.14);
  transform: rotate(45deg);
  animation: float-shape 12s ease-in-out infinite;
}
.ambient-backdrop i:nth-child(1) {
  right: 12%;
  top: 2%;
}
.ambient-backdrop i:nth-child(2) {
  right: -4%;
  bottom: -30%;
  animation-delay: -4s;
}
.ambient-backdrop i:nth-child(3) {
  left: 35%;
  bottom: -44%;
  animation-delay: -8s;
}
@keyframes media-in {
  from {
    opacity: 0;
    transform: scale(1.025);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes float-shape {
  50% {
    transform: rotate(48deg) translateY(-18px);
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
  background: rgba(9, 10, 18, 0.62);
  backdrop-filter: blur(3px);
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
