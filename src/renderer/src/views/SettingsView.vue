<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import Icon from "@/components/Icon.vue";
import UiSwitch from "@/components/ui/UiSwitch.vue";
import { GAME } from "@shared/constants";
import { useSettingsStore } from "@/stores/settings";
import { useLocale } from "@/composables/useLocale";

const store = useSettingsStore();
const { tr } = useLocale();
const settings = computed(() => store.settings);
const active = ref("appearance");
const languageOpen = ref(false);
const nativeLibrariesOpen = ref(false);
const javaError = ref("");
const launcherVersion = ref("0.1.1");
const languageLabel = computed(() =>
  settings.value?.language === "en"
    ? "English"
    : settings.value?.language === "es"
      ? "Español"
      : "Русский",
);
const launcherUpdateVersion = computed(() => {
  const update = store.launcherUpdate;
  if (!update) return `v${launcherVersion.value}`;
  return update.available
    ? `v${update.currentVersion} → v${update.latestVersion}`
    : `v${update.currentVersion}`;
});
const launcherUpdateAction = computed(() =>
  store.launcherUpdateProgress?.phase === "installing"
    ? tr("Установка…", "Installing…", "Instalando…")
    : store.launcherUpdateInstalling
      ? tr(
          `Загрузка ${Math.floor(store.launcherUpdateProgress?.progress ?? 0)}%`,
          `Downloading ${Math.floor(store.launcherUpdateProgress?.progress ?? 0)}%`,
          `Descargando ${Math.floor(store.launcherUpdateProgress?.progress ?? 0)}%`,
        )
      : store.launcherUpdate?.available
        ? tr("Обновить", "Update", "Actualizar")
        : store.launcherUpdate
          ? tr("Актуально", "Up to date", "Actualizado")
          : tr("Проверить", "Check", "Comprobar"),
);
const nativeLibraryOptions = [
  {
    value: "never",
    label: "Не заменять",
    detail: "Использовать уже распакованные файлы",
  },
  {
    value: "old-only",
    label: "По необходимости",
    detail: "Исправлять отсутствующие и повреждённые",
  },
  {
    value: "always",
    label: "Каждый запуск",
    detail: "Распаковывать нативы заново",
  },
] as const;
const nativeLibraryLabel = computed(
  () =>
    nativeLibraryOptions.find(
      (option) => option.value === settings.value?.replaceNativeLibraries,
    )?.label ?? "По необходимости",
);

const sections = [
  {
    id: "appearance",
    get label() {
      return tr("Интерфейс", "Interface", "Interfaz");
    },
    icon: "palette",
  },
  {
    id: "global",
    get label() {
      return tr("Глобальные", "Global", "Global");
    },
    icon: "sliders",
  },
  {
    id: "environment",
    get label() {
      return tr("Среда и запуск", "Runtime & launch", "Entorno e inicio");
    },
    icon: "rocket",
  },
];

const totalMemory = computed(() => store.systemMemory?.totalMb ?? 16384);
const freeMemory = computed(() => store.systemMemory?.freeMb ?? 0);
const usedPercent = computed(() =>
  Math.max(0, Math.min(100, (1 - freeMemory.value / totalMemory.value) * 100)),
);
const memoryLimit = computed(() =>
  Math.max(4096, Math.floor((totalMemory.value - 1024) / 512) * 512),
);
const selectedMemory = computed(() => {
  if (!settings.value) return "—";
  if (settings.value.memoryMode === "system") return "Управляет Java";
  if (settings.value.memoryMode === "auto")
    return `до ${(Math.min(8192, Math.max(4096, totalMemory.value * 0.5)) / 1024).toFixed(1)} ГБ`;
  return `${(settings.value.memoryMinMb / 1024).toFixed(1)}–${(settings.value.memoryMb / 1024).toFixed(1)} ГБ`;
});

let scrollRoot: HTMLElement | null = null;
let manualTarget: string | null = null;
let scrollFrame = 0;
let unlockTimer: ReturnType<typeof setTimeout> | null = null;

function syncNavigation(): void {
  if (!scrollRoot || manualTarget) return;
  cancelAnimationFrame(scrollFrame);
  scrollFrame = requestAnimationFrame(() => {
    if (!scrollRoot || manualTarget) return;
    const rootTop = scrollRoot.getBoundingClientRect().top;
    const marker = rootTop + 96;
    let current = sections[0].id;
    for (const section of sections) {
      const element = document.getElementById(`settings-${section.id}`);
      if (element && element.getBoundingClientRect().top <= marker)
        current = section.id;
    }
    if (
      scrollRoot.scrollHeight - scrollRoot.scrollTop - scrollRoot.clientHeight <
      24
    )
      current = sections.at(-1)!.id;
    active.value = current;
  });
}

