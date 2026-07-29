<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import Icon from "@/components/Icon.vue";
import UiSwitch from "@/components/ui/UiSwitch.vue";
import FabricLogo from "@/components/FabricLogo.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import MarkdownContent from "@/components/MarkdownContent.vue";
import { GAME } from "@shared/constants";
import type { InstalledMod, ModProject } from "@shared/types";
import { useModsStore } from "@/stores/mods";
import { useResourcesStore } from "@/stores/resources";
import { useShadersStore } from "@/stores/shaders";
import { useSettingsStore } from "@/stores/settings";
import { useLocale } from "@/composables/useLocale";

const route = useRoute();
const resourceMode = route.name === "resources";
const shaderMode = route.name === "shaders";
const fileMode = resourceMode || shaderMode;
const baseMods = useModsStore();
const resourcesStore = useResourcesStore();
const shadersStore = useShadersStore();
const mods = (shaderMode
  ? shadersStore
  : resourceMode
    ? resourcesStore
    : baseMods) as unknown as ReturnType<typeof useModsStore>;
const settingsStore = useSettingsStore();
const { language, tr } = useLocale();
const tab = ref<"market" | "installed">(
  route.query.tab === "installed" ? "installed" : "market",
);
const query = ref("");
const category = ref("all");
const sort = ref("relevance");
const filtersOpen = ref(false);
const selected = ref<Set<string>>(new Set());
const pendingRemoval = ref<InstalledMod[]>([]);
const detail = ref<{ project: ModProject; installed?: InstalledMod } | null>(
  null,
);
const detailLoading = ref(false);
const galleryIndex = ref(0);
const contextMenu = ref<{
  item: InstalledMod;
  x: number;
  y: number;
} | null>(null);

const modCategories = [
  { id: "all", label: "Все категории", icon: "layers" },
  { id: "optimization", label: "Оптимизация", icon: "gauge" },
  { id: "utility", label: "Утилиты", icon: "settings" },
  { id: "adventure", label: "Приключения", icon: "gamepad" },
  { id: "library", label: "Библиотеки", icon: "code" },
  { id: "decoration", label: "Декор", icon: "image" },
  { id: "worldgen", label: "Генерация мира", icon: "globe" },
  { id: "technology", label: "Технологии", icon: "chip" },
  { id: "magic", label: "Магия", icon: "brush" },
];
const resourceCategories = [
  { id: "all", label: "Все категории", icon: "layers" },
  { id: "16x-or-lower", label: "16× и меньше", icon: "image" },
  { id: "32x", label: "32×", icon: "image" },
  { id: "64x", label: "64×", icon: "image" },
  { id: "128x", label: "128×", icon: "gallery" },
  { id: "256x", label: "256×", icon: "gallery" },
  { id: "512x-or-higher", label: "512× и выше", icon: "expand" },
  { id: "audio", label: "Звуки", icon: "video" },
  { id: "fonts", label: "Шрифты", icon: "code" },
  { id: "gui", label: "Интерфейс", icon: "sliders" },
  { id: "models", label: "3D-модели", icon: "cube" },
];
const shaderCategories = [
  { id: "all", label: "Все категории", icon: "layers" },
  { id: "fantasy", label: "Фэнтези", icon: "sparkles" },
  { id: "realistic", label: "Реалистичные", icon: "image" },
  { id: "semi-realistic", label: "Полуреалистичные", icon: "gallery" },
  { id: "vanilla-like", label: "В стиле Vanilla", icon: "cube" },
  { id: "cartoon", label: "Мультяшные", icon: "palette" },
  { id: "potato", label: "Для слабых ПК", icon: "gauge" },
];
const categories = shaderMode
  ? shaderCategories
  : resourceMode
    ? resourceCategories
    : modCategories;
const sorts = [
  { id: "relevance", label: "Релевантность" },
  { id: "downloads", label: "Загрузки" },
  { id: "follows", label: "Подписки" },
  { id: "newest", label: "Сначала новые" },
  { id: "updated", label: "Недавно обновлены" },
];
const installedFiltered = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return needle
    ? mods.installed.filter((item) =>
        `${item.title || ""} ${item.filename}`.toLowerCase().includes(needle),
      )
    : mods.installed;
});
const selectedItems = computed(() =>
  mods.installed.filter((item) => selected.value.has(item.filename)),
);
const allSelected = computed(
  () =>
    Boolean(installedFiltered.value.length) &&
    installedFiltered.value.every((item) => selected.value.has(item.filename)),
);
const activeCategoryLabel = computed(
  () => categories.find((item) => item.id === category.value)?.label,
);
const canLoadMore = computed(
  () => mods.results.length < mods.totalHits && !mods.loading,
);
const currentGallery = computed(
  () => detail.value?.project.gallery[galleryIndex.value] ?? null,
);
const contentIcon = computed(() =>
  shaderMode ? "sparkles" : resourceMode ? "palette" : "mods",
);
const pageTitle = computed(() =>
  shaderMode ? "Шейдеры" : resourceMode ? "Ресурспаки" : "Модификации",
);
const typeLabel = computed(() =>
  shaderMode ? "Shader pack" : resourceMode ? "Resource pack" : "Fabric",
);
const searchMarketPlaceholder = computed(() =>
  shaderMode
    ? "Найти шейдер в Modrinth…"
    : resourceMode
      ? "Найти ресурспак в Modrinth…"
      : "Найти мод в Modrinth…",
);
const searchInstalledPlaceholder = computed(() =>
  shaderMode
    ? "Поиск среди шейдеров…"
    : resourceMode
      ? "Поиск среди ресурспаков…"
      : "Поиск среди установленных…",
);
const compatibleLabel = computed(() =>
  shaderMode
    ? "совместимых шейдеров"
    : resourceMode
      ? "совместимых ресурспаков"
      : "совместимых модов",
);
const singularLabel = computed(() =>
  shaderMode ? "шейдерпак" : resourceMode ? "ресурспак" : "мод",
);
const pluralForms = computed<[string, string, string]>(() =>
  shaderMode
    ? ["шейдерпак", "шейдерпака", "шейдерпаков"]
    : resourceMode
      ? ["ресурспак", "ресурспака", "ресурспаков"]
      : ["мод", "мода", "модов"],
);

