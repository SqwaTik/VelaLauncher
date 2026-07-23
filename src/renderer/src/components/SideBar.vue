<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute } from "vue-router";
import Icon from "./Icon.vue";
import { useAccountStore } from "@/stores/account";
import { useLocale } from "@/composables/useLocale";

const route = useRoute();
const account = useAccountStore();
const { tr } = useLocale();
const expanded = ref(false);
let hoverTimer: ReturnType<typeof setTimeout> | null = null;

const nav = computed(() => [
  {
    to: "/home",
    icon: "home",
    label: tr("Главная", "Home", "Inicio"),
    hint: tr("Запуск клиента", "Launch client", "Iniciar cliente"),
  },
  {
    to: "/mods",
    icon: "mods",
    label: tr("Моды", "Mods", "Mods"),
    hint: tr("Каталог Modrinth", "Modrinth catalog", "Catálogo Modrinth"),
  },
  {
    to: "/resources",
    icon: "palette",
    label: tr("Ресурспаки", "Resource packs", "Paquetes"),
    hint: tr("Текстуры Modrinth", "Modrinth textures", "Texturas Modrinth"),
  },
]);

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(`${path}/`);
}

function scheduleExpanded(value: boolean): void {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => (expanded.value = value), value ? 35 : 70);
}

function collapse(): void {
  if (hoverTimer) clearTimeout(hoverTimer);
  expanded.value = false;
}

function focusOut(event: FocusEvent): void {
  const next = event.relatedTarget as Node | null;
  if (!next || !(event.currentTarget as HTMLElement).contains(next))
    scheduleExpanded(false);
}

watch(() => route.fullPath, collapse);
onBeforeUnmount(() => hoverTimer && clearTimeout(hoverTimer));
</script>

<template>
  <div class="sidebar-slot">
    <aside
      class="sidebar"
      :class="{ expanded }"
      @pointerenter="scheduleExpanded(true)"
      @pointerleave="scheduleExpanded(false)"
      @focusin="scheduleExpanded(true)"
      @focusout="focusOut"
    >
      <RouterLink
        to="/account"
        class="account-link"
        :class="{ active: isActive('/account') }"
        :title="expanded ? undefined : tr('Аккаунт', 'Account', 'Cuenta')"
        @click="collapse"
      >
        <span class="avatar-shell">
          <img v-if="account.active" :src="account.avatar" alt="" />
          <Icon v-else name="user" :size="20" />
          <i v-if="account.active?.type === 'microsoft'" class="verified-dot" />
        </span>
        <span class="account-copy">
          <b>{{
            account.active?.username ??
            tr("Добавить аккаунт", "Add account", "Añadir cuenta")
          }}</b>
          <small v-if="account.active">{{
            account.active.type === "ely"
              ? "Ely.by"
              : account.active.type === "littleskin"
                ? "LittleSkin"
                : account.active.type === "microsoft"
                  ? "Microsoft"
                  : tr(
                      "Автономный профиль",
                      "Offline profile",
                      "Perfil sin conexión",
                    )
          }}</small>
          <small v-else>{{
            tr(
              "Профиль не выбран",
              "No profile selected",
              "Perfil no seleccionado",
            )
          }}</small>
        </span>
        <Icon name="chevron" :size="15" class="account-arrow" />
      </RouterLink>

      <div class="rail-divider" />
      <span class="group-label">{{
        tr("Навигация", "Navigation", "Navegación")
      }}</span>

      <nav class="nav-list" aria-label="Основная навигация">
        <RouterLink
          v-for="item in nav"
          :key="item.to"
          :to="item.to"
          class="nav-link"
          :class="{ active: isActive(item.to) }"
          :title="expanded ? undefined : item.label"
          @click="collapse"
        >
          <span class="nav-icon"><Icon :name="item.icon" :size="20" /></span>
          <span class="nav-copy"
            ><b>{{ item.label }}</b
            ><small>{{ item.hint }}</small></span
          >
        </RouterLink>
      </nav>

      <div class="spacer" />
      <span class="group-label">{{ tr("Система", "System", "Sistema") }}</span>
      <RouterLink
        to="/settings"
        class="nav-link"
        :class="{ active: isActive('/settings') }"
        :title="expanded ? undefined : tr('Настройки', 'Settings', 'Ajustes')"
        @click="collapse"
      >
        <span class="nav-icon"><Icon name="settings" :size="20" /></span>
        <span class="nav-copy"
          ><b>{{ tr("Настройки", "Settings", "Ajustes") }}</b
          ><small>{{
            tr(
              "Java, память и интерфейс",
              "Java, memory and interface",
              "Java, memoria e interfaz",
            )
          }}</small></span
        >
      </RouterLink>
    </aside>
  </div>
</template>