function save(): void {
  store.save();
}
function scrollTo(id: string): void {
  active.value = id;
  manualTarget = id;
  if (unlockTimer) clearTimeout(unlockTimer);
  const element = document.getElementById(`settings-${id}`);
  if (scrollRoot && element) {
    const rootTop = scrollRoot.getBoundingClientRect().top;
    const destination =
      scrollRoot.scrollTop + element.getBoundingClientRect().top - rootTop - 20;
    scrollRoot.scrollTo({ top: destination, behavior: "smooth" });
  }
  unlockTimer = setTimeout(() => {
    manualTarget = null;
    syncNavigation();
  }, 420);
}
async function replayOnboarding(): Promise<void> {
  if (!settings.value) return;
  settings.value.onboardingCompleted = false;
  await store.saveNow();
}
function setMemoryMode(mode: "system" | "auto" | "manual"): void {
  if (!settings.value) return;
  settings.value.memoryMode = mode;
  settings.value.memoryAuto = mode !== "manual";
  save();
}
function saveMemory(): void {
  if (!settings.value) return;
  settings.value.memoryMb = Math.min(
    settings.value.memoryMb,
    memoryLimit.value,
  );
  settings.value.memoryMinMb = Math.min(
    settings.value.memoryMinMb,
    settings.value.memoryMb,
  );
  save();
}
function detectJava(): void {
  save();
  void store.detectJava();
}
async function installJava(): Promise<void> {
  javaError.value = "";
  try {
    await store.installJava();
  } catch (error) {
    javaError.value = error instanceof Error ? error.message : String(error);
  }
}
function chooseLanguage(language: "ru" | "en" | "es"): void {
  if (!settings.value) return;
  settings.value.language = language;
  document.documentElement.lang = language;
  languageOpen.value = false;
  save();
}
function chooseNativeLibraries(value: "never" | "old-only" | "always"): void {
  if (!settings.value) return;
  settings.value.replaceNativeLibraries = value;
  nativeLibrariesOpen.value = false;
  save();
}
function closeNativeLibraries(): void {
  nativeLibrariesOpen.value = false;
}

onMounted(async () => {
  if (!store.settings) await store.hydrate();
  if (!store.java) void store.detectJava();
  scrollRoot = document.querySelector<HTMLElement>(".content");
  scrollRoot?.addEventListener("scroll", syncNavigation, {
    passive: true,
  });
  syncNavigation();
  document.addEventListener("click", closeNativeLibraries);
  void window.royale.app
    .getVersion()
    .then((version) => (launcherVersion.value = version));
  void store.checkLauncherUpdate();
});
onBeforeUnmount(() => {
  if (unlockTimer) clearTimeout(unlockTimer);
  cancelAnimationFrame(scrollFrame);
  scrollRoot?.removeEventListener("scroll", syncNavigation);
  document.removeEventListener("click", closeNativeLibraries);
});
</script>

