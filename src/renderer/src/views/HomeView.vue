<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRouter } from "vue-router";
import Icon from "@/components/Icon.vue";
import FabricLogo from "@/components/FabricLogo.vue";
import { GAME } from "@shared/constants";
import { useLauncherStore } from "@/stores/launcher";
import { useAccountStore } from "@/stores/account";
import { useSettingsStore } from "@/stores/settings";
import { useModsStore } from "@/stores/mods";
import { useResourcesStore } from "@/stores/resources";
import generatedLogo from "@/assets/images/royale-logo-transparent.png";
import { useLocale } from "@/composables/useLocale";

const router = useRouter();
const launcher = useLauncherStore();
const account = useAccountStore();
const settings = useSettingsStore();
const mods = useModsStore();
const resources = useResourcesStore();
const { tr } = useLocale();
const slide = ref(0);
const galleryHovered = ref(false);
const galleryExpanded = ref(false);
const logoYaw = ref(0);
const logoPitch = ref(0);
const logoDragging = ref(false);
let lastPointer = { x: 0, y: 0 };
let lastPointerAt = 0;
let logoVelocity = { x: 0, y: 0 };
let logoInertiaFrame = 0;
let carouselTimer: ReturnType<typeof setInterval> | null = null;
let contentRefreshTimer: ReturnType<typeof setInterval> | null = null;

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
const logoStyle = computed(() => ({
  transform: `rotateX(${logoPitch.value}deg) rotateY(${logoYaw.value}deg)`,
}));
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
    return `Royale Master ${launcher.updateInfo.remoteVersion}`;
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
function logoPointerDown(event: PointerEvent): void {
  cancelAnimationFrame(logoInertiaFrame);
  logoDragging.value = true;
  lastPointer = { x: event.clientX, y: event.clientY };
  lastPointerAt = performance.now();
  logoVelocity = { x: 0, y: 0 };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}