watch(
  () => route.query.tab,
  (value) => {
    if (value === "market" || value === "installed") tab.value = value;
  },
);

function formatDownloads(value: number): string {
  return new Intl.NumberFormat(language.value, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
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
async function install(project: ModProject): Promise<void> {
  await mods.installLatest(project);
  if (fileMode) await settingsStore.refreshGameContent();
}
function toggleSelected(filename: string): void {
  const next = new Set(selected.value);
  next.has(filename) ? next.delete(filename) : next.add(filename);
  selected.value = next;
}
function toggleAll(): void {
  const next = new Set(selected.value);
  if (allSelected.value)
    installedFiltered.value.forEach((item) => next.delete(item.filename));
  else installedFiltered.value.forEach((item) => next.add(item.filename));
  selected.value = next;
}
async function bulkToggle(enabled: boolean): Promise<void> {
  await mods.toggleMany(selectedItems.value, enabled);
  selected.value = new Set();
}
async function askRemove(items: InstalledMod[]): Promise<void> {
  if (!items.length) return;
  if (settingsStore.settings?.confirmModDelete === false) {
    await mods.removeMany(items);
    if (fileMode) await settingsStore.refreshGameContent();
    selected.value = new Set();
    return;
  }
  pendingRemoval.value = items;
}
async function confirmRemove(dontAsk: boolean): Promise<void> {
  const items = pendingRemoval.value;
  pendingRemoval.value = [];
  await mods.removeMany(items);
  if (fileMode) await settingsStore.refreshGameContent();
  selected.value = new Set();
  if (dontAsk && settingsStore.settings) {
    settingsStore.settings.confirmModDelete = false;
    settingsStore.save();
  }
}
async function openDetails(
  project: ModProject,
  installed?: InstalledMod,
): Promise<void> {
  detail.value = { project, installed };
  galleryIndex.value = 0;
  if (!project.project_id) return;
  detailLoading.value = true;
  try {
    const full = await mods.loadProject(project.project_id);
    detail.value = {
      project: { ...project, ...full, author: project.author || full.author },
      installed,
    };
  } finally {
    detailLoading.value = false;
  }
}
function openInstalled(item: InstalledMod): void {
  const project: ModProject = {
    project_id: item.projectId || "",
    slug: item.slug || "",
    title: item.title || item.filename,
    description:
      item.description ||
      (shaderMode
        ? "Локальный шейдерпак без данных каталога."
        : resourceMode
          ? "Локальный ресурспак без данных каталога."
          : "Локальный мод без данных каталога."),
    body: item.body,
    author: "",
    downloads: 0,
    follows: 0,
    categories: [],
    icon_url: item.iconUrl || null,
    gallery: item.gallery || [],
    project_type: shaderMode ? "shader" : resourceMode ? "resourcepack" : "mod",
  };
  void openDetails(project, item);
}
function external(project: ModProject): void {
  if (project.slug)
    void window.royale.app.openExternal(
      `https://modrinth.com/${shaderMode ? "shader" : resourceMode ? "resourcepack" : "mod"}/${project.slug}`,
    );
}
function removeDetailed(): void {
  const installed = detail.value?.installed;
  if (!installed) return;
  detail.value = null;
  void askRemove([installed]);
}
function showContext(event: MouseEvent, item: InstalledMod): void {
  event.preventDefault();
  const width = 220;
  const height = 252;
  contextMenu.value = {
    item,
    x: Math.min(event.clientX, window.innerWidth - width - 10),
    y: Math.min(event.clientY, window.innerHeight - height - 10),
  };
}
function closeContext(): void {
  contextMenu.value = null;
}
async function contextToggle(item: InstalledMod): Promise<void> {
  closeContext();
  await mods.toggle(item);
}
async function reveal(item: InstalledMod): Promise<void> {
  closeContext();
  await (shaderMode
    ? window.royale.shaders.reveal(item.filename)
    : resourceMode
      ? window.royale.resources.reveal(item.filename)
      : window.royale.mods.reveal(item.filename));
}
function contextRemove(item: InstalledMod): void {
  closeContext();
  void askRemove([item]);
}

let searchTimer: ReturnType<typeof setTimeout> | null = null;
watch(query, () => {
  if (tab.value !== "market") return;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(
    () => void mods.search(query.value, category.value, sort.value),
    260,
  );
});
watch([category, sort], () => {
  if (tab.value === "market")
    void mods.search(query.value, category.value, sort.value);
});
watch(tab, () => {
  query.value = "";
  selected.value = new Set();
});
onMounted(async () => {
  window.addEventListener("pointerdown", closeContext);
  window.addEventListener("blur", closeContext);
  if (fileMode) (mods as unknown as { subscribe: () => void }).subscribe();
  await mods.loadInstalled();
  await mods.search("", "all", "relevance");
});

async function importPack(): Promise<void> {
  await baseMods.importPack();
  await Promise.allSettled([
    baseMods.loadInstalled(),
    resourcesStore.loadInstalled(),
    shadersStore.loadInstalled(),
    settingsStore.refreshGameContent(),
  ]);
}

function exportPack(): void {
  void baseMods.exportPack();
}
onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", closeContext);
  window.removeEventListener("blur", closeContext);
});
</script>