<template>
  <div class="settings-page">
    <aside class="settings-nav">
      <div class="nav-heading">
        <p class="eyebrow">Royale</p>
        <h2>{{ tr("Настройки", "Settings", "Ajustes") }}</h2>
      </div>
      <div class="nav-list">
        <span
          class="active-rail"
          :style="{
            transform: `translateY(${sections.findIndex((item) => item.id === active) * 46}px)`,
          }"
        />
        <button
          v-for="section in sections"
          :key="section.id"
          :class="{ active: section.id === active }"
          @click="scrollTo(section.id)"
        >
          <Icon :name="section.icon" :size="18" /><span>{{
            section.label
          }}</span>
        </button>
      </div>
      <p class="autosave">
        <span />{{
          tr(
            "Изменения сохраняются автоматически",
            "Changes are saved automatically",
            "Los cambios se guardan automáticamente",
          )
        }}
      </p>
    </aside>

    <main v-if="settings" class="settings-content">
      <section id="settings-appearance" class="settings-section">
        <header>
          <span><Icon name="palette" :size="20" /></span>
          <div>
            <h3>{{ tr("Интерфейс", "Interface", "Interfaz") }}</h3>
            <p>
              {{
                tr(
                  "Фон, галерея и язык без системных выпадающих списков.",
                  "Background, gallery and language without system menus.",
                  "Fondo, galería e idioma sin menús del sistema.",
                )
              }}
            </p>
          </div>
        </header>

        <div class="setting-card media-setting">
          <div class="media-preview" :class="{ empty: !store.backgroundUrl }">
            <video
              v-if="store.backgroundUrl && store.backgroundKind === 'video'"
              :src="store.backgroundUrl"
              autoplay
              muted
              loop
              preload="auto"
              :style="{ objectFit: settings.backgroundFit }"
            />
            <i
              v-else-if="store.backgroundUrl"
              :style="{
                backgroundImage: `url(${store.backgroundUrl})`,
                backgroundSize: settings.backgroundFit,
              }"
            />
            <Icon v-else name="image" :size="28" />
            <b v-if="store.backgroundUrl">{{
              store.backgroundKind === "video" ? "VIDEO" : "IMAGE / GIF"
            }}</b>
          </div>
          <div class="setting-copy">
            <b>{{
              tr("Фон лаунчера", "Launcher background", "Fondo del launcher")
            }}</b
            ><small
              >PNG, JPG, WebP, GIF, MP4 или WebM. Видео воспроизводится
              локально, без копирования в память.</small
            >
          </div>
          <div class="row-actions">
            <button
              v-if="store.backgroundUrl"
              class="btn btn-ghost"
              @click="store.clearBackground()"
            >
              {{ tr("Сбросить", "Reset", "Restablecer") }}</button
            ><button class="btn" @click="store.pickBackground()">
              <Icon name="image" :size="16" />{{
                tr("Выбрать", "Choose", "Elegir")
              }}
            </button>
          </div>
        </div>
        <div
          v-if="store.backgroundUrl"
          class="setting-card compact fit-setting"
        >
          <div class="setting-icon"><Icon name="expand" :size="18" /></div>
          <div class="setting-copy">
            <b>{{ tr("Масштаб фона", "Background fit", "Ajuste del fondo") }}</b
            ><small>Обрезать края или показывать кадр целиком.</small>
          </div>
          <div class="fit-toggle">
            <button
              :class="{ active: settings.backgroundFit === 'cover' }"
              @click="
                settings.backgroundFit = 'cover';
                save();
              "
            >
              {{ tr("Заполнить", "Fill", "Rellenar") }}
            </button>
            <button
              :class="{ active: settings.backgroundFit === 'contain' }"
              @click="
                settings.backgroundFit = 'contain';
                save();
              "
            >
              {{ tr("Вписать", "Fit", "Encajar") }}
            </button>
          </div>
        </div>

        <button
          class="setting-card compact language-button"
          @click="languageOpen = true"
        >
          <div class="setting-icon"><Icon name="globe" :size="18" /></div>
          <div class="setting-copy">
            <b>{{
              tr(
                "Язык интерфейса",
                "Interface language",
                "Idioma de la interfaz",
              )
            }}</b
            ><small>{{ languageLabel }}</small>
          </div>
          <span>{{ tr("Изменить", "Change", "Cambiar") }}</span
          ><Icon name="chevron" :size="16" />
        </button>
        <button
          class="setting-card compact language-button"
          @click="replayOnboarding"
        >
          <div class="setting-icon"><Icon name="sparkles" :size="18" /></div>
          <div class="setting-copy">
            <b>{{
              tr("Обучение по лаунчеру", "Launcher tour", "Guía del launcher")
            }}</b>
            <small>{{
              tr(
                "Снова показать знакомство с Royale и основные шаги настройки.",
                "Show the Royale introduction and setup steps again.",
                "Vuelve a mostrar la introducción y los pasos de configuración.",
              )
            }}</small>
          </div>
          <span>{{ tr("Показать", "Open", "Abrir") }}</span>
          <Icon name="chevron" :size="16" />
        </button>
      </section>

      <section id="settings-global" class="settings-section">
        <header>
          <span><Icon name="sliders" :size="20" /></span>
          <div>
            <h3>
              {{
                tr(
                  "Глобальные настройки",
                  "Global settings",
                  "Ajustes globales",
                )
              }}
            </h3>
            <p>
              {{
                tr(
                  "Файлы игры, память, проверки и параметры видеокарты.",
                  "Game files, memory, checks and graphics settings.",
                  "Archivos, memoria, comprobaciones y gráficos.",
                )
              }}
            </p>
          </div>
        </header>
        <div class="setting-card compact">
          <div class="setting-icon"><Icon name="folder" :size="18" /></div>
          <div class="setting-copy">
            <b>Папка Royale</b
            ><small class="path">{{ settings.storagePath }}</small>
          </div>
          <button class="btn" @click="store.pickStorageFolder()">
            Изменить
          </button>
        </div>
        <div class="subsection-heading">
          <Icon name="memory" :size="17" />
          <div>
            <b>Память Java</b
            ><small>Автоматическое или ручное назначение.</small>
          </div>
        </div>
        <div class="setting-card memory-panel">
          <div class="memory-top">
            <div>
              <b>Назначение памяти</b
              ><small>Выбрано: {{ selectedMemory }}</small>
            </div>
            <div class="mode-switch">
              <button
                :class="{ active: settings.memoryMode === 'system' }"
                @click="setMemoryMode('system')"
              >
                <Icon name="slash" :size="16" />Системно</button
              ><button
                :class="{ active: settings.memoryMode === 'auto' }"
                @click="setMemoryMode('auto')"
              >
                <Icon name="memory" :size="16" />Автоматически</button
              ><button
                :class="{ active: settings.memoryMode === 'manual' }"
                @click="setMemoryMode('manual')"
              >
                <Icon name="sliders" :size="16" />Вручную
              </button>
            </div>
          </div>
          <div class="system-memory">
            <span
              ><Icon name="chip" :size="14" />Свободно
              {{ (freeMemory / 1024).toFixed(1) }} ГБ из
              {{ (totalMemory / 1024).toFixed(1) }} ГБ</span
            ><b>{{ Math.round(usedPercent) }}% занято системой</b>
          </div>
          <div class="memory-track">
            <i :style="{ width: `${usedPercent}%` }" />
          </div>
          <div
            class="manual-memory"
            :class="{ disabled: settings.memoryMode !== 'manual' }"
          >
            <label
              ><span
                ><Icon name="arrowDown" :size="16" />Минимальная память</span
              ><input
                v-model.number="settings.memoryMinMb"
                type="range"
                min="1024"
                :max="settings.memoryMb"
                step="512"
                :disabled="settings.memoryMode !== 'manual'"
                @input="saveMemory"
              /><b>{{ settings.memoryMinMb }} МБ</b></label
            >
            <label
              ><span><Icon name="arrowUp" :size="16" />Максимальная память</span
              ><input
                v-model.number="settings.memoryMb"
                type="range"
                min="2048"
                :max="memoryLimit"
                step="512"
                :disabled="settings.memoryMode !== 'manual'"
                @input="saveMemory"
              /><b>{{ settings.memoryMb }} МБ</b></label
            >
          </div>
          <p class="memory-note">
            <Icon name="sparkles" :size="15" />Автоматический режим учитывает
            объём ОЗУ и оставляет системе безопасный запас.
          </p>
        </div>
        <div class="setting-card compact">
          <div class="setting-icon"><Icon name="rocket" :size="18" /></div>
          <div class="setting-copy">
            <b>Быстрый запуск</b
            ><small>Пропустить полную проверку файлов перед стартом.</small>
          </div>
          <UiSwitch v-model="settings.quickLaunch" @update:model-value="save" />
        </div>
        <div class="setting-card compact">
          <div class="setting-icon"><Icon name="gauge" :size="18" /></div>
          <div class="setting-copy">
            <b>Выделенный графический процессор</b
            ><small>Запускать Minecraft на производительной GPU.</small>
          </div>
          <UiSwitch
            v-model="settings.gpuDedicated"
            @update:model-value="save"
          />
        </div>
        <div class="setting-card compact">
          <div class="setting-icon"><Icon name="refresh" :size="18" /></div>
          <div class="setting-copy">
            <b>Нативные библиотеки</b
            ><small
              >Повторная распаковка после смены архитектуры или повреждения
              LWJGL.</small
            >
          </div>
          <div
            class="native-dropdown"
            :class="{ open: nativeLibrariesOpen }"
            @click.stop
          >
            <button
              class="native-trigger"
              @click="nativeLibrariesOpen = !nativeLibrariesOpen"
            >
              <span
                ><b>{{ nativeLibraryLabel }}</b></span
              >
              <Icon name="chevron" :size="15" />
            </button>
            <Transition name="native-menu">
              <div v-if="nativeLibrariesOpen" class="native-menu">
                <button
                  v-for="option in nativeLibraryOptions"
                  :key="option.value"
                  :class="{
                    active: settings.replaceNativeLibraries === option.value,
                  }"
                  @click="chooseNativeLibraries(option.value)"
                >
                  <span
                    ><b>{{ option.label }}</b
                    ><small>{{ option.detail }}</small></span
                  >
                  <Icon
                    v-if="settings.replaceNativeLibraries === option.value"
                    name="check"
                    :size="15"
                  />
                </button>
              </div>
            </Transition>
          </div>
        </div>
      </section>

      <section id="settings-environment" class="settings-section">
        <header>
          <span><Icon name="rocket" :size="20" /></span>
          <div>
            <h3>
              {{
                tr("Java и среда запуска", "Java & runtime", "Java y entorno")
              }}
            </h3>
            <p>
              {{
                tr(
                  "Java, команды, JVM, Minecraft и переменные среды в одном месте.",
                  "Java, commands, JVM, Minecraft and environment variables in one place.",
                  "Java, comandos, JVM, Minecraft y variables de entorno en un solo lugar.",
                )
              }}
            </p>
          </div>
        </header>
        <div class="setting-card compact">
          <div class="setting-icon"><Icon name="chip" :size="18" /></div>
          <div class="setting-copy">
            <b>Java {{ GAME.javaMajor }}+</b
            ><small>{{
              store.detectingJava
                ? "Проверяем…"
                : store.java
                  ? store.java.path
                  : tr(
                      "Java не найдена",
                      "Java not found",
                      "Java no encontrado",
                    )
            }}</small>
          </div>
          <span
            class="status-pill"
            :class="{
              ok: store.java?.valid,
              bad: store.java && !store.java.valid,
            }"
            ><i />{{
              store.java?.valid
                ? `Java ${store.java.majorVersion}`
                : tr("Не готово", "Not ready", "No preparado")
            }}</span
          >
          <button
            v-if="!store.java?.valid"
            class="btn btn-primary"
            :disabled="store.installingJava"
            @click="installJava"
          >
            <Icon
              :name="store.installingJava ? 'spinner' : 'download'"
              :size="15"
              :class="{ spin: store.installingJava }"
            />
            {{
              store.installingJava
                ? `${Math.round((store.javaInstallProgress?.progress || 0) * 100)}%`
                : `${tr("Установить", "Install", "Instalar")} Java ${GAME.javaMajor}`
            }}
          </button>
        </div>
        <p v-if="javaError" class="inline-error">
          <Icon name="alert" :size="14" />{{ javaError }}
        </p>
        <div class="setting-card column">
          <label
            ><b>{{ tr("Путь к Java", "Java path", "Ruta de Java") }}</b
            ><small>{{
              tr(
                "Оставьте пустым для автоматического поиска",
                "Leave empty for automatic detection",
                "Déjelo vacío para la detección automática",
              )
            }}</small></label
          ><input
            v-model="settings.javaPath"
            class="control wide"
            placeholder="C:\Program Files\Java\jdk-21\bin\java.exe"
            @change="detectJava"
          />
        </div>
        <div class="setting-card advanced-grid">
          <label
            ><b>Команда перед запуском</b
            ><small>Выполняется до запуска Java в папке сборки</small
            ><input
              v-model="settings.preLaunchCommand"
              class="control wide"
              placeholder="Оставьте пустым, если команда не нужна"
              @change="save"
          /></label>
          <label
            ><b>Опции JVM</b><small>По умолчанию поле пустое</small
            ><input
              v-model="settings.jvmArgs"
              class="control wide"
              placeholder="Например: -XX:+UseG1GC"
              @change="save"
          /></label>
        </div>
        <div class="setting-card column standalone-field">
          <label
            ><b>Аргументы Minecraft</b
            ><small
              >Дополнительные параметры запуска игры после main class. По
              умолчанию поле остаётся пустым.</small
            ><input
              v-model="settings.minecraftArgs"
              class="control wide"
              placeholder="Например: --width 1280 --height 720"
              @change="save"
          /></label>
        </div>
        <div class="setting-card column standalone-field">
          <label
            ><b>Переменные среды</b
            ><small
              >По одной паре KEY=value на строку. Значения применяются только к
              Minecraft.</small
            ><textarea
              v-model="settings.environmentVariables"
              class="control wide multiline"
              placeholder="Например: MESA_GL_VERSION_OVERRIDE=4.6"
              @change="save"
            />
          </label>
        </div>
        <div class="setting-card compact">
          <div class="setting-icon"><Icon name="discord" :size="18" /></div>
          <div class="setting-copy">
            <b>Активность Discord</b
            ><small
              >Показывает «В главном меню», «Просматривает моды» и состояние
              запуска.</small
            >
          </div>
          <UiSwitch v-model="settings.discordRpc" @update:model-value="save" />
        </div>
        <div class="setting-card compact">
          <div class="setting-icon"><Icon name="code" :size="18" /></div>
          <div class="setting-copy">
            <b>Режим разработчика</b
            ><small
              >Сохраняет расширенный журнал для тестирования собственных
              модов.</small
            >
          </div>
          <UiSwitch v-model="settings.devMode" @update:model-value="save" />
        </div>
        <div class="setting-card compact">
          <div class="setting-icon"><Icon name="video" :size="18" /></div>
          <div class="setting-copy">
            <b>Режим стримера</b
            ><small
              >Скрывает чувствительные данные профиля в интерфейсе и
              логах.</small
            >
          </div>
          <UiSwitch
            v-model="settings.streamerMode"
            @update:model-value="save"
          />
        </div>
        <div class="setting-card compact">
          <div class="setting-icon"><Icon name="shield" :size="18" /></div>
          <div class="setting-copy">
            <b>authlib-injector для внешних профилей</b
            ><small
              >Загружает проверенный агент и подключает его только к профилям
              Ely.by и LittleSkin при запуске.</small
            >
          </div>
          <span class="automatic-status"
            ><Icon name="check" :size="14" />Автоматически</span
          >
        </div>
        <div class="setting-card compact">
          <div class="setting-icon"><Icon name="close" :size="18" /></div>
          <div class="setting-copy">
            <b>Скрывать лаунчер во время игры</b
            ><small
              >Скрыть только после появления окна Minecraft и вернуть после
              выхода.</small
            >
          </div>
          <UiSwitch
            v-model="settings.closeOnLaunch"
            @update:model-value="save"
          />
        </div>
        <div class="setting-card compact">
          <div class="setting-icon"><Icon name="code" :size="18" /></div>
          <div class="setting-copy">
            <b>Показывать лог запуска</b
            ><small>Технический вывод для диагностики ошибок</small>
          </div>
          <UiSwitch v-model="settings.showLog" @update:model-value="save" />
        </div>
        <div class="setting-card update-card">
          <div class="setting-icon"><Icon name="rocket" :size="19" /></div>
          <div class="setting-copy">
            <b>Обновление Royale Launcher</b
            ><small v-if="store.launcherUpdateError" class="update-error"
              >Не удалось проверить: {{ store.launcherUpdateError }}</small
            ><small v-else-if="store.launcherUpdate?.available"
              >Доступен новый установщик Royale Launcher v{{
                store.launcherUpdate.latestVersion
              }}</small
            ><small v-else
              >Проверка версии лаунчера выполняется через официальный
              репозиторий.</small
            >
          </div>
          <button
            class="btn launcher-update-button"
            :disabled="
              store.launcherUpdateChecking || store.launcherUpdateInstalling
            "
            @click="store.installLauncherUpdate()"
          >
            <Icon
              :name="
                store.launcherUpdateChecking ||
                store.launcherUpdateProgress?.phase === 'installing'
                  ? 'spinner'
                  : store.launcherUpdateInstalling
                    ? 'download'
                    : 'refresh'
              "
              :size="15"
              :class="{
                spin:
                  store.launcherUpdateChecking ||
                  store.launcherUpdateProgress?.phase === 'installing',
              }"
            />
            <span
              ><small>{{ launcherUpdateVersion }}</small
              ><b>{{ launcherUpdateAction }}</b></span
            >
          </button>
          <i
            v-if="store.launcherUpdateInstalling"
            class="launcher-update-progress"
            :style="{
              width: `${Math.max(
                2,
                store.launcherUpdateProgress?.progress ?? 0,
              )}%`,
            }"
          />
        </div>
      </section>
    </main>

    <Teleport to="body"
      ><Transition name="sheet"
        ><div
          v-if="languageOpen"
          class="sheet-overlay"
          @click.self="languageOpen = false"
        >
          <section class="language-sheet">
            <i class="grab" />
            <header>
              <div>
                <p class="eyebrow">
                  {{ tr("Локализация", "Localization", "Localización") }}
                </p>
                <h2>
                  {{
                    tr(
                      "Язык интерфейса",
                      "Interface language",
                      "Idioma de la interfaz",
                    )
                  }}
                </h2>
              </div>
              <button class="icon-button" @click="languageOpen = false">
                <Icon name="close" :size="19" />
              </button>
            </header>
            <button
              class="language"
              :class="{ active: settings?.language === 'ru' }"
              @click="chooseLanguage('ru')"
            >
              <span class="flag ru" />
              <div><b>Русский</b><small>Основные разделы</small></div>
              <Icon
                v-if="settings?.language === 'ru'"
                name="check"
                :size="18"
              /></button
            ><button
              class="language"
              :class="{ active: settings?.language === 'en' }"
              @click="chooseLanguage('en')"
            >
              <span class="flag en" />
              <div><b>English</b><small>English interface</small></div>
              <Icon
                v-if="settings?.language === 'en'"
                name="check"
                :size="18"
              /></button
            ><button
              class="language"
              :class="{ active: settings?.language === 'es' }"
              @click="chooseLanguage('es')"
            >
              <span class="flag es" />
              <div><b>Español</b><small>Interfaz en español</small></div>
              <Icon
                v-if="settings?.language === 'es'"
                name="check"
                :size="18"
              />
            </button>
          </section></div></Transition
    ></Teleport>
  </div>
