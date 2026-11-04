<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import Icon from "@/components/Icon.vue";
import LoaderLogo from "@/components/LoaderLogo.vue";
import { LOADERS, targetOf } from "@shared/targets";
import { useLauncherStore } from "@/stores/launcher";
import { useAccountStore } from "@/stores/account";
import { useSettingsStore } from "@/stores/settings";
import { useModsStore } from "@/stores/mods";
import { useResourcesStore } from "@/stores/resources";
import { useShadersStore } from "@/stores/shaders";
import { useInstancesStore } from "@/stores/instances";
import generatedLogo from "@/assets/images/vela-logo.png";
import { useLocale } from "@/composables/useLocale";

const router = useRouter();
const launcher = useLauncherStore();
const account = useAccountStore();
const settings = useSettingsStore();
const mods = useModsStore();
const resources = useResourcesStore();
const shaders = useShadersStore();
const instances = useInstancesStore();

/** Version, loader and Java of the selected instance; every label below follows it. */
const stack = computed(() => targetOf(useInstancesStore().active));
const { tr } = useLocale();
const slide = ref(0);
const galleryHovered = ref(false);
const galleryExpanded = ref(false);
let carouselTimer: ReturnType<typeof setInterval> | null = null;
let contentRefreshTimer: ReturnType<typeof setInterval> | null = null;
const runningMenuOpen = ref(false);
let runningMenuTimer: ReturnType<typeof setTimeout> | null = null;
function showRunningMenu(): void {
  if (launcher.state !== "running" || runningMenuTimer) return;
  runningMenuTimer = setTimeout(() => {
    runningMenuTimer = null;
    if (launcher.state === "running") runningMenuOpen.value = true;
  }, 1000);
}
function hideRunningMenu(): void {
  if (runningMenuTimer) clearTimeout(runningMenuTimer);
  runningMenuTimer = null;
  runningMenuOpen.value = false;
}
function launchAnother(): void {
  hideRunningMenu();
  void launcher.play();
}

const busy = computed(
  () =>
    launcher.state === "running" ||
    (launcher.state === "downloading" &&
      launcher.installProgress?.canPause === false) ||
    account.refreshing,
);
const gallery = computed(() => settings.screenshotUrls);
const currentSlide = computed(() => gallery.value[slide.value] ?? null);
const modPreview = computed(() => mods.installed.slice(0, 4));
const resourcePreview = computed(() => resources.installed.slice(0, 4));
const shaderPreview = computed(() => shaders.installed.slice(0, 4));
const worldPreview = computed(() => settings.content.worldItems.slice(0, 4));
const instanceTitle = computed(() => {
  const words = (instances.active?.name || "Vela")
    .trim()
    .split(/\s+/);
  if (words.length === 1) return { base: words[0], accent: "" };
  return {
    base: words.slice(0, -1).join(" "),
    accent: words.at(-1) ?? "",
  };
});
const actionLabel = computed(() => {
  if (launcher.state === "paused")
    return tr("Продолжить", "Resume", "Continuar");
  if (
    launcher.state === "downloading" &&
    launcher.installProgress?.canPause === false
  )
    return (
      launcher.statusText ||
      tr("Подготовка файлов…", "Preparing files…", "Preparando archivos…")
    );
  if (launcher.state === "not-installed")
    return tr("Установить", "Install", "Instalar");
  if (launcher.state === "downloading")
    return (
      launcher.statusText || tr("Загрузка…", "Downloading…", "Descargando…")
    );
  if (launcher.state === "launching")
    return tr("Остановить запуск", "Stop launch", "Detener inicio");
  if (account.refreshing) return tr("Подготовка…", "Preparing…", "Preparando…");
  if (launcher.state === "running")
    return tr("Игра запущена", "Game is running", "Juego iniciado");
  if (launcher.updateInfo?.available)
    return tr("Обновить", "Update", "Actualizar");
  if (!account.active)
    return tr("Выбрать аккаунт", "Choose account", "Elegir cuenta");
  return tr("Запустить", "Play", "Jugar");
});
const actionIcon = computed(() =>
  launcher.state === "paused"
    ? "play"
    : launcher.state === "downloading"
      ? launcher.installProgress?.canPause === false
        ? "spinner"
        : "pause"
      : launcher.state === "not-installed" || launcher.updateInfo?.available
        ? "download"
        : launcher.state === "launching"
          ? "stop"
          : launcher.state === "running"
            ? "check"
            : !account.active
              ? "user"
              : "play",
);
const actionSecondary = computed(() => {
  if (["downloading", "paused"].includes(launcher.state)) {
    const parts = [`${Math.floor(launcher.progress)}%`];
    if (launcher.installProgress?.bytesPerSecond)
      parts.push(`${formatBytes(launcher.installProgress.bytesPerSecond)}/с`);
    return parts.join(" · ");
  }
  if (launcher.state === "launching" || account.refreshing)
    return launcher.statusText;
  if (launcher.updateInfo?.available)
    return `Vela ${launcher.updateInfo.remoteVersion}`;
  return "";
});

