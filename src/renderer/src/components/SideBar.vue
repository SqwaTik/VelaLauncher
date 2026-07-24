<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Icon from "./Icon.vue";
import ConfirmDialog from "./ConfirmDialog.vue";
import { useAccountStore } from "@/stores/account";
import { useInstancesStore } from "@/stores/instances";
import { useModsStore } from "@/stores/mods";
import { useLocale } from "@/composables/useLocale";
import generatedLogo from "@/assets/images/royale-logo-transparent.png";
import defaultInstanceIcon from "@/assets/images/minecraft-instance-default.png";

const route = useRoute();
const router = useRouter();
const account = useAccountStore();
const instances = useInstancesStore();
const mods = useModsStore();
const { tr } = useLocale();
const expanded = ref(false);
const createOpen = ref(false);
const editorOpen = ref(false);
const editingId = ref<string | null>(null);
const deleteId = ref<string | null>(null);
const draftName = ref("");
const draftIconDataUrl = ref<string | null>(null);
const draftJavaPath = ref<string | null>(null);
const javaMenuOpen = ref(false);
const draftShared = ref({
  worlds: false,
  resourcePacks: false,
  shaderPacks: false,
});
const contextMenu = ref<{ id: string; x: number; y: number } | null>(null);
const editingInstance = computed(() =>
  instances.instances.find((item) => item.id === editingId.value),
);
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
  {
    to: "/shaders",
    icon: "sparkles",
    label: tr("Шейдеры", "Shaders", "Shaders"),
    hint: tr("Каталог Modrinth", "Modrinth catalog", "Catálogo Modrinth"),
  },
]);

function isActive(path: string): boolean {
  return route.path === path || route.path.startsWith(`${path}/`);
}

function scheduleExpanded(value: boolean): void {
  if (hoverTimer) clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => (expanded.value = value), value ? 105 : 260);
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

function instanceIcon(instanceId: string): string | null {
  const instance = instances.instances.find((item) => item.id === instanceId);
  if (!instance) return null;
  return (
    instance.iconDataUrl ||
    (instance.source === "default" ? generatedLogo : defaultInstanceIcon)
  );
}

async function selectInstance(id: string): Promise<void> {
  contextMenu.value = null;
  const changed = await instances.select(id);
  if (changed || route.path !== "/home") await router.push("/home");
}

function openInstanceMenu(event: MouseEvent, id: string): void {
  event.preventDefault();
  event.stopPropagation();
  contextMenu.value = {
    id,
    x: Math.max(8, Math.min(event.clientX, window.innerWidth - 238)),
    y: Math.max(8, Math.min(event.clientY, window.innerHeight - 286)),
  };
}

function beginCreate(): void {
  if (!instances.canCreate) return;
  draftName.value = `Экземпляр ${instances.instances.length + 1}`;
  draftIconDataUrl.value = null;
  editingId.value = null;
  createOpen.value = true;
  collapse();
}

function beginEdit(id: string): void {
  const instance = instances.instances.find((item) => item.id === id);
  if (!instance) return;
  draftName.value = instance.name;
  draftJavaPath.value = instance.javaPath ?? null;
  javaMenuOpen.value = false;
  draftShared.value = { ...instance.sharedFolders };
  editingId.value = id;
  editorOpen.value = true;
  contextMenu.value = null;
}

async function createInstance(): Promise<void> {
  if (!draftName.value.trim()) return;
  const created = await instances.create(draftName.value);
  if (created) {
    if (draftIconDataUrl.value) {
      await instances.update(created.id, {
        iconDataUrl: draftIconDataUrl.value,
      });
    }
    createOpen.value = false;
  }
}

async function saveInstance(): Promise<void> {
  if (!editingId.value || !draftName.value.trim()) return;
  await instances.update(editingId.value, {
    name: draftName.value.trim(),
    javaPath: draftJavaPath.value,
    sharedFolders: { ...draftShared.value },
  });
  editorOpen.value = false;
}

