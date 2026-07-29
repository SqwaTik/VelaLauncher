<script setup lang="ts">
import { nextTick, onMounted, ref } from "vue";
import Icon from "./Icon.vue";
import SkinPreview3D from "./SkinPreview3D.vue";
import { useAccountStore } from "@/stores/account";
import type { SkinModel } from "@shared/types";

const emit = defineEmits<{ close: [] }>();
const account = useAccountStore();
const canvas = ref<HTMLCanvasElement | null>(null);
const tool = ref<"pencil" | "eraser" | "fill" | "picker">("pencil");
const viewMode = ref<"3d" | "texture">("3d");
const color = ref("#55d878");
const colorPickerOpen = ref(false);
const hue = ref(138);
const saturation = ref(61);
const brightness = ref(85);
const brushSize = ref(1);
const model = ref<SkinModel>(account.active?.skinModel ?? "classic");
const symmetry = ref(false);
const showGrid = ref(true);
const previewUrl = ref<string | null>(account.skinSource);
const overlayOpacity = ref(70);
const overlayMode = ref<GlobalCompositeOperation>("source-over");
const innerLayer = ref(true);
const outerLayer = ref(true);
const headOuter = ref(true);
const bodyOuter = ref(true);
const armsOuter = ref(true);
const legsOuter = ref(true);
const busy = ref(false);
const error = ref("");
const history = ref<ImageData[]>([]);
const future = ref<ImageData[]>([]);
let drawing = false;
let previewFrame = 0;

const swatches = [
  "#f4f4f4",
  "#151918",
  "#564238",
  "#9b7653",
  "#e2b48b",
  "#ff665e",
  "#ffb34d",
  "#ffe66d",
  "#55d878",
  "#4fc4a3",
  "#4ba3ff",
  "#6f78ff",
  "#b267ff",
  "#ef6fc4",
  "#8d9295",
  "#2a302c",
];

type Rgb = { r: number; g: number; b: number };
type TextureLayer = "inner" | "outer";

const outerRegions = [
  { part: "head", x: 32, y: 0, width: 32, height: 16 },
  { part: "legs", x: 0, y: 32, width: 16, height: 16 },
  { part: "body", x: 16, y: 32, width: 24, height: 16 },
  { part: "arms", x: 40, y: 32, width: 16, height: 16 },
  { part: "legs", x: 0, y: 48, width: 16, height: 16 },
  { part: "arms", x: 48, y: 48, width: 16, height: 16 },
] as const;

function textureLayerAt(x: number, y: number): TextureLayer {
  return outerRegions.some(
    (region) =>
      x >= region.x &&
      x < region.x + region.width &&
      y >= region.y &&
      y < region.y + region.height,
  )
    ? "outer"
    : "inner";
}

function canEditAt(
  x: number,
  y: number,
  layer = textureLayerAt(x, y),
): boolean {
  if (textureLayerAt(x, y) !== layer) return false;
  if (layer === "inner") return innerLayer.value;
  if (!outerLayer.value) return false;
  const region = outerRegions.find(
    (entry) =>
      x >= entry.x &&
      x < entry.x + entry.width &&
      y >= entry.y &&
      y < entry.y + entry.height,
  );
  if (!region) return false;
  if (region.part === "head") return headOuter.value;
  if (region.part === "body") return bodyOuter.value;
  if (region.part === "arms") return armsOuter.value;
  return legsOuter.value;
}