function logoPointerMove(event: PointerEvent): void {
  if (!logoDragging.value) return;
  const now = performance.now();
  const elapsed = Math.max(8, now - lastPointerAt);
  const dx = event.clientX - lastPointer.x;
  const dy = event.clientY - lastPointer.y;
  logoYaw.value += dx * 0.45;
  logoPitch.value = Math.max(-35, Math.min(35, logoPitch.value - dy * 0.35));
  logoVelocity = {
    x: (dx / elapsed) * 7.2,
    y: (-dy / elapsed) * 5.4,
  };
  lastPointer = { x: event.clientX, y: event.clientY };
  lastPointerAt = now;
}
function logoPointerUp(): void {
  logoDragging.value = false;
  const tick = (): void => {
    logoVelocity.x *= 0.92;
    logoVelocity.y *= 0.9;
    logoYaw.value += logoVelocity.x;
    logoPitch.value = Math.max(
      -35,
      Math.min(35, logoPitch.value + logoVelocity.y),
    );
    if (Math.abs(logoVelocity.x) + Math.abs(logoVelocity.y) > 0.08)
      logoInertiaFrame = requestAnimationFrame(tick);
  };
  logoInertiaFrame = requestAnimationFrame(tick);
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
onMounted(() => {
  void settings.refreshGameContent();
  void Promise.allSettled([mods.loadInstalled(), resources.loadInstalled()]);
  void window.royale.discord.activity("В главном меню");
  carouselTimer = setInterval(() => {
    if (!galleryHovered.value) moveSlide(1);
  }, 6000);
  // Minecraft can add an F2 screenshot while the launcher stays open.
  // Refreshing the lightweight directory summary keeps the gallery live.
  contentRefreshTimer = setInterval(
    () => void settings.refreshGameContent(),
    4000,
  );
});
onBeforeUnmount(() => {
  if (carouselTimer) clearInterval(carouselTimer);
  if (contentRefreshTimer) clearInterval(contentRefreshTimer);
  cancelAnimationFrame(logoInertiaFrame);
});
</script>

<template>
  <div class="home">
    <RouterLink to="/account" class="profile-chip">
      <span class="avatar"
        ><img
          v-if="account.active && !settings.settings?.streamerMode"
          :src="account.avatar"
          alt="" /><Icon v-else name="user" :size="19"
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

    <main class="instance">
      <h1>Royale <span>Master</span></h1>
      <p class="instance-description">
        {{
          tr(
            `Готовая клиентская сборка для Minecraft ${GAME.minecraftVersion}`,
            `A ready-to-play Minecraft ${GAME.minecraftVersion} client`,
            `Cliente de Minecraft ${GAME.minecraftVersion} listo para jugar`,
          )
        }}
      </p>
      <div class="inline-stats">
        <div>
          <span class="stat-icon fabric"><FabricLogo /></span>
          <p>
            <small>{{ tr("Версия", "Version", "Versión") }}</small
            ><b>{{ GAME.minecraftVersion }} · Fabric</b>
          </p>
        </div>
        <i />
        <div>
          <span class="stat-icon"><Icon name="clock" :size="17" /></span>
          <p>
            <small>{{ tr("Время в игре", "Playtime", "Tiempo jugado") }}</small
            ><b>{{ launcher.playtimeLabel }}</b>
          </p>
        </div>
        <i />
        <div>
          <span class="stat-icon"><Icon name="refresh" :size="17" /></span>
          <p>
            <small>{{
              tr("Последний запуск", "Last played", "Última sesión")
            }}</small
            ><b>{{ launcher.lastPlayedLabel }}</b>
          </p>
        </div>
      </div>
    </main>

    <div
      class="default-visual"
      :class="{ dragging: logoDragging }"
      role="img"
      aria-label="Интерактивный логотип Royale"
      @pointerdown="logoPointerDown"
      @pointermove="logoPointerMove"
      @pointerup="logoPointerUp"
      @pointercancel="logoPointerUp"
    >
      <div class="visual-orbit"><i /><i /><i /></div>
      <img :src="generatedLogo" :style="logoStyle" alt="" draggable="false" />
      <div class="visual-caption">
        <small>ROYALE EDITION</small
        ><b>MINECRAFT {{ GAME.minecraftVersion }}</b>
      </div>
    </div>

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
          <span
            ><Icon name="mods" :size="18" />{{
              tr("Моды", "Mods", "Mods")
            }}</span
          >
          <button
            title="Открыть установленные моды"
            @click.stop="router.push('/mods?tab=installed')"
          >
            <Icon name="chevron" :size="15" />
          </button>
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
          <span
            ><Icon name="globe" :size="18" />{{
              tr("Миры", "Worlds", "Mundos")
            }}</span
          >
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
      </article>

      <article class="dashboard-card shaders-card">
        <header>
          <span
            ><Icon name="sparkles" :size="18" />{{
              tr("Шейдеры", "Shaders", "Shaders")
            }}</span
          >
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
      </article>

      <article
        class="dashboard-card resources-card"
        @click="router.push('/resources?tab=installed')"
      >
        <header>
          <span
            ><Icon name="palette" :size="18" />{{
              tr("Ресурсы", "Resources", "Recursos")
            }}</span
          >
          <button
            title="Открыть установленные ресурспаки"
            @click.stop="router.push('/resources?tab=installed')"
          >
            <Icon name="chevron" :size="15" />
          </button>
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
            alt="Скриншот Royale Master"
          />
        </Transition>
        <div class="screenshot-shade" />
        <header>
          <span
            ><Icon name="gallery" :size="17" />{{
              tr("Галерея", "Gallery", "Galería")
            }}</span
          >
          <div>
            <small v-if="gallery.length"
              >{{ slide + 1 }} / {{ gallery.length }}</small
            >
            <button title="Развернуть галерею" @click="galleryExpanded = true">
              <Icon name="expand" :size="15" />
            </button>
          </div>
        </header>
        <div v-if="!gallery.length" class="empty-gallery">
          <Icon name="gallery" :size="30" />
          <b>{{
            tr("Пока нет снимков", "No screenshots yet", "Aún no hay capturas")
          }}</b>
        </div>
        <div v-else class="gallery-actions">
          <button @click="moveSlide(-1)">
            <Icon name="back" :size="17" />
          </button>
          <button @click="moveSlide(1)">
            <Icon name="chevron" :size="17" />
          </button>
        </div>
        <nav v-if="gallery.length > 1">
          <button
            v-for="(_, index) in gallery"
            :key="index"
            :class="{ active: index === slide }"
            @click="slide = index"
          />
        </nav>
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

    <footer class="home-foot">
      <div class="quick-links">
        <RouterLink to="/mods"
          ><Icon name="mods" :size="17" /><span>{{
            tr("Моды", "Mods", "Mods")
          }}</span></RouterLink
        ><RouterLink to="/settings"
          ><Icon name="settings" :size="17" /><span>{{
            tr("Настройки", "Settings", "Ajustes")
          }}</span></RouterLink
        >
      </div>
      <div class="launch-zone">
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
            :style="{ width: `${launcher.progress}%` }"
          />
          <button
            class="launch-main-action"
            :disabled="busy || launcher.transportBusy"
            @click="launch"
          >
            <span class="play-orb"
              ><Icon
                :name="actionIcon"
                :size="21"
                :class="{
                  spin:
                    account.refreshing ||
                    (launcher.state === 'downloading' &&
                      launcher.installProgress?.canPause === false),
                }" /></span
            ><span class="launch-action-copy"
              ><b>{{ actionLabel }}</b
              ><small v-if="actionSecondary">{{ actionSecondary }}</small></span
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
              :size="19"
            />
          </button>
        </div>
      </div>
    </footer>

    <Transition name="fade"
      ><p v-if="launcher.errorText" class="launch-error">
        <Icon name="alert" :size="16" />{{ launcher.errorText }}
      </p></Transition
    >
  </div>