async function pickDraftIcon(): Promise<void> {
  const path = await window.royale.app.pickImage();
  if (!path) return;
  draftIconDataUrl.value = await window.royale.app.readImage(path);
}

async function pickInstanceJava(): Promise<void> {
  const path = await window.royale.app.pickJava();
  if (path) draftJavaPath.value = path;
  javaMenuOpen.value = false;
}

async function importPack(): Promise<void> {
  createOpen.value = false;
  await mods.importPack();
}

async function confirmDelete(): Promise<void> {
  if (!deleteId.value) return;
  await instances.remove(deleteId.value);
  deleteId.value = null;
}

function closeFloating(): void {
  contextMenu.value = null;
}

watch(() => route.fullPath, collapse);
onMounted(() => {
  window.addEventListener("pointerdown", closeFloating);
  window.addEventListener("resize", closeFloating);
});
onBeforeUnmount(() => {
  if (hoverTimer) clearTimeout(hoverTimer);
  window.removeEventListener("pointerdown", closeFloating);
  window.removeEventListener("resize", closeFloating);
});
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
      <span class="group-label">Экземпляры</span>
      <div class="instance-rail">
        <button
          v-for="instance in instances.ordered"
          :key="instance.id"
          class="instance-link"
          :class="{ active: instance.id === instances.activeId }"
          :title="expanded ? undefined : instance.name"
          @click="selectInstance(instance.id)"
          @contextmenu="openInstanceMenu($event, instance.id)"
        >
          <span class="instance-avatar">
            <img
              v-if="instanceIcon(instance.id)"
              :src="instanceIcon(instance.id)!"
              alt=""
            />
            <i v-if="instance.pinned" class="pin-mark"
              ><Icon name="pin" :size="9"
            /></i>
          </span>
          <span class="instance-copy"
            ><b>{{ instance.name }}</b
            ><small>{{
              instance.source === "imported"
                ? "Импортированная сборка"
                : instance.source === "default"
                  ? "Основной экземпляр"
                  : "Локальный экземпляр"
            }}</small></span
          >
          <span
            class="instance-more"
            title="Параметры"
            role="button"
            tabindex="0"
            @click.stop="beginEdit(instance.id)"
            @keydown.enter.stop="beginEdit(instance.id)"
            ><Icon name="more" :size="16"
          /></span>
        </button>
        <button
          class="instance-link add-instance"
          :disabled="!instances.canCreate"
          :title="
            instances.canCreate
              ? 'Создать экземпляр'
              : 'Достигнут лимит: 4 экземпляра'
          "
          @click="beginCreate"
        >
          <span class="instance-avatar"><Icon name="plus" :size="20" /></span>
          <span class="instance-copy"
            ><b>Создать экземпляр</b
            ><small>{{ instances.instances.length }}/4</small></span
          >
        </button>
      </div>

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

    <Teleport to="body">
      <Transition name="context-pop">
        <div
          v-if="contextMenu"
          class="instance-context"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          @pointerdown.stop
        >
          <button @click="instances.togglePinned(contextMenu.id); contextMenu = null">
            <Icon
              :name="
                instances.instances.find((item) => item.id === contextMenu?.id)
                  ?.pinned
                  ? 'pinOff'
                  : 'pin'
              "
              :size="16"
            />{{
              instances.instances.find((item) => item.id === contextMenu?.id)
                ?.pinned
                ? "Открепить"
                : "Закрепить"
            }}
          </button>
          <button @click="beginEdit(contextMenu.id)">
            <Icon name="settings" :size="16" />Параметры
          </button>
          <button @click="instances.reveal(contextMenu.id); contextMenu = null">
            <Icon name="folder" :size="16" />Открыть папку экземпляра
          </button>
          <button
            :disabled="!instances.canCreate"
            @click="instances.duplicate(contextMenu.id); contextMenu = null"
          >
            <Icon name="copy" :size="16" />Дублировать
          </button>
          <i />
          <button
            class="danger"
            :disabled="
              instances.instances.find((item) => item.id === contextMenu?.id)
                ?.source === 'default'
            "
            @click="
              deleteId = contextMenu.id;
              contextMenu = null;
            "
          >
            <Icon name="trash" :size="16" />Удалить экземпляр
          </button>
        </div>
      </Transition>

      <Transition name="instance-modal">
        <div
          v-if="createOpen"
          class="instance-modal-backdrop"
          @click.self="createOpen = false"
        >
          <section class="instance-modal">
            <header>
              <button
                class="instance-icon-editor create-icon-editor"
                title="Выбрать значок"
                @click="pickDraftIcon"
              >
                <img v-if="draftIconDataUrl" :src="draftIconDataUrl" alt="" />
                <img v-else :src="defaultInstanceIcon" alt="" />
                <span><Icon name="pencil" :size="15" /></span>
              </button>
              <div>
                <p>Новый экземпляр</p>
                <h2>Создать отдельную сборку</h2>
              </div>
              <button class="modal-close" @click="createOpen = false">
                <Icon name="close" :size="18" />
              </button>
            </header>
            <label class="instance-name-field"
              ><span>Название</span
              ><input
                v-model="draftName"
                maxlength="40"
                autofocus
                @keyup.enter="createInstance"
            /></label>
            <p class="instance-help">
              У экземпляра будут собственные моды, настройки и файлы игры.
              Версия Royale Master настраивается автоматически.
            </p>
            <footer>
              <button class="import-compact" @click="importPack">
                <Icon name="import" :size="17" />
                <span>Импортировать .mrpack или .zip</span>
              </button>
              <button class="create-primary" @click="createInstance">
                Создать
              </button>
            </footer>
          </section>
        </div>
      </Transition>

      <Transition name="instance-modal">
        <div
          v-if="editorOpen && editingInstance"
          class="instance-modal-backdrop"
          @click.self="editorOpen = false"
        >
          <section class="instance-modal settings-modal">
            <header>
              <button
                class="instance-icon-editor"
                title="Изменить значок"
                @click="instances.pickIcon(editingInstance.id)"
              >
                <img
                  v-if="instanceIcon(editingInstance.id)"
                  :src="instanceIcon(editingInstance.id)!"
                  alt=""
                />
                <span><Icon name="pencil" :size="15" /></span>
              </button>
              <div>
                <p>Параметры экземпляра</p>
                <h2>{{ editingInstance.name }}</h2>
              </div>
              <button class="modal-close" @click="editorOpen = false">
                <Icon name="close" :size="18" />
              </button>
            </header>
            <label class="instance-name-field"
              ><span>Название</span
              ><input v-model="draftName" maxlength="40"
            /></label>
            <div class="instance-java">
              <span>Java для этого экземпляра</span>
              <button
                class="instance-java-select"
                :class="{ open: javaMenuOpen }"
                @click="javaMenuOpen = !javaMenuOpen"
              >
                <span
                  ><b>{{
                    draftJavaPath ? "Свой java.exe" : "Автоматически"
                  }}</b
                  ><small>{{
                    draftJavaPath ||
                    "Лаунчер найдёт Java 21+ и проверит её перед запуском"
                  }}</small></span
                ><Icon name="chevron" :size="16" />
              </button>
              <Transition name="context-pop">
                <div v-if="javaMenuOpen" class="java-options">
                  <button
                    @click="
                      draftJavaPath = null;
                      javaMenuOpen = false;
                    "
                  >
                    <Icon name="sparkles" :size="16" /><span
                      ><b>Автоматически</b
                      ><small>Поиск Java 21+ перед запуском</small></span
                    >
                  </button>
                  <button @click="pickInstanceJava">
                    <Icon name="folder" :size="16" /><span
                      ><b>Выбрать java.exe</b
                      ><small>Указать свой исполняемый файл</small></span
                    >
                  </button>
                </div>
              </Transition>
            </div>
            <div class="shared-folders">
              <h3>Общий доступ к папкам</h3>
              <label
                ><input
                  v-model="draftShared.worlds"
                  type="checkbox"
                />Миры</label
              ><label
                ><input
                  v-model="draftShared.resourcePacks"
                  type="checkbox"
                />Ресурспаки</label
              ><label
                ><input
                  v-model="draftShared.shaderPacks"
                  type="checkbox"
                />Шейдеры</label
              >
            </div>
            <footer>
              <button class="import-compact" @click="editorOpen = false">
                Отмена
              </button>
              <button class="create-primary" @click="saveInstance">
                Сохранить
              </button>
            </footer>
          </section>
        </div>
      </Transition>

      <ConfirmDialog
        v-if="deleteId"
        title="Удалить экземпляр?"
        message="Экземпляр исчезнет из лаунчера. Файлы останутся на диске, чтобы их можно было восстановить."
        @cancel="deleteId = null"
        @confirm="confirmDelete"
      />
    </Teleport>
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
    width 0.27s var(--ease),
    box-shadow 0.27s var(--ease),
    background 0.2s var(--ease);
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
  overflow: hidden;
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
.sidebar:not(.expanded) .account-link,
.sidebar:not(.expanded) .nav-link,
.sidebar:not(.expanded) .instance-link {
  justify-content: center;
  padding-inline: 0;
  gap: 0;
}
.sidebar:not(.expanded) .account-copy,
.sidebar:not(.expanded) .nav-copy,
.sidebar:not(.expanded) .instance-copy,
.sidebar:not(.expanded) .account-arrow,
.sidebar:not(.expanded) .instance-more {
  position: absolute;
  pointer-events: none;
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
.instance-rail {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.instance-link {
  position: relative;
  width: 100%;
  min-height: 43px;
  padding: 2px 7px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-2);
  border-radius: 12px;
  text-align: left;
  white-space: nowrap;
  transition:
    color 0.16s var(--ease),
    background 0.16s var(--ease),
    transform 0.16s var(--ease);
}
.instance-link::before {
  content: "";
  position: absolute;
  left: -8px;
  top: 50%;
  width: 3px;
  height: 0;
  border-radius: 0 3px 3px 0;
  transform: translateY(-50%);
  background: var(--green);
  transition: height 0.18s var(--ease);
}
.instance-link:hover {
  color: var(--text-0);
  background: var(--surface-3);
}
.instance-link.active {
  color: var(--text-0);
  background: rgba(86, 197, 104, 0.08);
}
.instance-link.active::before {
  height: 23px;
}
.instance-avatar {
  position: relative;
  width: 37px;
  height: 37px;
  flex: none;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 50%;
  color: var(--text-2);
  background:
    radial-gradient(circle at 35% 25%, #26342b, #151c18 70%);
  border: 1px solid var(--hairline-strong);
  transition:
    border-radius 0.2s var(--ease),
    border-color 0.18s,
    transform 0.18s var(--ease);
}
.instance-avatar img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.instance-link:hover .instance-avatar,
.instance-link.active .instance-avatar {
  border-radius: 12px;
  border-color: var(--green-line);
}
.instance-link:active .instance-avatar {
  transform: scale(0.92);
}
.pin-mark {
  position: absolute;
  right: -1px;
  top: -1px;
  width: 15px;
  height: 15px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #071109;
  background: var(--green);
  border: 2px solid var(--surface-1);
}
.instance-copy {
  min-width: 0;
  flex: 1;
  opacity: 0;
  transform: translateX(-8px);
  transition:
    opacity 0.16s var(--ease) 0.035s,
    transform 0.2s var(--ease) 0.035s;
}
.sidebar.expanded .instance-copy {
  opacity: 1;
  transform: translateX(0);
}
.instance-copy b,
.instance-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}
.instance-copy b {
  color: inherit;
  font-size: 12px;
}
.instance-copy small {
  margin-top: 2px;
  color: var(--text-3);
  font-size: 9.5px;
}
.instance-more {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  flex: none;
  border-radius: 9px;
  opacity: 0;
  color: var(--text-3);
  cursor: pointer;
  transition:
    opacity 0.16s,
    color 0.16s,
    background 0.16s,
    transform 0.16s;
}
.sidebar.expanded .instance-link:hover .instance-more {
  opacity: 1;
}
.instance-more:hover {
  color: var(--text-0);
  background: var(--surface-4);
  transform: scale(1.05);
}
.instance-more:active {
  transform: scale(0.9);
}
.add-instance .instance-avatar {
  border-style: dashed;
  background: transparent;
}
.add-instance:disabled {
  opacity: 0.34;
  pointer-events: none;
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

.instance-context {
  position: fixed;
  z-index: 950;
  width: 230px;
  padding: 6px;
  border-radius: 14px;
  color: var(--text-1);
  background: rgba(20, 25, 22, 0.98);
  border: 1px solid var(--hairline-strong);
  box-shadow: 0 20px 70px rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(18px);
}
.instance-context button {
  width: 100%;
  height: 38px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 9px;
  color: inherit;
  font-size: 11px;
  text-align: left;
  transition:
    color 0.15s,
    background 0.15s;
}
.instance-context button:hover {
  color: var(--text-0);
  background: var(--surface-4);
}
.instance-context button.danger {
  color: var(--danger);
}
.instance-context button:disabled {
  opacity: 0.3;
  pointer-events: none;
}
.instance-context > i {
  display: block;
  height: 1px;
  margin: 5px 4px;
  background: var(--hairline);
}
.context-pop-enter-active,
.context-pop-leave-active {
  transition:
    opacity 0.14s var(--ease),
    transform 0.14s var(--ease);
  transform-origin: top left;
}
.context-pop-enter-from,
.context-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}
.instance-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 900;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(3, 7, 5, 0.74);
  backdrop-filter: blur(10px);
}
.instance-modal {
  width: min(560px, 100%);
  padding: 22px;
  border-radius: 20px;
  color: var(--text-1);
  background:
    linear-gradient(145deg, rgba(26, 34, 29, 0.98), rgba(16, 21, 18, 0.98));
  border: 1px solid var(--hairline-strong);
  box-shadow: 0 30px 110px rgba(0, 0, 0, 0.58);
}
.instance-modal > header {
  display: flex;
  align-items: center;
  gap: 12px;
}
.modal-symbol,
.instance-icon-editor {
  width: 58px;
  height: 58px;
  flex: none;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 15px;
  color: var(--green);
  background: var(--green-soft);
  border: 1px solid var(--green-line);
}
.instance-modal header > div {
  min-width: 0;
  flex: 1;
}
.instance-modal header p {
  color: var(--green);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.instance-modal header h2 {
  margin-top: 3px;
  color: var(--text-0);
  font-size: 18px;
}
.modal-close {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  color: var(--text-2);
  transition:
    color 0.15s,
    background 0.15s,
    transform 0.15s;
}
.modal-close:hover {
  color: var(--text-0);
  background: var(--surface-4);
  transform: rotate(5deg);
}
.instance-name-field {
  margin-top: 20px;
  display: grid;
  gap: 7px;
}
.instance-name-field span,
.shared-folders h3 {
  color: var(--text-2);
  font-size: 10px;
  font-weight: 700;
}
.instance-name-field input {
  height: 48px;
  padding: 0 14px;
  border-radius: 12px;
  color: var(--text-0);
  background: var(--surface-2);
  border: 1px solid var(--hairline-strong);
  outline: none;
  transition:
    border-color 0.16s,
    box-shadow 0.16s;
}
.instance-name-field input:focus {
  border-color: var(--green-line);
  box-shadow: 0 0 0 3px rgba(86, 197, 104, 0.08);
}
.instance-help {
  margin-top: 10px;
  color: var(--text-3);
  font-size: 10.5px;
  line-height: 1.55;
}
.instance-java {
  position: relative;
  margin-top: 17px;
}
.instance-java > span {
  display: block;
  margin-bottom: 7px;
  color: var(--text-2);
  font-size: 10px;
  font-weight: 700;
}
.instance-java-select {
  width: 100%;
  min-height: 54px;
  padding: 9px 12px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 12px;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--hairline-strong);
  text-align: left;
  transition:
    color 0.16s,
    border-color 0.16s,
    background 0.16s;
}
.instance-java-select:hover,
.instance-java-select.open {
  color: var(--text-0);
  border-color: var(--green-line);
  background: var(--surface-3);
}
.instance-java-select > span {
  min-width: 0;
  flex: 1;
}
.instance-java-select b,
.instance-java-select small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.instance-java-select b {
  color: inherit;
  font-size: 11px;
}
.instance-java-select small {
  margin-top: 3px;
  color: var(--text-3);
  font-size: 9px;
}
.instance-java-select > svg {
  transition: transform 0.18s var(--ease);
}
.instance-java-select.open > svg {
  transform: rotate(90deg);
}
.java-options {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 7px);
  z-index: 6;
  padding: 5px;
  border-radius: 13px;
  background: rgba(20, 26, 22, 0.99);
  border: 1px solid var(--hairline-strong);
  box-shadow: 0 18px 55px rgba(0, 0, 0, 0.5);
}
.java-options button {
  width: 100%;
  min-height: 46px;
  padding: 7px 9px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 9px;
  color: var(--text-2);
  text-align: left;
}
.java-options button:hover {
  color: var(--text-0);
  background: var(--surface-4);
}
.java-options button > span {
  min-width: 0;
}
.java-options b,
.java-options small {
  display: block;
}
.java-options b {
  font-size: 10.5px;
}
.java-options small {
  margin-top: 2px;
  color: var(--text-3);
  font-size: 8.5px;
}
.instance-modal > footer {
  margin-top: 21px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
}
.import-compact,
.create-primary {
  min-height: 40px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 11px;
  font-size: 11px;
  font-weight: 700;
}
.import-compact {
  margin-right: auto;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
}
.import-compact:hover {
  color: var(--text-0);
  border-color: var(--hairline-strong);
}
.create-primary {
  color: #071109;
  background: var(--green);
  box-shadow: 0 8px 24px rgba(86, 197, 104, 0.2);
}
.instance-icon-editor {
  position: relative;
  overflow: visible;
  border-radius: 17px;
}
.instance-icon-editor img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  border-radius: 16px;
  image-rendering: pixelated;
}
.instance-icon-editor > span {
  position: absolute;
  right: -4px;
  bottom: -4px;
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  color: #071109;
  background: var(--green);
  border: 3px solid var(--surface-1);
  border-radius: 50%;
  opacity: 1;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.35);
  transition:
    transform 0.16s var(--ease),
    background 0.16s;
}
.instance-icon-editor:hover > span {
  transform: scale(1.08);
  background: color-mix(in srgb, var(--green) 84%, white);
}
.shared-folders {
  margin-top: 17px;
  padding: 14px;
  display: flex;
  align-items: center;
  gap: 16px;
  border-radius: 13px;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
}
.shared-folders h3 {
  margin-right: auto;
}
.shared-folders label {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-2);
  font-size: 10.5px;
}
.shared-folders input {
  accent-color: var(--green);
}
.instance-modal-enter-active,
.instance-modal-leave-active {
  transition: opacity 0.18s var(--ease);
}
.instance-modal-enter-active .instance-modal,
.instance-modal-leave-active .instance-modal {
  transition: transform 0.22s var(--ease);
}
.instance-modal-enter-from,
.instance-modal-leave-to {
  opacity: 0;
}
.instance-modal-enter-from .instance-modal,
.instance-modal-leave-to .instance-modal {
  transform: translateY(12px) scale(0.98);
}
</style>