function hexToRgb(value: string): Rgb {
  const normalized = value.replace("#", "");
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  return `#${[r, g, b]
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function rgbToHsv({ r, g, b }: Rgb): {
  h: number;
  s: number;
  v: number;
} {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;
  let h = 0;
  if (delta) {
    if (max === red) h = 60 * (((green - blue) / delta) % 6);
    else if (max === green) h = 60 * ((blue - red) / delta + 2);
    else h = 60 * ((red - green) / delta + 4);
  }
  return {
    h: h < 0 ? h + 360 : h,
    s: max ? (delta / max) * 100 : 0,
    v: max * 100,
  };
}

function hsvToRgb(h: number, s: number, v: number): Rgb {
  const chroma = (v / 100) * (s / 100);
  const section = h / 60;
  const secondary = chroma * (1 - Math.abs((section % 2) - 1));
  const offset = v / 100 - chroma;
  const [red, green, blue] =
    section < 1
      ? [chroma, secondary, 0]
      : section < 2
        ? [secondary, chroma, 0]
        : section < 3
          ? [0, chroma, secondary]
          : section < 4
            ? [0, secondary, chroma]
            : section < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];
  return {
    r: (red + offset) * 255,
    g: (green + offset) * 255,
    b: (blue + offset) * 255,
  };
}

function setColor(value: string): void {
  color.value = value.toLowerCase();
  const next = rgbToHsv(hexToRgb(color.value));
  hue.value = Math.round(next.h);
  saturation.value = Math.round(next.s);
  brightness.value = Math.round(next.v);
}

function updateFromHsv(): void {
  color.value = rgbToHex(
    hsvToRgb(hue.value, saturation.value, brightness.value),
  );
}

function updateColorPlane(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement;
  const rect = target.getBoundingClientRect();
  saturation.value = Math.round(
    Math.max(
      0,
      Math.min(100, ((event.clientX - rect.left) / rect.width) * 100),
    ),
  );
  brightness.value = Math.round(
    Math.max(
      0,
      Math.min(100, 100 - ((event.clientY - rect.top) / rect.height) * 100),
    ),
  );
  updateFromHsv();
}

function beginColorPlane(event: PointerEvent): void {
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  updateColorPlane(event);
}

function updateRgb(channel: keyof Rgb, event: Event): void {
  const input = event.target as HTMLInputElement;
  const next = hexToRgb(color.value);
  next[channel] = Math.max(0, Math.min(255, Number(input.value) || 0));
  setColor(rgbToHex(next));
}

function chooseTool(next: typeof tool.value): void {
  tool.value = next;
}
function updateHex(event: Event): void {
  const input = event.target as HTMLInputElement;
  let value = input.value.trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(value))
    value = value
      .split("")
      .map((part) => part + part)
      .join("");
  if (/^[0-9a-f]{6}$/i.test(value)) setColor(`#${value.toLowerCase()}`);
  input.value = color.value.toUpperCase();
}