</template>

<style scoped lang="scss">
.home {
  position: relative;
  min-height: 100%;
  padding: 34px 38px 28px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.home::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(
    90deg,
    rgba(5, 10, 7, 0.2),
    transparent 58%,
    rgba(5, 10, 7, 0.18)
  );
}
.profile-chip {
  position: absolute;
  right: 38px;
  top: 34px;
  z-index: 3;
  width: 210px;
  height: 50px;
  padding: 5px 10px 5px 6px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 13px;
  color: var(--text-2);
  background: rgba(17, 23, 19, 0.78);
  border: 1px solid var(--hairline);
  backdrop-filter: blur(18px);
  transition:
    transform 0.3s var(--ease),
    background 0.3s,
    border-color 0.3s;
}
.profile-chip:hover {
  transform: translateY(-3px);
  background: rgba(32, 42, 34, 0.94);
  border-color: var(--green-line);
}
.avatar {
  width: 38px;
  height: 38px;
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
  flex: 1;
  min-width: 0;
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
  font-size: 12.5px;
}
.profile-copy small {
  margin-top: 2px;
  color: var(--text-3);
  font-size: 10.5px;
}
.instance {
  margin-top: clamp(6px, 1.8vh, 18px);
  max-width: 760px;
}
.instance h1 {
  font-size: clamp(48px, 6.4vw, 78px);
  line-height: 0.96;
  letter-spacing: -0.035em;
  text-shadow: 0 16px 42px #0009;
}
.instance h1 span {
  color: var(--green-bright);
}
.instance-description {
  margin-top: 14px;
  color: var(--text-1);
  font-size: 15px;
}
.inline-stats {
  margin-top: 29px;
  display: flex;
  align-items: center;
  gap: 18px;
  flex-wrap: wrap;
}
.inline-stats > div {
  display: flex;
  align-items: center;
  gap: 10px;
}
.inline-stats > i {
  width: 1px;
  height: 38px;
  background: var(--hairline-strong);
}
.stat-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  color: var(--green);
  background: rgba(17, 23, 19, 0.76);
  border: 1px solid var(--hairline);
  backdrop-filter: blur(12px);
}
.stat-icon.fabric {
  font-size: 25px;
}
.inline-stats small,
.inline-stats b {
  display: block;
}
.inline-stats small {
  color: var(--text-3);
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.inline-stats b {
  margin-top: 3px;
  color: var(--text-0);
  font-family: var(--font-num);
  font-size: 12px;
}
.content-glance {
  width: min(450px, 44vw);
  margin-top: clamp(22px, 3.5vh, 36px);
  padding: 0 15px 14px;
  border-radius: 14px;
  background: rgba(13, 19, 15, 0.78);
  border: 1px solid var(--hairline);
  backdrop-filter: blur(12px);
}
.content-tabs {
  height: 42px;
  display: flex;
  align-items: flex-end;
  gap: 20px;
  border-bottom: 1px solid var(--hairline);
}
.content-tabs button {
  position: relative;
  height: 42px;
  color: var(--text-3);
  font-size: 11px;
  font-weight: 700;
}
.content-tabs button.active {
  color: var(--text-0);
}
.content-tabs button.active::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--green);
}
.content-list {
  padding-top: 8px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px 10px;
}
.content-list > span {
  min-height: 35px;
  padding: 0 8px;
  display: flex;
  align-items: center;
  gap: 9px;
  border-radius: 8px;
  color: var(--green);
}
.content-list > span:hover {
  background: rgba(255, 255, 255, 0.035);
}
.content-list b {
  color: var(--text-1);
  font-size: 10px;
  font-weight: 600;
}
.update-summary {
  min-height: 82px;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--green);
}
.update-summary div {
  min-width: 0;
}
.update-summary b,
.update-summary small {
  display: block;
}
.update-summary b {
  color: var(--text-0);
  font-size: 12px;
}
.update-summary small {
  margin-top: 5px;
  overflow: hidden;
  color: var(--text-3);
  font-size: 9.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.default-visual {
  position: absolute;
  right: clamp(32px, 5vw, 70px);
  top: 49%;
  width: clamp(230px, 25vw, 300px);
  aspect-ratio: 1;
  transform: translateY(-53%);
  display: grid;
  place-items: center;
  filter: drop-shadow(0 28px 58px rgba(0, 0, 0, 0.5));
  animation: visual-in 0.28s var(--ease) both;
  cursor: grab;
  perspective: 900px;
  touch-action: none;
  user-select: none;
}
.default-visual.dragging {
  cursor: grabbing;
}
.default-visual::before {
  content: "";
  position: absolute;
  inset: 3%;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(45, 210, 87, 0.2),
    rgba(45, 210, 87, 0.03) 54%,
    transparent 70%
  );
  filter: blur(12px);
}
.default-visual img {
  position: relative;
  width: 68%;
  aspect-ratio: 1;
  object-fit: contain;
  opacity: 0.96;
  transform-style: preserve-3d;
  transition:
    transform 0.08s linear,
    filter 0.2s;
  filter: drop-shadow(0 20px 32px rgba(54, 74, 255, 0.28));
}
.default-visual.dragging img {
  filter: drop-shadow(0 25px 42px rgba(83, 195, 106, 0.34));
}
.visual-orbit,
.visual-orbit i {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 1px solid rgba(105, 226, 131, 0.17);
}
.visual-orbit {
  animation: orbit 20s linear infinite;
  pointer-events: none;
}
.visual-orbit i:nth-child(1) {
  inset: 9%;
  border-style: dashed;
}
.visual-orbit i:nth-child(2) {
  inset: 18%;
  border-color: rgba(133, 106, 255, 0.24);
}
.visual-orbit i:nth-child(3) {
  inset: 28%;
  border-color: rgba(99, 220, 128, 0.3);
  box-shadow: inset 0 0 38px rgba(69, 198, 97, 0.08);
}
.visual-caption {
  position: absolute;
  right: -1%;
  bottom: 5%;
  padding: 10px 14px;
  border-radius: 11px;
  text-align: right;
  background: rgba(10, 17, 12, 0.64);
  border: 1px solid rgba(120, 224, 142, 0.16);
  backdrop-filter: blur(14px);
}
.visual-caption small,
.visual-caption b {
  display: block;
}
.visual-caption small {
  color: var(--green);
  font-size: 9px;
  letter-spacing: 0.16em;
}
.visual-caption b {
  margin-top: 3px;
  color: var(--text-1);
  font: 600 10px var(--font-num);
}
@keyframes visual-in {
  from {
    opacity: 0;
    transform: translateY(-49%) scale(0.92);
  }
}
@keyframes logo-float {
  50% {
    transform: rotate(2deg) translateY(-9px);
  }
}
@keyframes orbit {
  to {
    transform: rotate(360deg);
  }
}
.gallery-card {
  position: relative;
  width: min(520px, 48vw);
  height: clamp(170px, 26vh, 250px);
  margin-top: clamp(28px, 5vh, 56px);
  overflow: hidden;
  border-radius: 17px;
  background: var(--surface-2);
  border: 1px solid var(--hairline-strong);
  box-shadow: 0 22px 60px rgba(0, 0, 0, 0.34);
  animation: card-in 0.24s var(--ease) both;
}
.gallery-card > img {
  position: absolute;
  width: 100%;
  height: 100%;
  object-fit: cover;
  user-select: none;
}
.gallery-shade {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.56),
    transparent 44%,
    rgba(0, 0, 0, 0.7)
  );
}
.gallery-card header {
  position: absolute;
  left: 14px;
  right: 14px;
  top: 13px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #fff;
}
.gallery-card header span {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.gallery-card header b {
  font-family: var(--font-num);
  font-size: 9px;
}
.gallery-actions {
  position: absolute;
  inset: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  opacity: 0;
  transform: scale(0.97);
  transition:
    opacity 0.28s,
    transform 0.3s var(--ease);
}
.gallery-card:hover .gallery-actions {
  opacity: 1;
  transform: scale(1);
}
.gallery-actions button {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: #0b0f0cb8;
  border: 1px solid #ffffff24;
  backdrop-filter: blur(10px);
}
.gallery-actions button:hover {
  background: #1c2b20;
  transform: scale(1.08);
}
.gallery-card nav {
  position: absolute;
  left: 50%;
  bottom: 13px;
  display: flex;
  gap: 6px;
  transform: translateX(-50%);
}
.gallery-card nav button {
  width: 7px;
  height: 7px;
  border-radius: 8px;
  background: #fff6;
}
.gallery-card nav button.active {
  width: 24px;
  background: var(--green);
  box-shadow: 0 0 10px rgba(83, 195, 106, 0.7);
}
.gallery-enter-active,
.gallery-leave-active {
  transition:
    opacity 0.4s,
    transform 0.5s var(--ease);
}
.gallery-enter-from {
  opacity: 0;
  transform: scale(1.04);
}
.gallery-leave-to {
  opacity: 0;
  transform: scale(0.98);
}
@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(18px);
  }
}
.home-foot {
  margin-top: auto;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  position: relative;
  z-index: 2;
}
.launch-zone {
  width: 286px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0;
}
.quick-links {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.quick-links > a {
  height: 40px;
  padding: 0 13px;
  display: flex;
  align-items: center;
  gap: 7px;
  border-radius: 10px;
  color: var(--text-1);
  background: rgba(17, 23, 19, 0.74);
  border: 1px solid var(--hairline);
  backdrop-filter: blur(14px);
}
.quick-links > a:hover {
  color: var(--text-0);
  background: var(--surface-3);
  transform: translateY(-3px);
}
.build-state {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-left: 5px;
  color: var(--text-3);
  font-size: 11px;
}
.build-state i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--warn);
}
.build-state.ok i {
  background: var(--green);
  box-shadow: 0 0 8px rgba(83, 195, 106, 0.6);
}
.launch-pill {
  position: relative;
  width: 100%;
  height: 66px;
  padding: 0 8px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 42px;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  border-radius: 999px;
  color: #07130a;
  background: var(--green-grad);
  box-shadow: 0 17px 42px rgba(35, 142, 59, 0.34);
  font-size: 17px;
  transition:
    transform 0.32s var(--ease),
    box-shadow 0.32s,
    filter 0.3s;
}
.launch-pill.installing {
  width: 100%;
  grid-template-columns: minmax(0, 1fr) 38px;
  gap: 4px;
}
.launch-main-action {
  position: relative;
  z-index: 2;
  min-width: 0;
  height: 100%;
  padding: 0;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  color: inherit;
  background: transparent;
  font: inherit;
}
.launch-pill.installing .launch-main-action {
  grid-template-columns: 42px minmax(0, 1fr);
  gap: 4px;
}
.launch-main-action:disabled {
  cursor: default;
}
.launch-pill.installing .play-orb {
  width: 40px;
  height: 40px;
}
.launch-pill.installing .launch-settings {
  width: 38px;
  height: 38px;
}
.launch-pill:has(.launch-main-action:hover:not(:disabled)) {
  transform: translateY(-4px) scale(1.012);
  box-shadow: 0 24px 58px rgba(35, 142, 59, 0.44);
  filter: brightness(1.06);
}
.launch-pill.busy {
  color: var(--text-0);
  background: rgba(32, 42, 34, 0.94);
}
.play-orb,
.launch-settings {
  position: relative;
  z-index: 2;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #ffffff2b;
  transition:
    transform 0.18s var(--ease),
    background 0.18s ease,
    box-shadow 0.18s ease;
}
.play-orb :deep(svg) {
  transition:
    transform 0.18s var(--ease),
    opacity 0.18s ease;
}
.launch-main-action:hover:not(:disabled) .play-orb {
  transform: scale(1.08);
  background: #ffffff42;
  box-shadow: 0 0 0 5px #ffffff12;
}
.launch-main-action:hover:not(:disabled) .play-orb :deep(svg) {
  animation: action-icon-hover 0.42s var(--ease) both;
}
.launch-pill.paused .play-orb {
  animation: resume-pulse 1.35s ease-in-out infinite;
}
.launch-pill.transporting .play-orb :deep(svg) {
  animation: control-pop 0.42s var(--ease) infinite alternate;
}
.launch-settings {
  width: 42px;
  height: 42px;
  cursor: pointer;
}
.launch-settings:disabled {
  cursor: wait;
  opacity: 0.58;
}
.launch-settings :deep(svg) {
  transition: transform 0.24s var(--ease);
}
.launch-settings:hover:not(:disabled) :deep(svg) {
  transform: rotate(140deg) scale(1.08);
}
.launch-main-action > b {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.launch-action-copy {
  min-width: 0;
  text-align: center;
}
.launch-action-copy b,
.launch-action-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.launch-action-copy small {
  margin-top: 2px;
  font: 8px var(--font-num);
  opacity: 0.64;
}
.progress {
  position: absolute;
  inset: 0 auto 0 0;
  background: var(--green-grad);
  transition: width 0.3s linear;
}
.launch-error {
  position: absolute;
  left: 38px;
  bottom: 88px;
  width: min(360px, calc(100% - 76px));
  max-height: 78px;
  display: flex;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  color: var(--danger);
  background: rgba(36, 17, 20, 0.92);
  border: 1px solid rgba(255, 93, 108, 0.25);
  overflow: auto;
  font-size: 10px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.content-dashboard {
  position: relative;
  z-index: 3;
  width: min(650px, calc(100vw - 420px));
  height: 222px;
  margin-top: clamp(38px, 6.2vh, 66px);
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  grid-template-rows: repeat(2, minmax(0, 1fr));
  gap: 8px;
  transition: width 0.18s var(--ease);
}
.dashboard-card {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  padding: 12px;
  border: 1px solid var(--hairline);
  border-radius: 12px;
  background: rgba(18, 22, 20, 0.86);
  box-shadow: 0 10px 28px #0003;
  backdrop-filter: blur(14px);
  transition:
    transform 0.16s var(--ease),
    border-color 0.16s ease,
    background 0.16s ease;
}
.dashboard-card:hover {
  border-color: var(--hairline-strong);
  background: rgba(24, 29, 27, 0.94);
  transform: translateY(-2px);
}
.dashboard-card > header {
  position: relative;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.dashboard-card > header > span {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-0);
  font-size: 11px;
  font-weight: 650;
}
.dashboard-card > header svg {
  color: var(--green);
}
.dashboard-card > header button {
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  color: var(--text-2);
  background: rgba(255, 255, 255, 0.05);
}
.dashboard-card > header button:hover {
  color: var(--text-0);
  background: rgba(255, 255, 255, 0.1);
}
.mods-card {
  grid-column: 1;
  grid-row: 1 / 3;
}
.worlds-card {
  grid-column: 2;
  grid-row: 1;
}
.shaders-card {
  grid-column: 3;
  grid-row: 1;
}
.resources-card {
  grid-column: 4;
  grid-row: 1 / 3;
}
.screenshots-card {
  grid-column: 2 / 4;
  grid-row: 2;
  padding: 0;
  background: rgba(14, 17, 16, 0.9);
}
.card-count {
  margin-top: 16px;
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.card-count b {
  color: var(--text-0);
  font: 600 24px/1 var(--font-num);
}
.card-count span,
.dashboard-card > p {
  color: var(--text-3);
  font-size: 9px;
}
.dashboard-card > p {
  margin-top: 8px;
  line-height: 1.4;
}
.content-icons {
  display: flex;
  align-items: center;
  margin-top: 13px;
  min-height: 30px;
}
.content-icons > span,
.content-icons > b {
  width: 29px;
  height: 29px;
  display: grid;
  place-items: center;
  flex: none;
  overflow: hidden;
  margin-left: -7px;
  border: 2px solid rgba(18, 22, 20, 0.98);
  border-radius: 50%;
  color: var(--green);
  background: var(--surface-3);
  box-shadow: 0 5px 12px #0005;
}
.content-icons > span:first-child {
  margin-left: 0;
}
.content-icons img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.content-icons > b {
  width: auto;
  min-width: 29px;
  padding: 0 7px;
  color: var(--text-1);
  font: 700 8px var(--font-num);
}
.screenshots-card > img,
.screenshot-shade {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.screenshots-card > img {
  object-fit: cover;
}
.screenshot-shade {
  z-index: 1;
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.64),
    transparent 52%,
    rgba(0, 0, 0, 0.58)
  );
  pointer-events: none;
}
.screenshots-card > header {
  padding: 9px 10px;
}
.screenshots-card > header > div {
  display: flex;
  align-items: center;
  gap: 7px;
}
.screenshots-card > header small {
  color: #fff9;
  font: 9px var(--font-num);
}
.empty-gallery {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 7px;
  color: var(--text-3);
}
.empty-gallery b {
  font-size: 10px;
  font-weight: 550;
}
.screenshots-card .gallery-actions {
  z-index: 2;
  opacity: 0;
}
.screenshots-card:hover .gallery-actions {
  opacity: 1;
  transform: scale(1);
}
.screenshots-card nav {
  position: absolute;
  z-index: 3;
  left: 50%;
  bottom: 9px;
  display: flex;
  gap: 5px;
  transform: translateX(-50%);
}
.screenshots-card nav button {
  width: 6px;
  height: 6px;
  border-radius: 6px;
  background: #fff6;
}
.screenshots-card nav button.active {
  width: 18px;
  background: var(--green);
}
.gallery-lightbox {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: grid;
  place-items: center;
  padding: 34px;
  background: rgba(3, 7, 5, 0.82);
  backdrop-filter: blur(18px);
}
.gallery-lightbox > section {
  width: min(1040px, 92vw);
  height: min(720px, 84vh);
  display: grid;
  grid-template-rows: 58px minmax(0, 1fr);
  overflow: hidden;
  border-radius: 18px;
  background: #0d120f;
  border: 1px solid var(--hairline-strong);
  box-shadow: 0 34px 110px #000d;
}
.gallery-lightbox header {
  padding: 0 16px 0 19px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--hairline);
}
.gallery-lightbox header > div,
.gallery-lightbox header span {
  display: flex;
  align-items: center;
  gap: 10px;
}
.gallery-lightbox header svg {
  color: var(--green);
}
.gallery-lightbox header b {
  font-size: 13px;
}
.gallery-lightbox header small {
  color: var(--text-3);
  font: 10px var(--font-num);
}
.gallery-lightbox header button {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  color: var(--text-2);
  background: var(--surface-3);
}
.lightbox-stage {
  position: relative;
  min-height: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
}
.lightbox-stage > img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.lightbox-prev,
.lightbox-next {
  position: absolute;
  top: 50%;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  color: #fff;
  background: #070a08b8;
  border: 1px solid #ffffff24;
  transform: translateY(-50%);
}
.lightbox-prev {
  left: 16px;
}
.lightbox-next {
  right: 16px;
}
.lightbox-empty {
  display: grid;
  justify-items: center;
  gap: 9px;
  color: var(--text-3);
  text-align: center;
}
.lightbox-empty b {
  color: var(--text-1);
}
.lightbox-empty small {
  max-width: 360px;
}
.gallery-modal-enter-active,
.gallery-modal-leave-active {
  transition: opacity 0.18s ease;
}
.gallery-modal-enter-active > section,
.gallery-modal-leave-active > section {
  transition:
    transform 0.2s var(--ease),
    opacity 0.18s;
}
.gallery-modal-enter-from,
.gallery-modal-leave-to {
  opacity: 0;
}
.gallery-modal-enter-from > section,
.gallery-modal-leave-to > section {
  opacity: 0;
  transform: scale(0.975) translateY(8px);
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes resume-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 #ffffff24;
  }
  50% {
    box-shadow: 0 0 0 7px #ffffff00;
  }
}
@keyframes control-pop {
  from {
    transform: scale(0.78);
    opacity: 0.65;
  }
  to {
    transform: scale(1.08);
    opacity: 1;
  }
}
@keyframes action-icon-hover {
  0% {
    transform: scale(1);
  }
  48% {
    transform: scale(0.82);
  }
  100% {
    transform: scale(1.16);
  }
}
@media (max-width: 920px) {
  .default-visual {
    right: -40px;
    opacity: 0.2;
  }
  .instance {
    position: relative;
    z-index: 1;
  }
}
@media (max-width: 760px) {
  .home {
    padding: 24px;
  }
  .profile-chip {
    right: 24px;
    top: 24px;
    width: 50px;
  }
  .profile-copy,
  .profile-chip > svg {
    display: none;
  }
  .instance {
    margin-top: 62px;
  }
  .inline-stats > i {
    display: none;
  }
  .gallery-card {
    width: 100%;
    max-width: 520px;
  }
  .default-visual {
    display: none;
  }
  .content-glance {
    width: 100%;
    max-width: 520px;
  }
  .content-dashboard {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .content-dashboard .mods-card {
    grid-column: 1;
  }
  .content-dashboard .resources-card {
    grid-column: 2;
  }
  .content-dashboard .worlds-card,
  .content-dashboard .shaders-card,
  .content-dashboard .screenshots-card {
    display: none;
  }
  .content-list {
    grid-template-columns: 1fr 1fr;
  }
  .home-foot {
    align-items: stretch;
    flex-direction: column;
  }
  .launch-zone {
    width: 100%;
    align-items: stretch;
  }
  .launch-pill {
    align-self: flex-end;
  }
  .build-state {
    width: 100%;
    margin: 4px 0;
  }
}
</style>