<template>
  <div class="mods-page">
    <header class="mods-head">
      <div>
        <p class="eyebrow">Royale Master</p>
        <h1>{{ pageTitle }}</h1>
      </div>
      <div class="instance-facts">
        <div>
          <small>Minecraft</small><b>{{ GAME.minecraftVersion }}</b>
        </div>
        <i />
        <div v-if="!fileMode" class="fabric-fact">
          <FabricLogo />
          <p>
            <small>Загрузчик</small><b>Fabric {{ GAME.fabricLoader }}</b>
          </p>
        </div>
        <div v-else class="fabric-fact">
          <Icon :name="contentIcon" :size="24" />
          <p>
            <small>{{ tr("Тип", "Type", "Tipo") }}</small
            ><b>{{ typeLabel }}</b>
          </p>
        </div>
        <i />
        <div>
          <small>{{ tr("Установлено", "Installed", "Instalados") }}</small
          ><b>{{ mods.installed.length }}</b>
        </div>
      </div>
    </header>
    <div class="market-bar">
      <nav class="tabs">
        <button :class="{ active: tab === 'market' }" @click="tab = 'market'">
          <Icon name="market" :size="18" />{{
            tr("Маркет", "Market", "Mercado")
          }}</button
        ><button
          :class="{ active: tab === 'installed' }"
          @click="tab = 'installed'"
        >
          <Icon name="installed" :size="18" />{{
            tr("Установленные", "Installed", "Instalados")
          }}<b>{{ mods.installed.length }}</b>
        </button>
      </nav>
      <div class="search-tools">
        <template v-if="!fileMode">
          <button
            class="tool-button pack-tool"
            :disabled="baseMods.packBusy"
            title="Импортировать .mrpack или .zip"
            aria-label="Импортировать сборку"
            @click="importPack"
          >
            <Icon name="import" :size="18" />
          </button>
          <button
            class="tool-button pack-tool"
            :disabled="baseMods.packBusy"
            title="Экспортировать сборку"
            aria-label="Экспортировать сборку"
            @click="exportPack"
          >
            <Icon name="share" :size="18" />
          </button>
        </template>
        <label class="mod-search"
          ><Icon name="search" :size="18" /><input
            v-model="query"
            :placeholder="
              tab === 'market'
                ? searchMarketPlaceholder
                : searchInstalledPlaceholder
            " /></label
        ><button
          v-if="tab === 'market'"
          class="tool-button"
          :class="{ filtered: category !== 'all' }"
          @click="filtersOpen = true"
        >
          <Icon name="filters" :size="18" />{{
            tr("Фильтры", "Filters", "Filtros")
          }}<i v-if="category !== 'all'" />
        </button>
      </div>
    </div>
    <Transition name="fade">
      <div
        v-if="!fileMode && baseMods.packBusy && baseMods.packProgress"
        class="pack-progress"
      >
        <Icon name="spinner" :size="15" class="spin" />
        <span>
          <b>{{ baseMods.packProgress.message }}</b>
          <small v-if="baseMods.packProgress.detail">{{
            baseMods.packProgress.detail
          }}</small>
        </span>
        <i :style="{ width: `${baseMods.packProgress.progress * 100}%` }" />
      </div>
    </Transition>

    <div v-if="tab === 'market'">
      <div class="result-line">
        <p>
          <b>{{ mods.totalHits.toLocaleString(language) }}</b>
          {{ compatibleLabel }}
        </p>
        <div>
          <span v-if="category !== 'all'">{{ activeCategoryLabel }}</span
          ><span>{{ GAME.minecraftVersion }}</span
          ><span>{{ typeLabel }}</span>
        </div>
      </div>
      <Transition name="fade"
        ><p v-if="mods.error" class="message error">
          <Icon name="alert" :size="16" />{{ mods.error }}
        </p></Transition
      >
      <div v-if="mods.loading && !mods.results.length" class="mod-grid">
        <article v-for="item in 8" :key="item" class="mod-card skeleton">
          <span class="mod-icon-shell shimmer" />
          <div>
            <i class="line wide shimmer" /><i class="line shimmer" /><i
              class="line short shimmer"
            />
          </div>
        </article>
      </div>
      <div v-else class="mod-grid">
        <article
          v-for="project in mods.results"
          :key="project.project_id"
          class="mod-card"
          tabindex="0"
          @click="openDetails(project)"
          @keydown.enter="openDetails(project)"
        >
          <div class="mod-icon-shell">
            <img
              v-if="project.icon_url"
              :src="project.icon_url"
              alt=""
              loading="eager"
              decoding="async"
            /><Icon v-else :name="contentIcon" :size="27" />
          </div>
          <div class="mod-copy">
            <div class="mod-title">
              <div>
                <h3>{{ project.title }}</h3>
                <span>от {{ project.author }}</span>
              </div>
              <span class="downloads"
                ><Icon name="download" :size="13" />{{
                  formatDownloads(project.downloads)
                }}</span
              >
            </div>
            <p>{{ project.description }}</p>
            <div class="compatibility">
              <span><i />Совместим</span><b>{{ GAME.minecraftVersion }}</b
              ><b>{{ fileMode ? "ZIP" : "Fabric" }}</b>
            </div>
          </div>
          <div class="mod-actions" @click.stop>
            <button class="more-button" @click="openDetails(project)">
              {{ tr("Подробнее", "Details", "Detalles") }}</button
            ><button
              v-if="!mods.isInstalled(project)"
              class="install-button"
              :disabled="mods.busy.has(project.project_id)"
              @click="install(project)"
            >
              <Icon
                :name="
                  mods.busy.has(project.project_id) ? 'spinner' : 'download'
                "
                :size="16"
                :class="{ spin: mods.busy.has(project.project_id) }"
              />{{
                mods.busy.has(project.project_id)
                  ? tr("Установка…", "Installing…", "Instalando…")
                  : tr("Установить", "Install", "Instalar")
              }}
            </button>
          </div>
        </article>
      </div>
      <div v-if="!mods.loading && !mods.results.length" class="empty-view">
        <span><Icon name="search" :size="28" /></span>
        <h3>Ничего не найдено</h3>
        <p>Измените запрос или сбросьте фильтры.</p>
      </div>
      <div v-if="canLoadMore" class="load-more">
        <button class="btn" @click="mods.search(query, category, sort, true)">
          Показать ещё
        </button>
      </div>
    </div>

    <div v-else>
      <div class="installed-toolbar">
        <button
          class="select-all"
          :class="{ checked: allSelected }"
          @click="toggleAll"
        >
          <span><Icon v-if="allSelected" name="check" :size="14" /></span
          >{{
            allSelected
              ? tr("Снять выделение", "Clear selection", "Borrar selección")
              : tr("Выбрать всё", "Select all", "Seleccionar todo")
          }}
        </button>
        <div>
          <b>{{ russianCount(mods.installed.length, ...pluralForms) }}</b>
        </div>
      </div>
      <Transition name="bulk"
        ><div v-if="selectedItems.length" class="bulk-bar">
          <p>
            <Icon name="checkSquare" :size="17" /><b
              >Выбрано: {{ selectedItems.length }}</b
            >
          </p>
          <div>
            <button v-if="!fileMode" @click="bulkToggle(true)">
              <Icon name="power" :size="15" />{{
                tr("Включить", "Enable", "Activar")
              }}</button
            ><button v-if="!fileMode" @click="bulkToggle(false)">
              <Icon name="powerOff" :size="15" />{{
                tr("Отключить", "Disable", "Desactivar")
              }}</button
            ><button class="danger" @click="askRemove(selectedItems)">
              <Icon name="trash" :size="15" />{{
                tr("Удалить", "Delete", "Eliminar")
              }}
            </button>
          </div>
        </div></Transition
      >
      <div v-if="installedFiltered.length" class="installed-list">
        <article
          v-for="item in installedFiltered"
          :key="item.filename"
          :class="{
            disabled: !item.enabled,
            selected: selected.has(item.filename),
          }"
          @click="openInstalled(item)"
          @contextmenu="showContext($event, item)"
        >
          <button
            class="select-box"
            :class="{ checked: selected.has(item.filename) }"
            @click.stop="toggleSelected(item.filename)"
          >
            <Icon
              v-if="selected.has(item.filename)"
              name="check"
              :size="14"
            /></button
          ><span class="installed-icon"
            ><img
              v-if="item.iconUrl"
              :src="item.iconUrl"
              alt=""
              loading="eager" /><Icon v-else :name="contentIcon" :size="22"
          /></span>
          <div class="installed-copy">
            <h3>{{ item.title || item.filename }}</h3>
            <p>{{ item.description || item.filename }}</p>
            <small
              >{{ item.filename
              }}<template v-if="item.versionNumber">
                · {{ item.versionNumber }}</template
              ></small
            >
          </div>
          <div v-if="!fileMode" @click.stop>
            <UiSwitch
              :model-value="item.enabled"
              @update:model-value="mods.toggle(item)"
            />
          </div>
          <button
            class="remove-button"
            title="Удалить"
            @click.stop="askRemove([item])"
          >
            <Icon name="trash" :size="16" />
          </button>
        </article>
      </div>
      <div v-else class="empty-view">
        <span><Icon name="installed" :size="28" /></span>
        <h3>
          {{
            mods.installed.length
              ? "По запросу ничего нет"
              : shaderMode
                ? "Шейдеры ещё не установлены"
                : resourceMode
                  ? "Ресурспаки ещё не установлены"
                  : "Моды ещё не установлены"
          }}
        </h3>
        <p>
          {{
            mods.installed.length
              ? "Измените строку поиска."
              : shaderMode
                ? "Откройте Маркет и установите первый шейдер."
                : resourceMode
                  ? "Откройте Маркет и установите первый ресурспак."
                  : "Откройте Маркет и установите первый мод."
          }}
        </p>
        <button
          v-if="!mods.installed.length"
          class="btn btn-primary"
          @click="tab = 'market'"
        >
          Открыть Маркет
        </button>
      </div>
    </div>

    <Teleport to="body">
      <Transition name="context-pop">
        <div
          v-if="contextMenu"
          class="mod-context-menu"
          :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
          @pointerdown.stop
          @contextmenu.prevent
        >
          <header>
            <span class="context-icon">
              <img
                v-if="contextMenu.item.iconUrl"
                :src="contextMenu.item.iconUrl"
                alt=""
              />
              <Icon v-else :name="contentIcon" :size="18" />
            </span>
            <div>
              <b>{{ contextMenu.item.title || contextMenu.item.filename }}</b>
              <small>{{
                contextMenu.item.versionNumber ||
                (shaderMode
                  ? "Локальный шейдерпак"
                  : resourceMode
                    ? "Локальный ресурспак"
                    : "Локальный мод")
              }}</small>
            </div>
          </header>
          <button
            @click="
              openInstalled(contextMenu.item);
              closeContext();
            "
          >
            <Icon name="external" :size="15" />Открыть описание
          </button>
          <button @click="reveal(contextMenu.item)">
            <Icon name="folder" :size="15" />Показать в папке
          </button>
          <button v-if="!fileMode" @click="contextToggle(contextMenu.item)">
            <Icon
              :name="contextMenu.item.enabled ? 'powerOff' : 'power'"
              :size="15"
            />
            {{ contextMenu.item.enabled ? "Отключить" : "Включить" }}
          </button>
          <button
            @click="
              toggleSelected(contextMenu.item.filename);
              closeContext();
            "
          >
            <Icon name="select" :size="15" />
            {{
              selected.has(contextMenu.item.filename)
                ? "Снять выделение"
                : "Выбрать"
            }}
          </button>
          <i />
          <button class="danger" @click="contextRemove(contextMenu.item)">
            <Icon name="trash" :size="15" />Удалить
          </button>
        </div>
      </Transition>
    </Teleport>

    <Teleport to="body"
      ><Transition name="drawer"
        ><div
          v-if="filtersOpen"
          class="filter-overlay"
          @click.self="filtersOpen = false"
        >
          <aside class="filter-drawer">
            <header>
              <div>
                <p class="eyebrow">Каталог</p>
                <h2>Фильтры</h2>
              </div>
              <button class="icon-button" @click="filtersOpen = false">
                <Icon name="panelClose" :size="20" />
              </button>
            </header>
            <section>
              <h3><Icon name="sort" :size="16" />Сортировка</h3>
              <div class="sort-grid">
                <button
                  v-for="item in sorts"
                  :key="item.id"
                  :class="{ active: sort === item.id }"
                  @click="sort = item.id"
                >
                  {{ item.label }}
                </button>
              </div>
            </section>
            <section>
              <h3><Icon name="cube" :size="16" />Версия</h3>
              <div class="locked-choice">
                <span>{{ GAME.minecraftVersion }}</span
                ><small>Текущая сборка</small><Icon name="check" :size="16" />
              </div>
            </section>
            <section v-if="!fileMode">
              <h3><FabricLogo />Загрузчик</h3>
              <div class="loader-choice">
                <FabricLogo /><b>Fabric</b><span>{{ GAME.fabricLoader }}</span
                ><Icon name="check" :size="16" />
              </div>
            </section>
            <section v-else>
              <h3><Icon name="palette" :size="16" />Формат</h3>
              <div class="loader-choice">
                <Icon :name="contentIcon" :size="19" /><b>{{ typeLabel }}</b
                ><span>ZIP</span><Icon name="check" :size="16" />
              </div>
            </section>
            <section>
              <h3><Icon name="tag" :size="16" />Категория</h3>
              <div class="category-grid">
                <button
                  v-for="item in categories"
                  :key="item.id"
                  :class="{ active: category === item.id }"
                  @click="category = item.id"
                >
                  <Icon :name="item.icon" :size="15" />{{ item.label }}
                </button>
              </div>
            </section>
            <footer>
              <button
                class="btn btn-ghost"
                @click="
                  category = 'all';
                  sort = 'relevance';
                "
              >
                Сбросить</button
              ><button class="btn btn-primary" @click="filtersOpen = false">
                Показать {{ mods.totalHits.toLocaleString("ru") }}
              </button>
            </footer>
          </aside>
        </div></Transition
      ></Teleport
    >

    <Teleport to="body"
      ><Transition name="modal"
        ><div v-if="detail" class="detail-overlay" @click.self="detail = null">
          <section class="detail-dialog">
            <header>
              <div class="detail-heading">
                <span class="detail-icon"
                  ><img
                    v-if="detail.project.icon_url"
                    :src="detail.project.icon_url"
                    alt="" /><Icon v-else :name="contentIcon" :size="28"
                /></span>
                <div>
                  <p class="eyebrow">
                    {{
                      detail.installed
                        ? shaderMode
                          ? "Установленный шейдерпак"
                          : resourceMode
                            ? "Установленный ресурспак"
                            : "Установленный мод"
                        : "Modrinth"
                    }}
                  </p>
                  <h2>{{ detail.project.title }}</h2>
                  <span v-if="detail.project.author"
                    >от {{ detail.project.author }}</span
                  >
                </div>
              </div>
              <button class="icon-button" @click="detail = null">
                <Icon name="close" :size="20" />
              </button>
            </header>
            <div class="detail-content">
              <div v-if="detailLoading" class="detail-loading">
                <Icon name="spinner" :size="24" class="spin" />Загружаем
                описание и галерею…
              </div>
              <template v-else
                ><section
                  v-if="detail.project.gallery.length"
                  class="detail-gallery"
                >
                  <Transition name="gallery" mode="out-in"
                    ><img
                      v-if="currentGallery"
                      :key="currentGallery"
                      :src="currentGallery"
                      :alt="
                        shaderMode
                          ? 'Скриншот шейдера'
                          : resourceMode
                            ? 'Скриншот ресурспака'
                            : 'Скриншот мода'
                      " /></Transition
                  ><button
                    class="prev"
                    @click="
                      galleryIndex =
                        (galleryIndex - 1 + detail.project.gallery.length) %
                        detail.project.gallery.length
                    "
                  >
                    <Icon name="back" :size="19" /></button
                  ><button
                    class="next"
                    @click="
                      galleryIndex =
                        (galleryIndex + 1) % detail.project.gallery.length
                    "
                  >
                    <Icon name="chevron" :size="19" /></button
                  ><span
                    >{{ galleryIndex + 1 }} /
                    {{ detail.project.gallery.length }}</span
                  >
                </section>
                <div class="detail-meta">
                  <span><i />Совместим с {{ GAME.minecraftVersion }}</span
                  ><span v-if="!fileMode"><FabricLogo />Fabric</span
                  ><span v-else
                    ><Icon :name="contentIcon" :size="14" />{{
                      typeLabel
                    }}</span
                  ><span v-if="detail.project.downloads"
                    ><Icon name="download" :size="14" />{{
                      formatDownloads(detail.project.downloads)
                    }}</span
                  >
                </div>
                <article class="full-description">
                  <h3>Описание</h3>
                  <MarkdownContent
                    :source="detail.project.body || detail.project.description"
                  /></article
              ></template>
            </div>
            <footer>
              <button
                v-if="detail.project.slug"
                class="btn"
                @click="external(detail.project)"
              >
                <Icon name="external" :size="16" />Открыть на Modrinth</button
              ><span /><button
                v-if="!detail.installed && !mods.isInstalled(detail.project)"
                class="btn btn-primary"
                @click="install(detail.project)"
              >
                <Icon name="download" :size="16" />Установить</button
              ><button
                v-else-if="detail.installed"
                class="btn btn-danger"
                @click="removeDetailed"
              >
                <Icon name="trash" :size="16" />{{ `Удалить ${singularLabel}` }}
              </button>
            </footer>
          </section>
        </div></Transition
      ></Teleport
    >
    <ConfirmDialog
      v-if="pendingRemoval.length"
      :title="
        pendingRemoval.length === 1
          ? `Удалить ${singularLabel}?`
          : `Удалить ${russianCount(pendingRemoval.length, ...pluralForms)}?`
      "
      :message="
        pendingRemoval.length === 1
          ? `Файл «${pendingRemoval[0].title || pendingRemoval[0].filename}» будет удалён из сборки.`
          : shaderMode
            ? 'Выбранные файлы будут удалены из папки shaderpacks. Это действие нельзя отменить внутри лаунчера.'
            : resourceMode
              ? 'Выбранные файлы будут удалены из папки resourcepacks. Это действие нельзя отменить внутри лаунчера.'
              : 'Выбранные файлы будут удалены из папки mods. Это действие нельзя отменить внутри лаунчера.'
      "
      @cancel="pendingRemoval = []"
      @confirm="confirmRemove"
    />
  </div>