function context(): CanvasRenderingContext2D | null {
  return canvas.value?.getContext("2d", { willReadFrequently: true }) ?? null;
}
function remember(): void {
  const ctx = context();
  if (!ctx) return;
  history.value = [...history.value.slice(-39), ctx.getImageData(0, 0, 64, 64)];
  future.value = [];
}
function undo(): void {
  const ctx = context();
  const previous = history.value.at(-1);
  if (!ctx || !previous) return;
  future.value = [...future.value, ctx.getImageData(0, 0, 64, 64)];
  ctx.putImageData(previous, 0, 0);
  history.value = history.value.slice(0, -1);
  updatePreview();
}
function redo(): void {
  const ctx = context();
  const next = future.value.at(-1);
  if (!ctx || !next) return;
  history.value = [...history.value, ctx.getImageData(0, 0, 64, 64)];
  ctx.putImageData(next, 0, 0);
  future.value = future.value.slice(0, -1);
  updatePreview();
}
function point(event: PointerEvent): { x: number; y: number } {
  const rect = canvas.value!.getBoundingClientRect();
  return {
    x: Math.max(
      0,
      Math.min(63, Math.floor(((event.clientX - rect.left) / rect.width) * 64)),
    ),
    y: Math.max(
      0,
      Math.min(63, Math.floor(((event.clientY - rect.top) / rect.height) * 64)),
    ),
  };
}
function hexAt(x: number, y: number): string {
  const data = context()?.getImageData(x, y, 1, 1).data;
  if (!data) return color.value;
  return `#${[data[0], data[1], data[2]].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}
function drawPixel(
  x: number,
  y: number,
  layer: TextureLayer = textureLayerAt(x, y),
): void {
  const ctx = context();
  if (!ctx) return;
  const half = Math.floor(brushSize.value / 2);
  const points = symmetry.value ? [x, 63 - x] : [x];
  ctx.fillStyle = color.value;
  for (const centerX of new Set(points)) {
    for (let offsetY = 0; offsetY < brushSize.value; offsetY += 1) {
      for (let offsetX = 0; offsetX < brushSize.value; offsetX += 1) {
        const px = centerX - half + offsetX;
        const py = y - half + offsetY;
        if (px < 0 || py < 0 || px >= 64 || py >= 64) continue;
        if (!canEditAt(px, py, layer)) continue;
        if (tool.value === "eraser") ctx.clearRect(px, py, 1, 1);
        else ctx.fillRect(px, py, 1, 1);
      }
    }
  }
}
function floodFill(
  x: number,
  y: number,
  layer: TextureLayer = textureLayerAt(x, y),
): void {
  const ctx = context();
  if (!ctx) return;
  if (!canEditAt(x, y, layer)) return;
  const image = ctx.getImageData(0, 0, 64, 64);
  const pixels = image.data;
  const start = (y * 64 + x) * 4;
  const target = [
    pixels[start],
    pixels[start + 1],
    pixels[start + 2],
    pixels[start + 3],
  ];
  const fill = color.value
    .match(/[a-f\d]{2}/gi)
    ?.map((entry) => parseInt(entry, 16)) ?? [85, 216, 120];
  if (
    target[0] === fill[0] &&
    target[1] === fill[1] &&
    target[2] === fill[2] &&
    target[3] === 255
  )
    return;
  const stack = [[x, y]];
  while (stack.length) {
    const [px, py] = stack.pop()!;
    if (px < 0 || py < 0 || px >= 64 || py >= 64) continue;
    if (!canEditAt(px, py, layer)) continue;
    const index = (py * 64 + px) * 4;
    if (
      pixels[index] !== target[0] ||
      pixels[index + 1] !== target[1] ||
      pixels[index + 2] !== target[2] ||
      pixels[index + 3] !== target[3]
    )
      continue;
    pixels[index] = fill[0];
    pixels[index + 1] = fill[1];
    pixels[index + 2] = fill[2];
    pixels[index + 3] = 255;
    stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
  }
  ctx.putImageData(image, 0, 0);
}
function begin(event: PointerEvent): void {
  const { x, y } = point(event);
  if (tool.value === "picker") {
    setColor(hexAt(x, y));
    tool.value = "pencil";
    return;
  }
  remember();
  if (tool.value === "fill") {
    floodFill(x, y);
    updatePreview();
    return;
  }
  drawing = true;
  canvas.value?.setPointerCapture(event.pointerId);
  drawPixel(x, y);
}
function paint(event: PointerEvent): void {
  if (drawing) {
    const { x, y } = point(event);
    drawPixel(x, y);
  }
}
function end(): void {
  if (!drawing) return;
  drawing = false;
  updatePreview();
}
function paintModel(payload: {
  x: number;
  y: number;
  layer: TextureLayer;
  phase: "begin" | "move" | "end";
}): void {
  if (payload.phase === "end") {
    drawing = false;
    updatePreview();
    return;
  }
  if (payload.phase === "begin") {
    if (tool.value === "picker") {
      setColor(hexAt(payload.x, payload.y));
      tool.value = "pencil";
      return;
    }
    remember();
    if (tool.value === "fill") {
      floodFill(payload.x, payload.y, payload.layer);
      updatePreview();
      return;
    }
    drawing = true;
  }
  if (drawing) {
    drawPixel(payload.x, payload.y, payload.layer);
    updatePreview();
  }
}
function updatePreview(): void {
  cancelAnimationFrame(previewFrame);
  previewFrame = requestAnimationFrame(() => {
    if (canvas.value) previewUrl.value = canvas.value.toDataURL("image/png");
  });
}
function clearOuterLayer(): void {
  const ctx = context();
  if (!ctx) return;
  remember();
  const rectangles = [
    [32, 0, 32, 16],
    [0, 32, 16, 16],
    [16, 32, 24, 16],
    [40, 32, 16, 16],
    [0, 48, 16, 16],
    [48, 48, 16, 16],
  ];
  rectangles.forEach(([x, y, w, h]) => ctx.clearRect(x, y, w, h));
  updatePreview();
}
function mirrorTexture(): void {
  const ctx = context();
  if (!ctx) return;
  remember();
  const copy = document.createElement("canvas");
  copy.width = copy.height = 64;
  copy.getContext("2d")?.drawImage(canvas.value!, 0, 0);
  ctx.clearRect(0, 0, 64, 64);
  ctx.save();
  ctx.translate(64, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(copy, 0, 0);
  ctx.restore();
  updatePreview();
}
async function loadImage(source: string): Promise<void> {
  const ctx = context();
  if (!ctx) return;
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      ctx.clearRect(0, 0, 64, 64);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(image, 0, 0, 64, 64);
      resolve();
    };
    image.onerror = () => reject(new Error("Не удалось загрузить PNG."));
    image.src = source;
  });
  history.value = [];
  future.value = [];
  updatePreview();
}
async function importSkin(): Promise<void> {
  const data = await window.royale.appearance.pickSkin();
  if (data) {
    remember();
    await loadImage(data);
  }
}
async function overlaySkin(): Promise<void> {
  const data = await window.royale.appearance.pickSkin();
  const ctx = context();
  if (!data || !ctx) return;
  remember();
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.globalAlpha = overlayOpacity.value / 100;
      ctx.globalCompositeOperation = overlayMode.value;
      ctx.drawImage(image, 0, 0, 64, 64);
      ctx.restore();
      resolve();
    };
    image.onerror = () =>
      reject(new Error("Не удалось открыть накладываемый PNG."));
    image.src = data;
  });
  updatePreview();
}
async function exportSkin(): Promise<void> {
  if (canvas.value)
    await window.royale.appearance.exportSkin(
      canvas.value.toDataURL("image/png"),
    );
}
async function applySkin(): Promise<void> {
  if (!canvas.value) return;
  busy.value = true;
  error.value = "";
  try {
    await account.saveLocalSkin(
      canvas.value.toDataURL("image/png"),
      model.value,
    );
    emit("close");
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  await nextTick();
  const source =
    account.active?.skinDataUrl ||
    account.appearance?.skinDataUrl ||
    account.skinSource ||
    "https://minotar.net/skin/Steve";
  try {
    await loadImage(source);
  } catch {
    try {
      await loadImage("https://minotar.net/skin/Steve");
    } catch {
      error.value = "Загрузите PNG 64×64, чтобы начать редактирование.";
    }
  }
});
</script>

<template>
  <Teleport to="body"
    ><div class="editor-overlay" @click.self="emit('close')">
      <section class="editor-dialog" role="dialog" aria-modal="true">
        <header>
          <div>
            <p class="eyebrow">Skin Studio 3D</p>
            <h2>Редактор скина</h2>
            <span
              >Рисуйте прямо по видимой поверхности: скрытая одежда открывает
              основной слой</span
            >
          </div>
          <button class="icon-button" @click="emit('close')">
            <Icon name="close" :size="20" />
          </button>
        </header>
        <div class="editor-layout">
          <aside class="tools">
            <p class="tool-label">Инструменты</p>
            <div class="tool-grid">
              <button
                :class="{ active: tool === 'pencil' }"
                title="Карандаш"
                @click="chooseTool('pencil')"
              >
                <Icon name="pencil" :size="18" /></button
              ><button
                :class="{ active: tool === 'eraser' }"
                title="Ластик"
                @click="chooseTool('eraser')"
              >
                <Icon name="eraser" :size="18" /></button
              ><button
                :class="{ active: tool === 'fill' }"
                title="Заливка"
                @click="chooseTool('fill')"
              >
                <Icon name="fill" :size="18" /></button
              ><button
                :class="{ active: tool === 'picker' }"
                title="Пипетка"
                @click="chooseTool('picker')"
              >
                <Icon name="picker" :size="18" />
              </button>
            </div>
            <div class="history-row">
              <button :disabled="!history.length" @click="undo">
                <Icon name="undo" :size="16" />Undo</button
              ><button :disabled="!future.length" @click="redo">
                <Icon name="refresh" :size="16" />Redo
              </button>
            </div>
            <p class="tool-label section-label">Размер кисти</p>
            <div class="brush-sizes">
              <button
                v-for="size in [1, 2, 3, 4]"
                :key="size"
                :class="{ active: brushSize === size }"
                @click="brushSize = size"
              >
                <i
                  :style="{
                    width: `${size * 3 + 3}px`,
                    height: `${size * 3 + 3}px`,
                  }"
                />{{ size }}
              </button>
            </div>
            <p class="tool-label section-label">Цвет</p>
            <div class="color-control" @click.stop>
              <button
                class="color-orb"
                :class="{ active: colorPickerOpen }"
                :style="{ background: color }"
                aria-label="Открыть палитру"
                @click="colorPickerOpen = !colorPickerOpen"
              />
              <input
                class="hex-field"
                :value="color.toUpperCase()"
                maxlength="7"
                spellcheck="false"
                aria-label="HEX цвет"
                @change="updateHex"
              />
              <Transition name="picker-pop">
                <div v-if="colorPickerOpen" class="color-picker">
                  <div
                    class="color-plane"
                    :style="{ backgroundColor: `hsl(${hue} 100% 50%)` }"
                    @pointerdown.prevent="beginColorPlane"
                    @pointermove.prevent="
                      ($event.currentTarget as HTMLElement).hasPointerCapture(
                        $event.pointerId,
                      ) && updateColorPlane($event)
                    "
                  >
                    <i
                      :style="{
                        left: `${saturation}%`,
                        top: `${100 - brightness}%`,
                      }"
                    />
                  </div>
                  <div class="color-picker-row">
                    <button
                      title="Взять цвет со скина"
                      :class="{ active: tool === 'picker' }"
                      @click="
                        chooseTool('picker');
                        colorPickerOpen = false;
                      "
                    >
                      <Icon name="picker" :size="17" />
                    </button>
                    <span
                      class="picker-preview"
                      :style="{ background: color }"
                    />
                    <input
                      v-model.number="hue"
                      class="hue-slider"
                      type="range"
                      min="0"
                      max="359"
                      aria-label="Оттенок"
                      @input="updateFromHsv"
                    />
                  </div>
                  <div class="color-values">
                    <label
                      v-for="channel in ['r', 'g', 'b'] as const"
                      :key="channel"
                    >
                      <input
                        :value="hexToRgb(color)[channel]"
                        type="number"
                        min="0"
                        max="255"
                        @change="updateRgb(channel, $event)"
                      />
                      <span>{{ channel.toUpperCase() }}</span>
                    </label>
                  </div>
                </div>
              </Transition>
            </div>
            <div class="swatches">
              <button
                v-for="swatch in swatches"
                :key="swatch"
                :class="{ active: color === swatch }"
                :style="{ background: swatch }"
                @click="setColor(swatch)"
              />
            </div>
            <p class="tool-label section-label">Модель</p>
            <div class="model-toggle">
              <button
                :class="{ active: model === 'classic' }"
                @click="model = 'classic'"
              >
                Classic<small>4 px</small></button
              ><button
                :class="{ active: model === 'slim' }"
                @click="model = 'slim'"
              >
                Slim<small>3 px</small>
              </button>
            </div>
            <p class="tool-label section-label">Опции</p>
            <button
              class="option-button"
              :class="{ active: symmetry }"
              @click="symmetry = !symmetry"
            >
              <Icon name="copy" :size="16" />Симметрия</button
            ><button class="option-button" @click="mirrorTexture">
              <Icon name="refresh" :size="16" />Отразить атлас</button
            ><button class="option-button danger" @click="clearOuterLayer">
              <Icon name="trash" :size="16" />Очистить 2-й слой
            </button>
            <p class="tool-label section-label">Наложение PNG</p>
            <select v-model="overlayMode" class="blend-select">
              <option value="source-over">Обычное</option>
              <option value="multiply">Умножение</option>
              <option value="screen">Экран</option>
              <option value="overlay">Перекрытие</option></select
            ><label class="opacity-row"
              ><span>Прозрачность</span
              ><input
                v-model.number="overlayOpacity"
                type="range"
                min="5"
                max="100"
              /><b>{{ overlayOpacity }}%</b></label
            ><button class="option-button" @click="overlaySkin">
              <Icon name="layers" :size="16" />Наложить другой скин
            </button>
          </aside>

          <main class="workspace">
            <div class="view-tabs">
              <button
                :class="{ active: viewMode === '3d' }"
                @click="viewMode = '3d'"
              >
                <Icon name="rotate3d" :size="17" />3D-модель</button
              ><button
                :class="{ active: viewMode === 'texture' }"
                @click="viewMode = 'texture'"
              >
                <Icon name="image" :size="17" />Текстура 64×64
              </button>
            </div>
            <div v-show="viewMode === '3d'" class="model-stage">
              <SkinPreview3D
                :skin="previewUrl"
                :model="model"
                :auto-rotate="false"
                editable
                :inner-layer="innerLayer"
                :outer-layer="outerLayer"
                :head-outer="headOuter"
                :body-outer="bodyOuter"
                :arms-outer="armsOuter"
                :legs-outer="legsOuter"
                @paint="paintModel"
              />
              <div class="stage-hint">
                <Icon name="pencil" :size="15" />ЛКМ — рисовать · ПКМ — вращать
                · колесо — масштаб
              </div>
            </div>
            <div v-show="viewMode === 'texture'" class="canvas-stage">
              <div class="canvas-frame" :class="{ grid: showGrid }">
                <canvas
                  ref="canvas"
                  width="64"
                  height="64"
                  @pointerdown.prevent="begin"
                  @pointermove.prevent="paint"
                  @pointerup="end"
                  @pointercancel="end"
                />
              </div>
              <button
                class="grid-toggle"
                :class="{ active: showGrid }"
                @click="showGrid = !showGrid"
              >
                <Icon name="layers" :size="15" />Сетка пикселей
              </button>
            </div>
          </main>

          <aside class="layers-panel">
            <p class="tool-label">Видимые части одежды</p>
            <button
              class="part"
              :class="{ active: headOuter }"
              @click="headOuter = !headOuter"
            >
              <span>Голова / маска</span><i /></button
            ><button
              class="part"
              :class="{ active: bodyOuter }"
              @click="bodyOuter = !bodyOuter"
            >
              <span>Куртка / тело</span><i /></button
            ><button
              class="part"
              :class="{ active: armsOuter }"
              @click="armsOuter = !armsOuter"
            >
              <span>Рукава</span><i /></button
            ><button
              class="part"
              :class="{ active: legsOuter }"
              @click="legsOuter = !legsOuter"
            >
              <span>Штанины</span><i />
            </button>
            <div class="layer-note">
              <Icon name="pencil" :size="15" />
              <p>
                Редактор изменяет именно ту поверхность, которую вы видите.
                Скройте маску, рукав или куртку, чтобы рисовать по основному
                слою под ними.
              </p>
            </div>
          </aside>
        </div>
        <p v-if="error" class="editor-error">
          <Icon name="alert" :size="16" />{{ error }}
        </p>
        <footer>
          <div>
            <button class="btn" @click="importSkin">
              <Icon name="folder" :size="16" />Открыть PNG</button
            ><button class="btn" @click="exportSkin">
              <Icon name="save" :size="16" />Экспорт PNG
            </button>
          </div>
          <div>
            <button class="btn btn-ghost" @click="emit('close')">Отмена</button
            ><button
              class="btn btn-primary"
              :disabled="busy || !account.active"
              @click="applySkin"
            >
              <Icon
                :name="busy ? 'spinner' : 'check'"
                :size="16"
                :class="{ spin: busy }"
              />{{ busy ? "Сохраняем…" : "Применить к профилю" }}
            </button>
          </div>
        </footer>
      </section>
    </div></Teleport
  >
</template>

<style scoped lang="scss">
.editor-overlay {
  position: fixed;
  inset: 0;
  z-index: 650;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(3, 6, 4, 0.8);
  backdrop-filter: blur(14px);
  animation: overlay-in 0.16s ease;
}
.editor-dialog {
  width: min(1180px, 100%);
  height: min(780px, calc(100vh - 36px));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 20px;
  background: #101612;
  border: 1px solid var(--hairline-strong);
  box-shadow: 0 36px 120px #000c;
  animation: dialog-in 0.22s var(--ease);
}
.editor-dialog > header {
  padding: 18px 21px;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  border-bottom: 1px solid var(--hairline);
}
.editor-dialog h2 {
  margin-top: 2px;
  font-size: 23px;
}
.editor-dialog header span {
  display: block;
  margin-top: 4px;
  color: var(--text-3);
  font-size: 11px;
}
.editor-layout {
  min-height: 0;
  flex: 1;
  display: grid;
  grid-template-columns: 224px minmax(400px, 1fr) 202px;
}
.tools,
.layers-panel {
  padding: 17px;
  overflow-y: auto;
  background: #0d120f;
}
.tools {
  border-right: 1px solid var(--hairline);
}
.layers-panel {
  border-left: 1px solid var(--hairline);
}
.tool-label {
  margin: 0 5px 8px;
  color: var(--text-3);
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.section-label {
  margin-top: 18px;
}
.tool-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
}
.tool-grid button {
  height: 39px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
}
.tool-grid button:hover,
.tool-grid button.active {
  color: var(--green);
  background: var(--green-soft);
  border-color: var(--green-line);
  transform: translateY(-2px);
}
.history-row {
  margin-top: 7px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}
.history-row button {
  height: 33px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border-radius: 8px;
  color: var(--text-2);
  background: var(--surface-2);
  font-size: 9.5px;
}
.history-row button:disabled {
  opacity: 0.3;
}
.brush-sizes {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 4px;
}
.brush-sizes button {
  height: 37px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border-radius: 8px;
  color: var(--text-3);
  background: var(--surface-2);
  font-size: 9px;
}
.brush-sizes i {
  display: block;
  background: currentColor;
}
.brush-sizes button.active {
  color: var(--green);
  background: var(--green-soft);
}
.color-control {
  position: relative;
  z-index: 12;
  height: 47px;
  padding: 5px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 11px;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
}
.color-orb {
  position: relative;
  width: 35px;
  height: 35px;
  flex: none;
  border-radius: 50%;
  border: 3px solid #fff;
  box-shadow:
    0 0 0 2px var(--green-line),
    0 4px 12px #0006;
  cursor: pointer;
  transition:
    transform 0.15s ease,
    box-shadow 0.15s ease;
}
.color-orb:hover,
.color-orb.active {
  transform: scale(1.06);
  box-shadow:
    0 0 0 2px var(--green),
    0 6px 16px #0008;
}
.color-control code {
  font-family: var(--font-num);
  font-size: 10px;
}
.color-picker {
  position: absolute;
  top: 53px;
  left: 0;
  width: 202px;
  padding: 9px;
  border: 1px solid var(--hairline-strong);
  border-radius: 12px;
  background: #151a18;
  box-shadow: 0 18px 50px #000b;
}
.color-plane {
  position: relative;
  height: 126px;
  overflow: hidden;
  border-radius: 8px;
  cursor: crosshair;
  touch-action: none;
  background-image:
    linear-gradient(to top, #000, transparent),
    linear-gradient(to right, #fff, transparent);
}
.color-plane::before {
  content: "";
  position: absolute;
  inset: 0;
  background:
    linear-gradient(to top, #000, transparent),
    linear-gradient(to right, #fff, transparent);
}
.color-plane i {
  position: absolute;
  z-index: 1;
  width: 13px;
  height: 13px;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 1px 5px #000c;
  transform: translate(-50%, -50%);
  pointer-events: none;
}
.color-picker-row {
  margin-top: 9px;
  display: grid;
  grid-template-columns: 30px 30px 1fr;
  align-items: center;
  gap: 7px;
}
.color-picker-row button,
.picker-preview {
  width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 8px;
}
.color-picker-row button {
  color: var(--text-2);
  background: var(--surface-3);
}
.color-picker-row button:hover,
.color-picker-row button.active {
  color: var(--green);
  background: var(--green-soft);
}
.picker-preview {
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px #0008;
}
.hue-slider {
  width: 100%;
  height: 12px;
  padding: 0;
  appearance: none;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    #f33,
    #ff0,
    #2dff66,
    #20e6ff,
    #36f,
    #d33bff,
    #f33
  );
}
.hue-slider::-webkit-slider-thumb {
  width: 16px;
  height: 16px;
  appearance: none;
  border: 2px solid #fff;
  border-radius: 50%;
  background: transparent;
  box-shadow: 0 1px 5px #000b;
}
.color-values {
  margin-top: 9px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}
.color-values label {
  display: grid;
  gap: 4px;
  color: var(--text-3);
  font-size: 8px;
  text-align: center;
}
.color-values input {
  min-width: 0;
  height: 30px;
  padding: 0 4px;
  color: var(--text-0);
  border: 1px solid var(--hairline);
  border-radius: 7px;
  outline: none;
  background: #0c100e;
  font: 600 10px var(--font-num);
  text-align: center;
  appearance: textfield;
}
.color-values input::-webkit-inner-spin-button {
  appearance: none;
}
.color-values input:focus {
  border-color: var(--green-line);
}
.picker-pop-enter-active,
.picker-pop-leave-active {
  transition:
    opacity 0.13s ease,
    transform 0.13s ease;
  transform-origin: top left;
}
.picker-pop-enter-from,
.picker-pop-leave-to {
  opacity: 0;
  transform: translateY(-5px) scale(0.98);
}
.swatches {
  margin-top: 8px;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 5px;
}
.swatches button {
  aspect-ratio: 1;
  border-radius: 50%;
  border: 2px solid transparent;
  box-shadow: inset 0 0 0 1px #fff2;
}
.swatches button.active {
  border-color: #fff;
  transform: scale(1.18);
}
.model-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
}
.model-toggle button {
  height: 46px;
  border-radius: 9px;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  font-size: 10.5px;
  font-weight: 700;
}
.model-toggle small {
  display: block;
  margin-top: 2px;
  color: var(--text-3);
  font-size: 8px;
}
.model-toggle button.active {
  color: var(--green);
  background: var(--green-soft);
  border-color: var(--green-line);
}
.option-button {
  width: 100%;
  height: 34px;
  margin-top: 4px;
  padding: 0 9px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  color: var(--text-2);
  background: var(--surface-2);
  font-size: 10px;
  text-align: left;
}
.option-button:hover,
.option-button.active {
  color: var(--green);
  background: var(--green-soft);
}
.option-button.danger:hover {
  color: var(--danger);
  background: rgba(255, 93, 108, 0.1);
}
.workspace {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(
      circle at 50% 35%,
      rgba(74, 180, 96, 0.13),
      transparent 55%
    ),
    linear-gradient(145deg, #111a14, #080d0a);
}
.view-tabs {
  position: absolute;
  left: 50%;
  top: 14px;
  z-index: 4;
  padding: 4px;
  display: flex;
  border-radius: 11px;
  background: #080c09b8;
  border: 1px solid var(--hairline);
  backdrop-filter: blur(14px);
  transform: translateX(-50%);
}
.view-tabs button {
  height: 36px;
  padding: 0 12px;
  display: flex;
  align-items: center;
  gap: 7px;
  border-radius: 8px;
  color: var(--text-3);
  font-size: 10.5px;
  font-weight: 700;
}
.view-tabs button.active {
  color: var(--green);
  background: var(--green-soft);
}
.model-stage,
.canvas-stage {
  min-height: 0;
  flex: 1;
}
.model-stage {
  position: relative;
}
.stage-hint {
  position: absolute;
  left: 50%;
  bottom: 15px;
  padding: 7px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 999px;
  color: var(--text-2);
  background: #070b08b8;
  border: 1px solid var(--hairline);
  backdrop-filter: blur(10px);
  font-size: 9.5px;
  transform: translateX(-50%);
}
.canvas-stage {
  padding: 72px 26px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
}
.canvas-frame {
  position: relative;
  padding: 1px;
  background-color: #aeb7b1;
  background-image:
    linear-gradient(45deg, #737e77 25%, transparent 25%),
    linear-gradient(-45deg, #737e77 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #737e77 75%),
    linear-gradient(-45deg, transparent 75%, #737e77 75%);
  background-size: 14px 14px;
  background-position:
    0 0,
    0 7px,
    7px -7px,
    -7px 0;
  border: 1px solid var(--hairline-strong);
  box-shadow: 0 20px 60px #0008;
}
.canvas-frame canvas {
  display: block;
  width: min(460px, 52vw, calc(100vh - 340px));
  height: min(460px, 52vw, calc(100vh - 340px));
  image-rendering: pixelated;
  cursor: crosshair;
  touch-action: none;
}
.canvas-frame.grid::after {
  content: "";
  position: absolute;
  inset: 1px;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(0, 0, 0, 0.16) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 0, 0, 0.16) 1px, transparent 1px);
  background-size: calc(100% / 64) calc(100% / 64);
}
.grid-toggle {
  margin-top: 12px;
  padding: 7px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  color: var(--text-3);
  background: var(--surface-2);
  font-size: 9.5px;
}
.grid-toggle.active {
  color: var(--green);
  background: var(--green-soft);
}
.layers-panel > button {
  width: 100%;
  min-height: 50px;
  margin-top: 6px;
  padding: 7px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  text-align: left;
}
.layers-panel > button > span:first-child {
  width: 31px;
  height: 31px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--surface-3);
}
.layers-panel > button > div {
  flex: 1;
}
.layers-panel b,
.layers-panel small {
  display: block;
}
.layers-panel b {
  color: var(--text-1);
  font-size: 10.5px;
}
.layers-panel small {
  margin-top: 2px;
  font-size: 8.5px;
}
.layers-panel button > i {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--surface-4);
  box-shadow: inset 0 0 0 2px #0003;
}
.layers-panel button.active {
  color: var(--green);
  background: var(--green-soft);
  border-color: var(--green-line);
}
.layers-panel button.active > i {
  background: var(--green);
  box-shadow: 0 0 9px rgba(83, 195, 106, 0.6);
}
.layers-panel > button.part {
  min-height: 37px;
  padding: 0 9px;
}
.layers-panel > button.part > span {
  width: auto;
  height: auto;
  display: block;
  flex: 1;
  background: none;
  font-size: 9.5px;
}
.layer-note {
  margin-top: 15px;
  padding: 10px;
  display: flex;
  align-items: flex-start;
  gap: 7px;
  border-radius: 9px;
  color: var(--text-3);
  background: var(--surface-2);
  font-size: 9px;
  line-height: 1.4;
}
.layer-note svg {
  color: var(--green);
  margin-top: 1px;
}
.editor-error {
  margin: 10px 20px 0;
  padding: 9px 11px;
  display: flex;
  gap: 8px;
  border-radius: 9px;
  color: var(--danger);
  background: rgba(255, 93, 108, 0.1);
  font-size: 10.5px;
}
.editor-dialog > footer {
  position: relative;
  z-index: 5;
  flex: none;
  padding: 13px 18px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--hairline);
  background: #101612;
}
.editor-dialog > footer > div {
  display: flex;
  gap: 7px;
}
.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes overlay-in {
  from {
    opacity: 0;
  }
}
@keyframes dialog-in {
  from {
    opacity: 0;
    transform: translateY(28px) scale(0.975);
  }
}
.hex-field {
  width: 1px;
  min-width: 0;
  flex: 1;
  height: 34px;
  padding: 0 9px;
  border-radius: 8px;
  color: var(--text-0);
  background: #080d0a;
  border: 1px solid var(--hairline);
  font: 600 10px var(--font-num);
  outline: none;
  text-transform: uppercase;
}
.hex-field:focus {
  border-color: var(--green-line);
  box-shadow: 0 0 0 3px var(--green-soft);
}
.blend-select {
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border-radius: 8px;
  color: var(--text-1);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  font-size: 10px;
}
.opacity-row {
  margin: 7px 0;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 7px;
  color: var(--text-3);
  font-size: 8.5px;
}
.opacity-row input {
  min-width: 0;
  accent-color: var(--green);
}
.opacity-row b {
  font: 600 8px var(--font-num);
}
@media (max-width: 900px) {
  .editor-layout {
    grid-template-columns: 170px 1fr;
  }
  .layers-panel {
    display: none;
  }
}
@media (max-width: 650px) {
  .editor-dialog {
    height: calc(100vh - 20px);
  }
  .editor-layout {
    grid-template-columns: 1fr;
  }
  .tools {
    display: none;
  }
  .canvas-frame canvas {
    width: min(430px, 82vw);
    height: min(430px, 82vw);
  }
  .editor-dialog > footer {
    align-items: stretch;
    flex-direction: column;
  }
  .editor-dialog > footer > div {
    justify-content: flex-end;
    flex-wrap: wrap;
  }
}
</style>