<style scoped lang="scss">
.sidebar-slot {
  width: var(--sidebar-w);
  flex: none;
  position: relative;
  z-index: 60;
}
.sidebar {
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--sidebar-w);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 9px 8px 12px;
  overflow: hidden;
  z-index: 1;
  background: var(--surface-1);
  border-right: 1px solid var(--hairline);
  will-change: width, box-shadow;
  transition:
    width 0.22s var(--ease),
    box-shadow 0.22s var(--ease),
    background 0.18s var(--ease);
}
.sidebar.expanded {
  width: var(--sidebar-w-open);
  background: #151a17;
  box-shadow: 22px 0 48px rgba(0, 0, 0, 0.42);
}

.account-link,
.nav-link {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  color: var(--text-2);
  border-radius: 11px;
  white-space: nowrap;
  transition:
    color 0.18s var(--ease-standard),
    background 0.18s var(--ease-standard),
    transform 0.18s var(--ease);
}
.account-link::before,
.nav-link::before {
  content: "";
  position: absolute;
  left: -8px;
  top: 50%;
  width: 3px;
  height: 0;
  border-radius: 0 4px 4px 0;
  transform: translateY(-50%);
  background: var(--green);
  box-shadow: 0 0 12px rgba(86, 197, 104, 0.5);
  transition: height 0.22s var(--ease);
}
.account-link:hover,
.nav-link:hover {
  color: var(--text-0);
  background: var(--surface-3);
  transform: translateX(1px);
}
.account-link.active,
.nav-link.active {
  color: var(--text-0);
  background: var(--green-soft);
}
.account-link.active::before,
.nav-link.active::before {
  height: 24px;
}

.account-link {
  min-height: 66px;
  padding: 0 6px;
  gap: 11px;
}
.avatar-shell {
  position: relative;
  width: 42px;
  height: 42px;
  flex: none;
  display: grid;
  place-items: center;
  overflow: visible;
  border-radius: 11px;
  color: var(--text-2);
  background: var(--surface-3);
  border: 1px solid var(--hairline-strong);
  transition:
    transform 0.2s var(--ease),
    border-color 0.2s,
    box-shadow 0.2s;
}
.avatar-shell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 10px;
  image-rendering: pixelated;
}
.account-link:hover .avatar-shell {
  transform: scale(1.05) rotate(-1deg);
  border-color: var(--green-line);
  box-shadow: 0 5px 16px rgba(0, 0, 0, 0.32);
}
.account-link.active .avatar-shell {
  border-color: var(--green-line);
}
.verified-dot {
  position: absolute;
  right: -3px;
  bottom: -3px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--green);
  border: 2px solid var(--surface-1);
  box-shadow: 0 0 8px rgba(86, 197, 104, 0.7);
}
.account-copy,
.nav-copy {
  min-width: 0;
  flex: 1;
  opacity: 0;
  transform: translateX(-9px);
  transition:
    opacity 0.18s var(--ease) 0.035s,
    transform 0.24s var(--ease) 0.035s;
}
.sidebar.expanded .account-copy,
.sidebar.expanded .nav-copy {
  opacity: 1;
  transform: translateX(0);
}
.account-copy b,
.account-copy small,
.nav-copy b,
.nav-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}
.account-copy b {
  color: var(--text-0);
  font-size: 13.5px;
}
.account-copy small {
  margin-top: 2px;
  color: var(--text-3);
  font-size: 10.5px;
}
.account-arrow {
  opacity: 0;
  transform: translateX(-7px);
  transition:
    opacity 0.18s 0.08s,
    transform 0.22s var(--ease) 0.08s;
}
.sidebar.expanded .account-arrow {
  opacity: 1;
  transform: translateX(0);
}

.rail-divider {
  height: 1px;
  margin: 3px 5px 7px;
  background: var(--hairline);
}
.group-label {
  height: 18px;
  padding: 0 10px;
  color: var(--text-3);
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0;
  transition: opacity 0.16s var(--ease);
}
.sidebar.expanded .group-label {
  opacity: 1;
}
.nav-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.nav-link {
  height: 50px;
  padding: 0 7px;
  gap: 11px;
}
.nav-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  flex: none;
  border-radius: 10px;
  transition:
    color 0.18s,
    background 0.18s,
    transform 0.2s var(--ease);
}
.nav-link:hover .nav-icon {
  color: var(--text-0);
  transform: scale(1.08);
}
.nav-link:active .nav-icon {
  transform: scale(0.92);
}
.nav-link.active .nav-icon {
  color: var(--green);
  background: rgba(86, 197, 104, 0.1);
}
.nav-copy b {
  color: inherit;
  font-size: 13px;
}
.nav-copy small {
  margin-top: 2px;
  color: var(--text-3);
  font-size: 10.5px;
}
.spacer {
  flex: 1;
}
</style>