function launch(): void {
  if (launcher.state === "downloading") void launcher.pause();
  else if (launcher.state === "paused") void launcher.resume();
  else if (launcher.state === "launching") void launcher.stopLaunch();
  else if (launcher.state === "not-installed" || launcher.updateInfo?.available)
    void launcher.install();
  else if (launcher.state === "installed" && !account.active)
    void router.push("/account");
  else if (launcher.state === "installed") void launcher.play();
}
function formatBytes(value?: number): string {
  if (!value) return "";
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} КБ`;
  return `${(value / 1024 / 1024).toFixed(1)} МБ`;
}
function moveSlide(direction: number): void {
  if (!gallery.value.length) return;
  slide.value =
    (slide.value + direction + gallery.value.length) % gallery.value.length;
}
function russianCount(
  count: number,
  one: string,
  few: string,
  many: string,
): string {
  const tens = count % 100;
  const units = count % 10;
  const word =
    tens >= 11 && tens <= 14
      ? many
      : units === 1
        ? one
        : units >= 2 && units <= 4
          ? few
          : many;
  return `${count} ${word}`;
}
function refreshOnFocus(): void {
  void settings.refreshGameContent();
}
onMounted(() => {
  void settings.refreshGameContent();
  void Promise.allSettled([
    mods.loadInstalled(),
    resources.loadInstalled(),
    shaders.loadInstalled(),
  ]);
  void window.royale.discord.activity("В главном меню");
  carouselTimer = setInterval(() => {
    if (!galleryHovered.value && !document.hidden) moveSlide(1);
  }, 6000);
  // Minecraft can add an F2 screenshot while the launcher stays open. Refresh the summary while someone can see
  // it, and right away when the window comes back; a minimised launcher does not scan folders.
  contentRefreshTimer = setInterval(() => {
    if (!document.hidden) void settings.refreshGameContent();
  }, 15000);
  window.addEventListener("focus", refreshOnFocus);
});
onBeforeUnmount(() => {
  hideRunningMenu();
  if (carouselTimer) clearInterval(carouselTimer);
  if (contentRefreshTimer) clearInterval(contentRefreshTimer);
  window.removeEventListener("focus", refreshOnFocus);
});
</script>

<template>
  <div class="home">
    <section class="hero">
      <img class="hero-sail" :src="generatedLogo" alt="" draggable="false" />
      <header class="hero-top">
        <span class="hero-tag"
          ><span class="tag-fabric" :class="stack.loader"
            ><LoaderLogo :loader="stack.loader" /></span
          >Minecraft {{ stack.minecraftVersion }} · {{ LOADERS[stack.loader].title }}</span
        >
        <RouterLink to="/account" class="profile-chip">
          <span class="avatar"
            ><img
              v-if="account.active && !settings.settings?.streamerMode"
              :src="account.avatar"
              alt="" /><Icon v-else name="user" :size="18"
          /></span>
          <span class="profile-copy"
            ><b>{{
              settings.settings?.streamerMode && account.active
                ? tr("Профиль скрыт", "Profile hidden", "Perfil oculto")
                : account.active?.username ||
                  tr("Добавить аккаунт", "Add account", "Añadir cuenta")
            }}</b
            ><small>{{
              settings.settings?.streamerMode && account.active
                ? tr("Режим стримера", "Streamer mode", "Modo streamer")
                : account.active?.type === "ely"
                  ? "Ely.by"
                  : account.active?.type === "littleskin"
                    ? "LittleSkin"
                    : account.active
                      ? tr(
                          "Автономный профиль",
                          "Offline profile",
                          "Perfil sin conexión",
                        )
                      : tr(
                          "Профиль не выбран",
                          "No profile selected",
                          "Perfil no seleccionado",
                        )
            }}</small></span
          ><Icon name="chevron" :size="15" />
        </RouterLink>
      </header>

      <div class="hero-body">
        <h1>
          {{ instanceTitle.base }}
          <span v-if="instanceTitle.accent">{{ instanceTitle.accent }}</span>
        </h1>
        <p class="instance-description">
          {{
            tr(
              `Готовая клиентская сборка для Minecraft ${stack.minecraftVersion} на ${LOADERS[stack.loader].title}`,
              `A ready-to-play Minecraft ${stack.minecraftVersion} client on ${LOADERS[stack.loader].title}`,
              `Cliente de Minecraft ${stack.minecraftVersion} en ${LOADERS[stack.loader].title} listo para jugar`,
            )
          }}
        </p>

        <div
          class="launch-zone"
          @mouseleave="hideRunningMenu"
          @keydown.esc="hideRunningMenu"
        >
          <Transition name="fade">
            <div
              v-if="runningMenuOpen && launcher.state === 'running'"
              class="running-context"
              role="menu"
            >
              <button role="menuitem" @click="launchAnother">
                <Icon name="play" :size="16" />Запустить
              </button>
            </div>
          </Transition>
          <div
            class="launch-pill"
            :class="{
              busy,
              installing: ['downloading', 'paused'].includes(launcher.state),
              paused: launcher.state === 'paused',
              transporting: launcher.transportBusy,
            }"
          >
            <span
              v-if="
                launcher.state === 'downloading' || launcher.state === 'paused'
              "
              class="progress"
              :style="{ transform: `scaleX(${launcher.progress / 100})` }"
            />
            <button
              class="launch-main-action"
              :disabled="busy || launcher.transportBusy"
              @click="launch"
            >
              <span class="play-orb"
                ><Icon
                  :name="actionIcon"
                  :size="20"
                  :class="{
                    spin:
                      account.refreshing ||
                      (launcher.state === 'downloading' &&
                        launcher.installProgress?.canPause === false),
                  }" /></span
              ><span class="launch-action-copy"
                ><b>{{ actionLabel }}</b
                ><small v-if="actionSecondary">{{
                  actionSecondary
                }}</small></span
              >
            </button>
            <button
              class="launch-settings"
              :disabled="launcher.transportBusy"
              :title="
                ['downloading', 'paused'].includes(launcher.state)
                  ? 'Остановить установку'
                  : 'Открыть настройки'
              "
              @focus="showRunningMenu"
              @mouseenter="showRunningMenu"
              @click.stop="
                ['downloading', 'paused'].includes(launcher.state)
                  ? launcher.cancel()
                  : router.push('/settings')
              "
            >
              <Icon
                :name="
                  ['downloading', 'paused'].includes(launcher.state)
                    ? 'close'
                    : 'settings'
                "
                :size="18"
              />
            </button>
          </div>
        </div>
        <Transition name="fade"
          ><p v-if="launcher.errorText" class="launch-error">
            <Icon name="alert" :size="16" />{{ launcher.errorText }}
          </p></Transition
        >
      </div>

      <dl class="hero-stats">
        <div>
          <dt>
            <Icon name="clock" :size="14" />{{
              tr("Время в игре", "Playtime", "Tiempo jugado")
            }}
          </dt>
          <dd>{{ launcher.playtimeLabel }}</dd>
        </div>
        <div>
          <dt>
            <Icon name="refresh" :size="14" />{{
              tr("Последний запуск", "Last played", "Última sesión")
            }}
          </dt>
          <dd>{{ launcher.lastPlayedLabel }}</dd>
        </div>
        <div>
          <dt>
            <Icon name="mods" :size="14" />{{ tr("Моды", "Mods", "Mods") }}
          </dt>
          <dd>{{ settings.content.mods }}</dd>
        </div>
      </dl>
    </section>

    <section
      class="content-dashboard"
      @mouseenter="galleryHovered = true"
      @mouseleave="galleryHovered = false"
    >
      <article
        class="dashboard-card mods-card"
        @click="router.push('/mods?tab=installed')"
      >
        <header>
          <span class="card-icon"><Icon name="mods" :size="17" /></span>
          <span class="card-title">{{ tr("Моды", "Mods", "Mods") }}</span>
          <Icon name="chevron" :size="15" class="card-arrow" />
        </header>
        <div class="card-count">
          <b>{{ settings.content.mods }}</b>
          <span>{{
            russianCount(settings.content.mods, "мод", "мода", "модов").replace(
              /^\d+\s/,
              "",
            )
          }}</span>
        </div>
        <div class="content-icons" aria-label="Установленные моды">
          <span
            v-for="item in modPreview"
            :key="item.filename"
            :title="item.title || item.filename"
          >
            <img v-if="item.iconUrl" :src="item.iconUrl" alt="" />
            <Icon v-else name="mods" :size="13" />
          </span>
          <b v-if="settings.content.mods > modPreview.length">
            +{{ settings.content.mods - modPreview.length }}
          </b>
        </div>
      </article>

      <article class="dashboard-card worlds-card">
        <header>
          <span class="card-icon"><Icon name="globe" :size="17" /></span>
          <span class="card-title">{{ tr("Миры", "Worlds", "Mundos") }}</span>
        </header>
        <div class="card-count">
          <b>{{ settings.content.worlds }}</b
          ><span>{{
            russianCount(
              settings.content.worlds,
              "мир",
              "мира",
              "миров",
            ).replace(/^\d+\s/, "")
          }}</span>
        </div>
        <div class="content-icons" aria-label="Миры">
          <span
            v-for="item in worldPreview"
            :key="item.name"
            :title="item.name"
          >
            <img v-if="item.iconDataUrl" :src="item.iconDataUrl" alt="" />
            <Icon v-else name="globe" :size="12" />
          </span>
          <b v-if="settings.content.worlds > worldPreview.length">
            +{{ settings.content.worlds - worldPreview.length }}
          </b>
        </div>
      </article>

      <article
        class="dashboard-card shaders-card"
        @click="router.push('/shaders?tab=installed')"
      >
        <header>
          <span class="card-icon"><Icon name="sparkles" :size="17" /></span>
          <span class="card-title">{{
            tr("Шейдеры", "Shaders", "Shaders")
          }}</span>
          <Icon name="chevron" :size="15" class="card-arrow" />
        </header>
        <div class="card-count">
          <b>{{ settings.content.shaderPacks }}</b
          ><span>{{
            russianCount(
              settings.content.shaderPacks,
              "набор",
              "набора",
              "наборов",
            ).replace(/^\d+\s/, "")
          }}</span>
        </div>
        <div class="content-icons" aria-label="Установленные шейдеры">
          <span
            v-for="item in shaderPreview"
            :key="item.filename"
            :title="item.title || item.filename"
          >
            <img v-if="item.iconUrl" :src="item.iconUrl" alt="" />
            <Icon v-else name="sparkles" :size="12" />
          </span>
          <b v-if="settings.content.shaderPacks > shaderPreview.length">
            +{{ settings.content.shaderPacks - shaderPreview.length }}
          </b>
        </div>
      </article>

      <article
        class="dashboard-card resources-card"
        @click="router.push('/resources?tab=installed')"
      >
        <header>
          <span class="card-icon"><Icon name="palette" :size="17" /></span>
          <span class="card-title">{{
            tr("Ресурсы", "Resources", "Recursos")
          }}</span>
          <Icon name="chevron" :size="15" class="card-arrow" />
        </header>
        <div class="card-count">
          <b>{{ settings.content.resourcePacks }}</b
          ><span>{{
            russianCount(
              settings.content.resourcePacks,
              "набор",
              "набора",
              "наборов",
            ).replace(/^\d+\s/, "")
          }}</span>
        </div>
        <div class="content-icons" aria-label="Установленные ресурспаки">
          <span
            v-for="item in resourcePreview"
            :key="item.filename"
            :title="item.title || item.filename"
          >
            <img v-if="item.iconUrl" :src="item.iconUrl" alt="" />
            <Icon v-else name="palette" :size="13" />
          </span>
          <b v-if="settings.content.resourcePacks > resourcePreview.length">
            +{{ settings.content.resourcePacks - resourcePreview.length }}
          </b>
        </div>
      </article>

      <article class="dashboard-card screenshots-card">
        <Transition name="gallery" mode="out-in">
          <img
            v-if="currentSlide"
            :key="currentSlide.url"
            :src="currentSlide.url"
            alt="Скриншот Vela"
            decoding="async"
          />
        </Transition>
        <div class="screenshot-shade" />
        <header>
          <span class="card-icon"><Icon name="gallery" :size="17" /></span>
          <span class="card-title">{{
            tr("Галерея", "Gallery", "Galería")
          }}</span>
          <small v-if="gallery.length"
            >{{ slide + 1 }} / {{ gallery.length }}</small
          >
          <button title="Развернуть галерею" @click="galleryExpanded = true">
            <Icon name="expand" :size="15" />
          </button>
        </header>
        <div v-if="!gallery.length" class="empty-gallery">
          <Icon name="gallery" :size="28" />
          <b>{{
            tr("Пока нет снимков", "No screenshots yet", "Aún no hay capturas")
          }}</b>
          <small>{{
            tr(
              "Нажмите F2 в игре — снимок появится здесь.",
              "Press F2 in game and the shot shows up here.",
              "Pulsa F2 en el juego y la captura aparecerá aquí.",
            )
          }}</small>
        </div>
        <template v-else>
          <div class="gallery-actions">
            <button @click="moveSlide(-1)">
              <Icon name="back" :size="17" />
            </button>
            <button @click="moveSlide(1)">
              <Icon name="chevron" :size="17" />
            </button>
          </div>
          <nav v-if="gallery.length > 1">
            <button
              v-for="(_, index) in gallery.slice(0, 12)"
              :key="index"
              :class="{ active: index === slide }"
              @click="slide = index"
            />
          </nav>
        </template>
      </article>
    </section>

    <Teleport to="body">
      <Transition name="gallery-modal">
        <div
          v-if="galleryExpanded"
          class="gallery-lightbox"
          @click.self="galleryExpanded = false"
        >
          <section>
            <header>
              <div>
                <Icon name="gallery" :size="19" />
                <span
                  ><b>{{
                    tr(
                      "Галерея скриншотов",
                      "Screenshot gallery",
                      "Galería de capturas",
                    )
                  }}</b
                  ><small v-if="gallery.length"
                    >{{ slide + 1 }} / {{ gallery.length }}</small
                  ></span
                >
              </div>
              <button title="Закрыть" @click="galleryExpanded = false">
                <Icon name="close" :size="19" />
              </button>
            </header>
            <div class="lightbox-stage">
              <Transition name="gallery" mode="out-in">
                <img
                  v-if="currentSlide"
                  :key="currentSlide.url"
                  :src="currentSlide.url"
                  alt="Скриншот Minecraft"
                />
              </Transition>
              <div v-if="!currentSlide" class="lightbox-empty">
                <Icon name="gallery" :size="42" /><b>{{
                  tr(
                    "Пока нет снимков",
                    "No screenshots yet",
                    "Aún no hay capturas",
                  )
                }}</b
                ><small>{{
                  tr(
                    "Скриншоты из папки Minecraft появятся здесь автоматически.",
                    "Minecraft screenshots will appear here automatically.",
                    "Las capturas de Minecraft aparecerán aquí automáticamente.",
                  )
                }}</small>
              </div>
              <template v-else>
                <button class="lightbox-prev" @click="moveSlide(-1)">
                  <Icon name="back" :size="22" />
                </button>
                <button class="lightbox-next" @click="moveSlide(1)">
                  <Icon name="chevron" :size="22" />
                </button>
              </template>
            </div>
          </section>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.home {
  min-height: 100%;
  padding: 6px 26px 24px 14px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ---------- hero ---------- */
.hero {
  position: relative;
  flex: 1 0 auto;
  min-height: 330px;
  padding: 22px 28px 24px 30px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  isolation: isolate;
  border-radius: 24px;
  background:
    radial-gradient(
      520px 380px at 84% 30%,
      rgba(117, 108, 255, 0.22),
      transparent 70%
    ),
    radial-gradient(
      420px 300px at 100% 100%,
      rgba(92, 203, 255, 0.12),
      transparent 70%
    ),
    linear-gradient(135deg, rgba(23, 29, 44, 0.94), rgba(14, 18, 28, 0.94));
  border: 1px solid var(--hairline);
  animation: rise 0.36s var(--ease) both;
}
.hero-sail {
  position: absolute;
  right: 4%;
  top: 50%;
  z-index: -1;
  width: min(42%, 340px);
  aspect-ratio: 1;
  object-fit: contain;
  transform: translateY(-50%);
  filter: drop-shadow(0 24px 60px rgba(117, 108, 255, 0.35));
  pointer-events: none;
  transition: transform 0.6s var(--ease);
}
.hero:hover .hero-sail {
  transform: translateY(calc(-50% - 6px)) rotate(-1.5deg);
}
.hero-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.hero-tag {
  height: 30px;
  padding: 0 12px 0 6px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 999px;
  color: var(--text-1);
  font-size: 12px;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--hairline);
}
.tag-fabric {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  font-size: 13px;
  background: rgba(255, 255, 255, 0.07);
}
.tag-fabric.neoforge {
  background: rgba(240, 138, 69, 0.16);
}
.tag-fabric :deep(svg) {
  width: 13px;
  height: 13px;
}
.profile-chip {
  height: 44px;
  max-width: 230px;
  padding: 4px 12px 4px 4px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 14px;
  color: var(--text-2);
  background: rgba(10, 13, 21, 0.45);
  border: 1px solid var(--hairline);
  transition:
    background 0.2s var(--ease-standard),
    border-color 0.2s var(--ease-standard),
    transform 0.2s var(--ease);
}
.profile-chip:hover {
  transform: translateY(-1px);
  background: rgba(10, 13, 21, 0.7);
  border-color: var(--green-line);
}
.avatar {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  overflow: hidden;
  flex: none;
  border-radius: 10px;
  color: var(--text-2);
  background: var(--surface-3);
}
.avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  image-rendering: pixelated;
}
.profile-copy {
  min-width: 0;
  flex: 1;
}
.profile-copy b,
.profile-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.profile-copy b {
  color: var(--text-0);
  font-size: 13px;
}
.profile-copy small {
  margin-top: 1px;
  color: var(--text-3);
  font-size: 10.5px;
}

.hero-body {
  max-width: 560px;
  margin: auto 0;
  padding: 26px 0 18px;
}
.hero-body h1 {
  font-size: clamp(38px, 5.2vw, 60px);
  line-height: 1.02;
  letter-spacing: -0.02em;
  font-weight: 700;
  overflow-wrap: anywhere;
}
.hero-body h1 span {
  background: linear-gradient(100deg, #9a93ff, #5ccbff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.instance-description {
  margin-top: 10px;
  color: var(--text-2);
  font-size: 14.5px;
  line-height: 1.5;
}

/* ---------- launch button ---------- */
.launch-zone {
  position: relative;
  width: min(100%, 360px);
  margin-top: 26px;
}
.launch-pill {
  position: relative;
  height: 58px;
  padding: 0 7px 0 7px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 44px;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  border-radius: 18px;
  color: #fff;
  background: var(--green-grad);
  box-shadow: 0 10px 28px rgba(90, 79, 240, 0.34);
  transition:
    transform 0.22s var(--ease),
    box-shadow 0.22s var(--ease-standard),
    background 0.22s var(--ease-standard);
}
.launch-pill:has(.launch-main-action:hover:not(:disabled)) {
  transform: translateY(-2px);
  box-shadow: 0 14px 34px rgba(90, 79, 240, 0.46);
}
.launch-pill:has(.launch-main-action:active:not(:disabled)) {
  transform: translateY(0) scale(0.99);
}
.launch-pill.busy,
.launch-pill.installing {
  color: var(--text-0);
  background: var(--surface-3);
  box-shadow: none;
}
.progress {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: var(--green-grad);
  transform-origin: left center;
  transition: transform 0.3s linear;
}
.launch-main-action {
  position: relative;
  z-index: 1;
  min-width: 0;
  height: 100%;
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  color: inherit;
  font: inherit;
}
.launch-main-action:active:not(:disabled) {
  transform: none;
}
.launch-main-action:disabled {
  cursor: default;
}
.play-orb,
.launch-settings {
  position: relative;
  z-index: 1;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.16);
  transition:
    transform 0.18s var(--ease),
    background 0.18s var(--ease-standard);
}
.launch-main-action:hover:not(:disabled) .play-orb {
  transform: scale(1.06);
  background: rgba(255, 255, 255, 0.24);
}
.launch-settings:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.24);
}
.launch-settings :deep(svg) {
  transition: transform 0.3s var(--ease);
}
.launch-settings:hover:not(:disabled) :deep(svg) {
  transform: rotate(90deg);
}
.launch-settings:disabled {
  cursor: wait;
  opacity: 0.58;
}
.launch-pill.paused .play-orb {
  background: rgba(255, 255, 255, 0.3);
}
.launch-action-copy {
  min-width: 0;
  text-align: left;
}
.launch-action-copy b,
.launch-action-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.launch-action-copy b {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.01em;
}
.launch-action-copy small {
  margin-top: 2px;
  font: 500 11px var(--font-num);
  opacity: 0.72;
}
.running-context {
  position: absolute;
  left: 0;
  bottom: calc(100% + 8px);
  z-index: 5;
  min-width: 180px;
  padding: 5px;
  border-radius: 12px;
  background: var(--surface-3);
  border: 1px solid var(--hairline-strong);
  box-shadow: var(--elev-3);
}
.running-context::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  height: 10px;
}
.running-context button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  color: var(--text-0);
}
.running-context button:hover,
.running-context button:focus-visible {
  background: var(--green-soft);
  outline: none;
}
.launch-error {
  max-width: 480px;
  margin-top: 12px;
  padding: 10px 12px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  border-radius: 12px;
  color: #ffb3ba;
  font-size: 12.5px;
  line-height: 1.45;
  background: rgba(255, 93, 108, 0.1);
  border: 1px solid rgba(255, 93, 108, 0.24);
  user-select: text;
}
.launch-error :deep(svg) {
  flex: none;
  margin-top: 1px;
}

.hero-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.hero-stats > div {
  min-width: 132px;
  padding: 9px 14px 10px;
  border-radius: 14px;
  background: rgba(10, 13, 21, 0.42);
  border: 1px solid var(--hairline);
}
.hero-stats dt {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
  font-size: 11px;
}
.hero-stats dd {
  margin-top: 3px;
  color: var(--text-0);
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

/* ---------- content cards ---------- */
.content-dashboard {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr)) minmax(0, 1.55fr);
  gap: 12px;
}
.dashboard-card {
  position: relative;
  min-height: 150px;
  padding: 14px 14px 14px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 18px;
  background: rgba(21, 26, 39, 0.92);
  border: 1px solid var(--hairline);
  cursor: pointer;
  animation: rise 0.36s var(--ease) both;
  transition:
    transform 0.2s var(--ease),
    border-color 0.2s var(--ease-standard),
    background 0.2s var(--ease-standard);
}
.dashboard-card:nth-child(2) {
  animation-delay: 0.03s;
}
.dashboard-card:nth-child(3) {
  animation-delay: 0.06s;
}
.dashboard-card:nth-child(4) {
  animation-delay: 0.09s;
}
.dashboard-card:nth-child(5) {
  animation-delay: 0.12s;
}
.dashboard-card:hover {
  transform: translateY(-2px);
  background: rgba(28, 34, 50, 0.96);
  border-color: var(--hairline-strong);
}
.worlds-card,
.screenshots-card {
  cursor: default;
}
.dashboard-card > header {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 9px;
  color: var(--text-1);
}
.card-icon {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  flex: none;
  border-radius: 10px;
  color: var(--green-bright);
  background: var(--green-soft);
}
.shaders-card .card-icon,
.screenshots-card .card-icon {
  color: var(--amethyst);
  background: var(--amethyst-soft);
}
.card-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
}
.card-arrow {
  color: var(--text-3);
  transition:
    transform 0.2s var(--ease),
    color 0.2s;
}
.dashboard-card:hover .card-arrow {
  color: var(--text-0);
  transform: translateX(2px);
}
.card-count {
  margin-top: auto;
  padding-top: 14px;
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.card-count b {
  color: var(--text-0);
  font: 700 28px/1 var(--font-num);
  letter-spacing: -0.02em;
}
.card-count span {
  color: var(--text-3);
  font-size: 12px;
}
.content-icons {
  min-height: 26px;
  margin-top: 10px;
  display: flex;
  align-items: center;
}
.content-icons > span,
.content-icons > b {
  width: 26px;
  height: 26px;
  flex: none;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 8px;
  color: var(--text-3);
  background: var(--surface-3);
  box-shadow: 0 0 0 2px rgba(21, 26, 39, 1);
}
.content-icons > :not(:first-child) {
  margin-left: -6px;
}
.content-icons img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.content-icons > b {
  width: auto;
  min-width: 26px;
  padding: 0 6px;
  color: var(--text-1);
  font: 600 10.5px var(--font-num);
}

.screenshots-card {
  padding: 0;
  min-height: 150px;
  background: var(--surface-2);
}
.screenshots-card > img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.screenshot-shade {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
  background: linear-gradient(
    180deg,
    rgba(10, 13, 21, 0.72),
    rgba(10, 13, 21, 0.05) 45%,
    rgba(10, 13, 21, 0.6)
  );
}
.screenshots-card > header {
  padding: 14px 12px 0 14px;
}
.screenshots-card > header small {
  color: var(--text-1);
  font: 500 11px var(--font-num);
}
.screenshots-card > header button,
.gallery-actions button {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  color: var(--text-0);
  background: rgba(10, 13, 21, 0.55);
}
.screenshots-card > header button:hover,
.gallery-actions button:hover {
  background: rgba(117, 108, 255, 0.55);
}
.empty-gallery {
  position: relative;
  z-index: 2;
  flex: 1;
  padding: 0 16px 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-3);
  text-align: center;
}
.empty-gallery b {
  color: var(--text-1);
  font-size: 13px;
}
.empty-gallery small {
  font-size: 11.5px;
}
.gallery-actions {
  position: absolute;
  inset: 50% 10px auto;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  transform: translateY(-50%);
  opacity: 0;
  transition: opacity 0.2s var(--ease-standard);
}
.screenshots-card:hover .gallery-actions {
  opacity: 1;
}
.screenshots-card nav {
  position: absolute;
  left: 50%;
  bottom: 12px;
  z-index: 2;
  display: flex;
  gap: 5px;
  transform: translateX(-50%);
}
.screenshots-card nav button {
  width: 6px;
  height: 6px;
  border-radius: 99px;
  background: rgba(255, 255, 255, 0.4);
  transition:
    width 0.25s var(--ease),
    background 0.2s;
}
.screenshots-card nav button.active {
  width: 18px;
  background: #fff;
}
.gallery-enter-active,
.gallery-leave-active {
  transition: opacity 0.3s var(--ease-standard);
}
.gallery-enter-from,
.gallery-leave-to {
  opacity: 0;
}

/* ---------- lightbox ---------- */
.gallery-lightbox {
  position: fixed;
  inset: 0;
  z-index: 300;
  padding: 56px 48px 40px;
  display: grid;
  place-items: center;
  background: rgba(6, 8, 14, 0.86);
}
.gallery-lightbox > section {
  width: min(1180px, 100%);
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 22px;
  background: var(--surface-1);
  border: 1px solid var(--hairline-strong);
  box-shadow: var(--elev-3);
  animation: rise 0.28s var(--ease) both;
}
.gallery-lightbox header {
  height: 58px;
  padding: 0 12px 0 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--hairline);
}
.gallery-lightbox header > div {
  display: flex;
  align-items: center;
  gap: 11px;
}
.gallery-lightbox header svg {
  color: var(--amethyst);
}
.gallery-lightbox header b {
  display: block;
  color: var(--text-0);
  font-size: 14px;
}
.gallery-lightbox header small {
  color: var(--text-3);
  font-size: 11px;
}
.gallery-lightbox header button {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  color: var(--text-2);
}
.gallery-lightbox header button:hover {
  color: var(--text-0);
  background: var(--surface-3);
}
.lightbox-stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: grid;
  place-items: center;
  background: #06080e;
}
.lightbox-stage > img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.lightbox-prev,
.lightbox-next {
  position: absolute;
  top: 50%;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 14px;
  color: #fff;
  background: rgba(10, 13, 21, 0.62);
  transform: translateY(-50%);
}
.lightbox-prev:hover,
.lightbox-next:hover {
  background: rgba(117, 108, 255, 0.7);
}
.lightbox-prev {
  left: 16px;
}
.lightbox-next {
  right: 16px;
}
.lightbox-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--text-3);
  text-align: center;
}
.lightbox-empty b {
  color: var(--text-0);
}
.gallery-modal-enter-active,
.gallery-modal-leave-active {
  transition: opacity 0.2s var(--ease-standard);
}
.gallery-modal-enter-from,
.gallery-modal-leave-to {
  opacity: 0;
}

.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (max-width: 1080px) {
  .content-dashboard {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .screenshots-card {
    grid-column: 1 / -1;
    min-height: 190px;
  }
}
@media (max-width: 760px) {
  .home {
    padding: 4px 14px 18px 8px;
  }
  .hero {
    padding: 18px;
  }
  .hero-sail {
    opacity: 0.35;
  }
  .profile-copy {
    display: none;
  }
}
</style>