</template>

<style scoped lang="scss">
.settings-page {
  max-width: 1120px;
  margin: 0 auto;
  padding: 28px 30px 60px;
  display: grid;
  grid-template-columns: 210px minmax(0, 1fr);
  gap: 36px;
}
.settings-nav {
  position: sticky;
  top: 22px;
  align-self: start;
}
.nav-heading {
  padding: 0 10px 22px;
}
.nav-heading h2 {
  margin-top: 3px;
  font-size: 25px;
}
.nav-list {
  position: relative;
  display: flex;
  flex-direction: column;
}
.nav-list button {
  position: relative;
  z-index: 1;
  height: 46px;
  padding: 0 13px;
  display: flex;
  align-items: center;
  gap: 11px;
  border-radius: 11px;
  color: var(--text-2);
  font-size: 13px;
  font-weight: 650;
  text-align: left;
}
.nav-list button:hover {
  color: var(--text-0);
  transform: translateX(3px);
}
.nav-list button.active {
  color: var(--green-bright);
}
.active-rail {
  position: absolute;
  inset: 0 0 auto;
  height: 42px;
  border-radius: 11px;
  background: var(--green-soft);
  border: 1px solid rgba(83, 195, 106, 0.18);
  box-shadow: inset 3px 0 var(--green);
  transition: transform 0.2s var(--ease);
}
.autosave {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 22px 10px 0;
  color: var(--text-3);
  font-size: 10.5px;
}
.autosave span {
  width: 7px;
  height: 7px;
  margin-top: 3px;
  border-radius: 50%;
  background: var(--green);
}
.settings-content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 50px;
}
.settings-section {
  scroll-margin-top: 22px;
}
.settings-section > header {
  display: flex;
  align-items: center;
  gap: 13px;
  margin-bottom: 15px;
}
.settings-section > header > span {
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  flex: none;
  border-radius: 11px;
  color: var(--green);
  background: var(--green-soft);
  border: 1px solid rgba(83, 195, 106, 0.15);
}
.settings-section h3 {
  font-size: 19px;
}
.settings-section header p {
  margin-top: 3px;
  color: var(--text-3);
  font-size: 12px;
}
.setting-card {
  width: 100%;
  margin-top: 8px;
  padding: 15px 16px;
  border-radius: 14px;
  background: rgba(17, 23, 19, 0.9);
  border: 1px solid var(--hairline);
  backdrop-filter: blur(18px);
  transition:
    border-color 0.25s,
    background 0.25s,
    transform 0.25s var(--ease),
    box-shadow 0.25s;
}
.setting-card:hover {
  border-color: var(--hairline-strong);
  background: rgba(23, 31, 25, 0.96);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
}
.setting-card.compact {
  min-height: 70px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.setting-card.column {
  display: flex;
  flex-direction: column;
  gap: 11px;
}
.setting-icon {
  width: 37px;
  height: 37px;
  display: grid;
  place-items: center;
  flex: none;
  border-radius: 10px;
  color: var(--text-2);
  background: var(--surface-3);
}
.setting-copy {
  min-width: 0;
  flex: 1;
  text-align: left;
}
.setting-copy b,
.setting-copy small,
label b,
label small {
  display: block;
}
.setting-copy b,
label b {
  color: var(--text-0);
  font-size: 13px;
}
.setting-copy small,
label small {
  margin-top: 3px;
  color: var(--text-3);
  font-size: 11.5px;
  line-height: 1.4;
}
.setting-copy .path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 430px;
}
.automatic-status {
  height: 30px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex: none;
  border-radius: 999px;
  color: var(--green);
  background: var(--green-soft);
  border: 1px solid var(--green-line);
  font-size: 10px;
  font-weight: 700;
}
.row-actions {
  display: flex;
  gap: 7px;
}
.media-setting {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr) auto;
  align-items: center;
  gap: 15px;
}
.media-preview {
  position: relative;
  height: 82px;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 11px;
  color: var(--text-3);
  background: linear-gradient(135deg, var(--surface-3), #0b120d);
  border: 1px solid var(--hairline);
}
.media-preview video,
.media-preview > i {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.media-preview > i {
  display: block;
  background-size: cover;
  background-position: center;
}
.media-preview > b {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 3px 6px;
  border-radius: 5px;
  color: #fff;
  background: #0009;
  font-size: 7px;
  letter-spacing: 0.1em;
}
.language-button > span {
  color: var(--green);
  font-size: 11px;
  font-weight: 700;
}
.language-button:hover > svg {
  transform: translateX(3px);
}
.control {
  height: 41px;
  padding: 0 12px;
  border-radius: 9px;
  color: var(--text-0);
  background: var(--surface-3);
  border: 1px solid var(--hairline);
  outline: none;
  font-size: 12.5px;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}
.control:focus {
  border-color: var(--green-line);
  box-shadow: 0 0 0 3px var(--green-soft);
}
.control.wide {
  width: 100%;
}
.status-pill {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  border-radius: 999px;
  color: var(--text-3);
  background: var(--surface-3);
  font-size: 11px;
}
.status-pill i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
}
.status-pill.ok {
  color: var(--green);
  background: var(--green-soft);
}
.status-pill.bad {
  color: var(--danger);
  background: rgba(255, 93, 108, 0.1);
}
.inline-error {
  margin-top: 8px;
  padding: 9px 11px;
  display: flex;
  align-items: center;
  gap: 7px;
  border-radius: 9px;
  color: var(--danger);
  background: rgba(255, 93, 108, 0.1);
  font-size: 10px;
}
.advanced-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.advanced-grid label {
  min-width: 0;
}
.advanced-grid .control {
  margin-top: 9px;
}
.control.multiline {
  height: 70px;
  padding-top: 10px;
  resize: vertical;
  line-height: 1.4;
}
.native-dropdown {
  position: relative;
  width: 190px;
  flex: none;
}
.native-trigger {
  width: 100%;
  min-height: 42px;
  padding: 0 11px 0 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid var(--hairline-strong);
  border-radius: 10px;
  color: var(--text-1);
  background: var(--surface-2);
}
.native-trigger svg {
  color: var(--text-3);
  transform: rotate(90deg);
  transition: transform 0.2s var(--ease);
}
.native-dropdown.open .native-trigger {
  border-color: var(--green-line);
  background: var(--green-soft);
}
.native-dropdown.open .native-trigger svg {
  color: var(--green);
  transform: rotate(-90deg);
}
.native-menu {
  position: absolute;
  z-index: 40;
  top: calc(100% + 7px);
  right: 0;
  width: 260px;
  padding: 6px;
  border: 1px solid var(--hairline-strong);
  border-radius: 12px;
  background: rgba(13, 19, 15, 0.98);
  box-shadow: 0 18px 48px #000a;
  backdrop-filter: blur(18px);
}
.native-menu button {
  width: 100%;
  min-height: 50px;
  padding: 8px 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-radius: 8px;
  text-align: left;
  color: var(--text-2);
}
.native-menu button:hover,
.native-menu button.active {
  color: var(--text-0);
  background: var(--green-soft);
}
.native-menu button > span {
  min-width: 0;
}
.native-menu b,
.native-menu small {
  display: block;
}
.native-menu b {
  font-size: 10px;
}
.native-menu small {
  margin-top: 3px;
  color: var(--text-3);
  font-size: 8px;
}
.native-menu svg {
  flex: none;
  color: var(--green);
}
.native-menu-enter-active,
.native-menu-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.18s var(--ease);
  transform-origin: top right;
}
.native-menu-enter-from,
.native-menu-leave-to {
  opacity: 0;
  transform: translateY(-5px) scale(0.97);
}
.update-card {
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: center;
  gap: 10px;
}
.launcher-update-progress {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  border-radius: 0 4px 4px 0;
  background: var(--green);
  box-shadow: 0 0 12px rgba(87, 205, 112, 0.5);
  transition: width 0.18s linear;
}
.launcher-update-button:disabled {
  cursor: wait;
  opacity: 0.78;
}
.launcher-update-button {
  min-width: 154px;
  min-height: 43px;
  padding: 6px 12px;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 9px;
  border-color: var(--green-line);
  background: var(--green-soft);
}
.launcher-update-button > span {
  min-width: 0;
  display: block;
  text-align: left;
}
.launcher-update-button small,
.launcher-update-button b {
  display: block;
  white-space: nowrap;
}
.launcher-update-button small {
  color: var(--text-3);
  font: 8px var(--font-num);
}
.launcher-update-button b {
  margin-top: 2px;
  color: var(--green);
  font-size: 10px;
}
.launcher-update-button:hover {
  transform: translateY(-1px);
  border-color: var(--green);
  background: rgba(83, 195, 106, 0.15);
}
.setting-copy small.update-error {
  color: var(--danger);
}
.spin {
  animation: spin 0.75s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.memory-panel {
  padding: 18px;
}
.subsection-heading {
  margin: 18px 2px 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--green);
}
.subsection-heading b,
.subsection-heading small {
  display: block;
}
.subsection-heading b {
  color: var(--text-0);
  font-size: 12px;
}
.subsection-heading small {
  margin-top: 2px;
  color: var(--text-3);
  font-size: 9.5px;
}
.memory-top,
.system-memory {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}
.memory-top > div:first-child b,
.memory-top > div:first-child small {
  display: block;
}
.memory-top > div:first-child b {
  color: var(--text-0);
  font-size: 13px;
}
.memory-top > div:first-child small {
  margin-top: 3px;
  color: var(--text-3);
  font-size: 10.5px;
}
.mode-switch {
  display: flex;
  border: 1px solid var(--hairline-strong);
  border-radius: 10px;
  overflow: hidden;
}
.mode-switch button {
  height: 38px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-2);
  border-right: 1px solid var(--hairline);
  font-size: 11px;
  font-weight: 650;
}
.mode-switch button:last-child {
  border: 0;
}
.mode-switch button:hover {
  color: var(--text-0);
  background: var(--surface-3);
}
.mode-switch button.active {
  color: var(--green);
  background: var(--green-soft);
}
.system-memory {
  margin-top: 19px;
  color: var(--text-2);
  font-size: 10.5px;
}
.system-memory span {
  display: flex;
  align-items: center;
  gap: 6px;
}
.system-memory b {
  color: var(--text-1);
  font-family: var(--font-num);
  font-size: 10px;
}
.memory-track {
  height: 8px;
  margin-top: 8px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-4);
}
.memory-track i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #79817b, #d6a535, #57c66e);
  transition: width 0.45s var(--ease);
}
.manual-memory {
  margin-top: 19px;
  display: flex;
  flex-direction: column;
  gap: 13px;
  transition: opacity 0.25s;
}
.manual-memory.disabled {
  opacity: 0.35;
}
.manual-memory label {
  display: grid;
  grid-template-columns: 190px minmax(120px, 1fr) 108px;
  align-items: center;
  gap: 13px;
}
.manual-memory label > span {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-1);
  font-size: 11.5px;
}
.manual-memory label:first-child > span svg {
  color: #ff8c42;
}
.manual-memory label:nth-child(2) > span svg {
  color: var(--green);
}
.manual-memory input {
  width: 100%;
  accent-color: var(--green);
}
.manual-memory label > b {
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--text-1);
  background: var(--surface-3);
  border: 1px solid var(--hairline);
  font-family: var(--font-num);
  font-size: 11px;
}
.memory-note {
  margin-top: 16px;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-3);
  font-size: 10.5px;
}
.sheet-overlay {
  position: fixed;
  inset: 0;
  z-index: 600;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(2, 5, 3, 0.68);
  backdrop-filter: blur(8px);
}
.language-sheet {
  position: relative;
  width: min(520px, calc(100% - 30px));
  margin-bottom: 16px;
  padding: 18px;
  border-radius: 20px;
  background: #151b17;
  border: 1px solid var(--hairline-strong);
  box-shadow: 0 30px 100px #000b;
}
.grab {
  position: absolute;
  top: 8px;
  left: 50%;
  width: 38px;
  height: 4px;
  border-radius: 4px;
  background: var(--surface-4);
  transform: translateX(-50%);
}
.language-sheet header {
  margin: 8px 0 14px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.language-sheet h2 {
  margin-top: 3px;
  font-size: 21px;
}
.language {
  width: 100%;
  min-height: 62px;
  margin-top: 7px;
  padding: 8px 11px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 12px;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  text-align: left;
}
.language > span {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--surface-3);
  font-family: var(--font-num);
  font-weight: 800;
}
.language > .flag {
  height: 28px;
  border-radius: 6px;
  box-shadow:
    inset 0 0 0 1px #fff3,
    0 2px 8px #0005;
  overflow: hidden;
}
.flag.ru {
  background: linear-gradient(
    #fff 0 33.33%,
    #2855d9 33.33% 66.66%,
    #d9363e 66.66%
  );
}
.flag.es {
  background: linear-gradient(#aa151b 0 25%, #f1bf00 25% 75%, #aa151b 75%);
}
.flag.en {
  position: relative;
  background:
    linear-gradient(
      33deg,
      transparent 42%,
      #fff 43% 49%,
      #c8102e 50% 54%,
      #fff 55% 61%,
      transparent 62%
    ),
    linear-gradient(
      -33deg,
      transparent 42%,
      #fff 43% 49%,
      #c8102e 50% 54%,
      #fff 55% 61%,
      transparent 62%
    ),
    #21468b;
}
.flag.en::after {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(
      90deg,
      transparent 39%,
      #fff 39% 44%,
      #c8102e 44% 56%,
      #fff 56% 61%,
      transparent 61%
    ),
    linear-gradient(
      transparent 34%,
      #fff 34% 40%,
      #c8102e 40% 60%,
      #fff 60% 66%,
      transparent 66%
    );
}
.fit-toggle {
  padding: 3px;
  display: flex;
  border-radius: 9px;
  background: var(--surface-3);
  border: 1px solid var(--hairline);
}
.fit-toggle button {
  height: 32px;
  padding: 0 11px;
  border-radius: 7px;
  color: var(--text-3);
  font-size: 10px;
  font-weight: 700;
}
.fit-toggle button.active {
  color: var(--green);
  background: var(--green-soft);
}
.language > div {
  flex: 1;
}
.language b,
.language small {
  display: block;
}
.language b {
  color: var(--text-0);
  font-size: 12.5px;
}
.language small {
  margin-top: 3px;
  color: var(--text-3);
  font-size: 10px;
}
.language.active {
  color: var(--green);
  background: var(--green-soft);
  border-color: var(--green-line);
}
.language em {
  padding: 4px 7px;
  border-radius: 6px;
  background: var(--surface-3);
  font-size: 9px;
  font-style: normal;
}
.language:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.3s var(--ease);
}
.sheet-enter-active .language-sheet,
.sheet-leave-active .language-sheet {
  transition:
    transform 0.42s var(--ease),
    opacity 0.3s;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .language-sheet,
.sheet-leave-to .language-sheet {
  transform: translateY(110%);
  opacity: 0.5;
}
@media (max-width: 850px) {
  .settings-page {
    grid-template-columns: 1fr;
  }
  .settings-nav {
    position: static;
  }
  .nav-heading {
    padding-bottom: 12px;
  }
  .nav-list {
    flex-direction: row;
    overflow: auto;
  }
  .nav-list button {
    flex: none;
  }
  .active-rail,
  .autosave {
    display: none;
  }
  .media-setting {
    grid-template-columns: 120px 1fr;
  }
  .media-setting .row-actions {
    grid-column: 1/-1;
    justify-content: flex-end;
  }
  .memory-top {
    align-items: flex-start;
    flex-direction: column;
  }
  .manual-memory label {
    grid-template-columns: 150px 1fr 98px;
  }
  .advanced-grid {
    grid-template-columns: 1fr;
  }
  .update-card {
    align-items: stretch;
    flex-wrap: wrap;
  }
  .update-card .setting-copy {
    flex-basis: calc(100% - 50px);
  }
}
</style>