</template>

<style scoped lang="scss">
.mods-page {
  max-width: 1180px;
  margin: 0 auto;
  padding: 26px 30px 56px;
}
.mods-head {
  margin-bottom: 18px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 22px;
}
.mods-head h1 {
  margin-top: 3px;
  font-size: 26px;
}
.instance-facts {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 9px 14px;
  border-radius: 12px;
  background: rgba(17, 23, 19, 0.76);
  border: 1px solid var(--hairline);
  backdrop-filter: blur(14px);
}
.instance-facts > div {
  min-width: 70px;
}
.instance-facts small,
.instance-facts b {
  display: block;
}
.instance-facts small {
  color: var(--text-3);
  font-size: 8.5px;
  text-transform: uppercase;
}
.instance-facts b {
  margin-top: 3px;
  color: var(--text-0);
  font-family: var(--font-num);
  font-size: 10.5px;
}
.instance-facts > i {
  width: 1px;
  height: 28px;
  background: var(--hairline);
}
.fabric-fact {
  display: flex;
  align-items: center;
  gap: 8px;
}
.fabric-fact > svg {
  font-size: 25px;
}
.market-bar {
  position: sticky;
  top: 0;
  z-index: 15;
  min-height: 62px;
  margin: 0 -8px 17px;
  padding: 7px 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  border-radius: 14px;
  background: rgba(10, 14, 11, 0.89);
  border: 1px solid var(--hairline);
  backdrop-filter: blur(20px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.18);
}
.tabs {
  align-self: stretch;
  display: flex;
}
.tabs button {
  position: relative;
  min-width: 150px;
  padding: 0 17px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 700;
}
.tabs button::after {
  content: "";
  position: absolute;
  left: 18px;
  right: 18px;
  bottom: -8px;
  height: 2px;
  border-radius: 3px;
  background: var(--green);
  transform: scaleX(0);
  transition: transform 0.34s var(--ease);
}
.tabs button.active {
  color: var(--green-bright);
}
.tabs button.active::after {
  transform: scaleX(1);
}
.tabs b {
  min-width: 22px;
  height: 20px;
  padding: 0 6px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  background: var(--surface-3);
  font-size: 9px;
}
.search-tools {
  display: flex;
  gap: 8px;
}
.mod-search {
  width: 300px;
  height: 44px;
  padding: 0 13px;
  display: flex;
  align-items: center;
  gap: 9px;
  border-radius: 10px;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
}
.mod-search:focus-within {
  border-color: var(--green-line);
  box-shadow: 0 0 0 3px var(--green-soft);
}
.mod-search input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: none;
  color: var(--text-0);
  font-size: 12px;
}
.tool-button {
  position: relative;
  height: 44px;
  padding: 0 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  font-size: 11.5px;
  font-weight: 700;
}
.tool-button:hover,
.tool-button.filtered {
  color: var(--green);
  border-color: var(--green-line);
  background: var(--green-soft);
}
.pack-tool {
  width: 44px;
  padding: 0;
  justify-content: center;
  flex: 0 0 44px;
  color: var(--text-2);
}
.pack-tool:hover:not(:disabled) {
  color: var(--text-0);
  border-color: var(--hairline-strong);
  background: var(--surface-3);
}
.pack-tool:disabled {
  opacity: 0.5;
  cursor: wait;
}
.pack-progress {
  position: relative;
  min-height: 42px;
  margin: -7px 0 13px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 9px;
  overflow: hidden;
  border-radius: 10px;
  color: var(--text-2);
  background: rgba(17, 23, 19, 0.9);
  border: 1px solid var(--hairline);
}
.pack-progress > svg,
.pack-progress > span {
  position: relative;
  z-index: 1;
}
.pack-progress > span {
  min-width: 0;
}
.pack-progress b,
.pack-progress small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pack-progress b {
  color: var(--text-0);
  font-size: 10.5px;
}
.pack-progress small {
  margin-top: 2px;
  color: var(--text-3);
  font-size: 9px;
}
.pack-progress > i {
  position: absolute;
  inset: auto auto 0 0;
  height: 2px;
  background: var(--green);
  transition: width 0.2s linear;
}
.tool-button i {
  position: absolute;
  right: 7px;
  top: 7px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--green);
}
.result-line {
  margin-bottom: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-3);
  font-size: 10.5px;
}
.result-line p b {
  color: var(--text-1);
}
.result-line > div {
  display: flex;
  gap: 6px;
}
.result-line span {
  padding: 5px 8px;
  border-radius: 7px;
  color: var(--text-2);
  background: #111713b8;
  border: 1px solid var(--hairline);
}
.message {
  margin-bottom: 12px;
  padding: 10px 12px;
  display: flex;
  gap: 8px;
  border-radius: 9px;
  font-size: 11px;
}
.message.error {
  max-height: 72px;
  overflow: auto;
  color: var(--danger);
  background: rgba(255, 93, 108, 0.1);
  font-size: 10px;
  line-height: 1.45;
  overflow-wrap: anywhere;
}
.message.success {
  color: var(--green);
  background: var(--green-soft);
}
.mod-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.mod-card {
  min-height: 162px;
  padding: 14px;
  display: grid;
  grid-template-columns: 66px minmax(0, 1fr);
  grid-template-rows: 1fr auto;
  column-gap: 13px;
  border-radius: 14px;
  background: rgba(17, 23, 19, 0.9);
  border: 1px solid var(--hairline);
  backdrop-filter: blur(16px);
  cursor: pointer;
  transition:
    transform 0.28s var(--ease),
    border-color 0.25s,
    background 0.25s,
    box-shadow 0.25s;
}
.mod-card:hover {
  transform: translateY(-4px);
  border-color: var(--green-line);
  background: rgba(23, 31, 25, 0.97);
  box-shadow: 0 16px 38px rgba(0, 0, 0, 0.28);
}
.mod-icon-shell {
  grid-row: 1/3;
  width: 66px;
  height: 66px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 14px;
  color: var(--text-3);
  background: linear-gradient(135deg, var(--surface-3), var(--surface-1));
  border: 1px solid var(--hairline);
}
.mod-icon-shell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mod-copy {
  min-width: 0;
}
.mod-title {
  display: flex;
  justify-content: space-between;
  gap: 9px;
}
.mod-title > div {
  min-width: 0;
}
.mod-title h3 {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}
.mod-title > div > span {
  display: block;
  margin-top: 2px;
  color: var(--text-3);
  font-size: 9px;
}
.downloads {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-3);
  font-family: var(--font-num);
  font-size: 9px;
}
.mod-copy > p {
  margin-top: 8px;
  min-height: 34px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  color: var(--text-2);
  font-size: 11px;
  line-height: 1.5;
  user-select: text;
}
.compatibility {
  margin-top: 8px;
  display: flex;
  gap: 5px;
}
.compatibility span,
.compatibility b {
  padding: 3px 6px;
  border-radius: 6px;
  font-size: 8px;
}
.compatibility span {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--green);
  background: var(--green-soft);
}
.compatibility span i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--green);
}
.compatibility b {
  color: var(--text-3);
  background: var(--surface-3);
}
.mod-actions {
  grid-column: 2;
  margin-top: 10px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
}
.more-button {
  height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--text-2);
  font-size: 10px;
}
.more-button:hover {
  color: var(--text-0);
  background: var(--surface-3);
}
.install-button {
  height: 34px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 7px;
  border-radius: 8px;
  color: #07130a;
  background: var(--green-grad);
  font-size: 10.5px;
  font-weight: 750;
}
.install-button:hover:not(:disabled) {
  transform: translateY(-2px);
  filter: brightness(1.06);
}
.install-button.installed {
  color: var(--green);
  background: var(--green-soft);
}
.skeleton {
  grid-template-rows: 1fr;
}
.skeleton > div {
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.line {
  display: block;
  width: 70%;
  height: 9px;
  border-radius: 5px;
}
.line.wide {
  width: 88%;
  height: 13px;
}
.line.short {
  width: 42%;
}
.shimmer {
  background: linear-gradient(
    100deg,
    #ffffff0a 30%,
    #ffffff19 50%,
    #ffffff0a 70%
  );
  background-size: 200% 100%;
  animation: shimmer 1.25s infinite;
}
@keyframes shimmer {
  to {
    background-position: -200% 0;
  }
}
.load-more {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}
.installed-toolbar {
  min-height: 64px;
  margin-bottom: 9px;
  padding: 10px 13px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 13px;
  background: rgba(17, 23, 19, 0.82);
  border: 1px solid var(--hairline);
}
.select-all {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  font-size: 10.5px;
}
.select-all > span,
.select-box {
  width: 21px;
  height: 21px;
  display: grid;
  place-items: center;
  border-radius: 6px;
  color: #07130a;
  background: var(--surface-3);
  border: 1px solid var(--hairline-strong);
}
.select-all.checked > span,
.select-box.checked {
  background: var(--green);
  border-color: var(--green);
}
.installed-toolbar > div {
  margin-left: auto;
}
.installed-toolbar b,
.installed-toolbar small {
  display: block;
  text-align: right;
}
.installed-toolbar b {
  color: var(--text-0);
  font-size: 11px;
}
.installed-toolbar small {
  margin-top: 2px;
  color: var(--text-3);
  font-size: 9px;
}
.bulk-bar {
  position: sticky;
  top: 72px;
  z-index: 14;
  min-height: 52px;
  margin-bottom: 9px;
  padding: 7px 9px 7px 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 12px;
  color: var(--green);
  background: #1d3223f2;
  border: 1px solid var(--green-line);
  box-shadow: 0 12px 32px #0005;
  backdrop-filter: blur(16px);
}
.bulk-bar p {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
}
.bulk-bar > div {
  display: flex;
  gap: 5px;
}
.bulk-bar button {
  height: 34px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  color: var(--text-1);
  background: #ffffff0b;
  font-size: 9.5px;
}
.bulk-bar button:hover {
  color: #fff;
  background: #ffffff16;
}
.bulk-bar button.danger {
  color: var(--danger);
}
.bulk-enter-active,
.bulk-leave-active {
  transition:
    opacity 0.3s,
    transform 0.35s var(--ease);
}
.bulk-enter-from,
.bulk-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
.installed-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.installed-list article {
  min-height: 78px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 12px;
  background: rgba(17, 23, 19, 0.9);
  border: 1px solid var(--hairline);
  cursor: pointer;
}
.installed-list article:hover {
  transform: translateX(3px);
  background: rgba(23, 31, 25, 0.97);
  border-color: var(--hairline-strong);
}
.installed-list article.disabled {
  opacity: 0.62;
}
.installed-list article.selected {
  border-color: var(--green-line);
  background: var(--green-soft);
}
.installed-icon {
  width: 48px;
  height: 48px;
  display: grid;
  place-items: center;
  overflow: hidden;
  flex: none;
  border-radius: 11px;
  color: var(--green);
  background: var(--green-soft);
}
.installed-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.installed-copy {
  min-width: 0;
  flex: 1;
}
.installed-copy h3 {
  font-size: 12.5px;
}
.installed-copy p {
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-2);
  font-size: 10px;
  user-select: text;
}
.installed-copy small {
  display: block;
  margin-top: 4px;
  color: var(--text-3);
  font-family: var(--font-num);
  font-size: 8.5px;
}
.state-copy {
  width: 93px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-3);
  font-size: 10px;
}
.state-copy.on {
  color: var(--green);
}
.remove-button {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--text-3);
}
.remove-button:hover {
  color: var(--danger);
  background: rgba(255, 93, 108, 0.1);
}
.empty-view {
  min-height: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}
.empty-view > span {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  border-radius: 16px;
  color: var(--text-3);
  background: var(--surface-2);
}
.empty-view h3 {
  margin-top: 13px;
  font-size: 15px;
}
.empty-view p {
  margin: 5px 0 15px;
  color: var(--text-3);
  font-size: 11px;
}
.filter-overlay,
.detail-overlay {
  position: fixed;
  inset: 0;
  z-index: 500;
  background: rgba(3, 6, 4, 0.62);
  backdrop-filter: blur(7px);
}
.filter-drawer {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: min(420px, 92vw);
  padding: 20px;
  overflow: auto;
  background: #111713;
  border-left: 1px solid var(--hairline-strong);
  box-shadow: -24px 0 70px #0008;
}
.filter-drawer > header {
  display: flex;
  justify-content: space-between;
  padding-bottom: 17px;
  border-bottom: 1px solid var(--hairline);
}
.filter-drawer h2 {
  margin-top: 2px;
  font-size: 22px;
}
.filter-drawer section {
  padding: 17px 0;
  border-bottom: 1px solid var(--hairline);
}
.filter-drawer section h3 {
  margin-bottom: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-2);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.filter-drawer section h3 > svg {
  font-size: 17px;
}
.sort-grid,
.category-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.sort-grid button,
.category-grid button {
  min-height: 36px;
  padding: 0 10px;
  border-radius: 8px;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  font-size: 10px;
}
.sort-grid button.active,
.category-grid button.active {
  color: var(--green);
  background: var(--green-soft);
  border-color: var(--green-line);
}
.category-grid button {
  display: flex;
  align-items: center;
  gap: 7px;
}
.locked-choice,
.loader-choice {
  min-height: 54px;
  padding: 9px 11px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 10px;
  color: var(--green);
  background: var(--green-soft);
  border: 1px solid var(--green-line);
}
.locked-choice span {
  color: var(--text-0);
  font-weight: 700;
}
.locked-choice small {
  flex: 1;
  color: var(--text-3);
  font-size: 9px;
}
.loader-choice > svg {
  font-size: 28px;
}
.loader-choice b {
  color: var(--text-0);
}
.loader-choice span {
  margin-left: auto;
  color: var(--text-3);
  font-family: var(--font-num);
  font-size: 9px;
}
.filter-drawer > footer {
  position: sticky;
  bottom: -20px;
  margin: 0 -20px -20px;
  padding: 14px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  background: #111713f2;
  border-top: 1px solid var(--hairline);
}
.drawer-enter-active,
.drawer-leave-active {
  transition: opacity 0.3s;
}
.drawer-enter-active .filter-drawer,
.drawer-leave-active .filter-drawer {
  transition: transform 0.28s var(--ease);
}
.drawer-enter-from,
.drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .filter-drawer,
.drawer-leave-to .filter-drawer {
  transform: translateX(100%);
}
.detail-overlay {
  z-index: 560;
  display: grid;
  place-items: center;
  padding: 20px;
}
.detail-dialog {
  width: min(820px, 100%);
  max-height: calc(100vh - 40px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 19px;
  background: #111713;
  border: 1px solid var(--hairline-strong);
  box-shadow: 0 32px 110px #000c;
}
.detail-dialog > header {
  padding: 17px 19px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  border-bottom: 1px solid var(--hairline);
}
.detail-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}
.detail-icon {
  width: 50px;
  height: 50px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 12px;
  color: var(--green);
  background: var(--surface-3);
}
.detail-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.detail-heading h2 {
  margin-top: 2px;
  font-size: 21px;
}
.detail-heading > div > span {
  display: block;
  margin-top: 3px;
  color: var(--text-3);
  font-size: 9.5px;
}
.detail-content {
  padding: 18px;
  overflow-y: auto;
}
.detail-loading {
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: var(--text-3);
  font-size: 11px;
}
.detail-gallery {
  position: relative;
  height: 300px;
  overflow: hidden;
  border-radius: 14px;
  background: #090d0a;
}
.detail-gallery > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.detail-gallery button {
  position: absolute;
  top: 50%;
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: #fff;
  background: #050805b5;
  transform: translateY(-50%);
}
.detail-gallery button:hover {
  background: #19261d;
  transform: translateY(-50%) scale(1.08);
}
.detail-gallery .prev {
  left: 12px;
}
.detail-gallery .next {
  right: 12px;
}
.detail-gallery > span {
  position: absolute;
  right: 11px;
  bottom: 10px;
  padding: 4px 7px;
  border-radius: 6px;
  color: #fff;
  background: #000a;
  font-family: var(--font-num);
  font-size: 8px;
}
.detail-meta {
  margin-top: 12px;
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}
.detail-meta span {
  height: 30px;
  padding: 0 9px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  color: var(--text-2);
  background: var(--surface-2);
  font-size: 9.5px;
}
.detail-meta span:first-child {
  color: var(--green);
  background: var(--green-soft);
}
.detail-meta span i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--green);
}
.detail-meta span > svg {
  font-size: 18px;
}
.full-description {
  margin-top: 16px;
  padding: 15px;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
}
.full-description h3 {
  font-size: 13px;
}
.detail-dialog > footer {
  padding: 13px 18px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid var(--hairline);
}
.detail-dialog > footer > span {
  flex: 1;
}
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s;
}
.modal-enter-active .detail-dialog,
.modal-leave-active .detail-dialog {
  transition:
    transform 0.42s var(--ease),
    opacity 0.3s;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .detail-dialog,
.modal-leave-to .detail-dialog {
  transform: translateY(24px) scale(0.975);
}
.mod-context-menu {
  position: fixed;
  z-index: 720;
  width: 220px;
  padding: 7px;
  border: 1px solid var(--hairline-strong);
  border-radius: 12px;
  background: rgba(20, 24, 22, 0.98);
  box-shadow: 0 22px 60px #000b;
  backdrop-filter: blur(20px);
}
.mod-context-menu header {
  margin-bottom: 6px;
  padding: 7px;
  display: flex;
  align-items: center;
  gap: 9px;
  border-bottom: 1px solid var(--hairline);
}
.context-icon {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  flex: none;
  overflow: hidden;
  border-radius: 8px;
  color: var(--green);
  background: var(--surface-3);
}
.context-icon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.mod-context-menu header div {
  min-width: 0;
}
.mod-context-menu header b,
.mod-context-menu header small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mod-context-menu header b {
  color: var(--text-0);
  font-size: 10.5px;
}
.mod-context-menu header small {
  margin-top: 2px;
  color: var(--text-3);
  font-size: 8.5px;
}
.mod-context-menu > button {
  width: 100%;
  height: 33px;
  padding: 0 9px;
  display: flex;
  align-items: center;
  gap: 9px;
  border-radius: 8px;
  color: var(--text-1);
  font-size: 10px;
  text-align: left;
}
.mod-context-menu > button:hover {
  color: var(--text-0);
  background: var(--surface-3);
}
.mod-context-menu > button.danger {
  color: var(--danger);
}
.mod-context-menu > button.danger:hover {
  background: rgba(255, 93, 108, 0.1);
}
.mod-context-menu > i {
  display: block;
  height: 1px;
  margin: 5px 7px;
  background: var(--hairline);
}
.context-pop-enter-active,
.context-pop-leave-active {
  transition:
    opacity 0.12s ease,
    transform 0.12s ease;
  transform-origin: top left;
}
.context-pop-enter-from,
.context-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 850px) {
  .mods-head {
    align-items: flex-start;
  }
  .instance-facts {
    display: none;
  }
  .market-bar {
    align-items: stretch;
    flex-direction: column;
  }
  .tabs {
    height: 45px;
  }
  .search-tools,
  .mod-search {
    width: 100%;
  }
  .mod-grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 580px) {
  .mods-page {
    padding: 22px 20px;
  }
  .tabs button {
    min-width: 0;
    flex: 1;
  }
  .tool-button {
    font-size: 0;
  }
  .state-copy {
    display: none;
  }
  .category-grid {
    grid-template-columns: 1fr;
  }
  .installed-copy p {
    display: none;
  }
}
</style>
