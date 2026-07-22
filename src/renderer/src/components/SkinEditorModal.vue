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
const viewMode = ref<"3d" | "texture">("texture");
const color = ref("#55d878");
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
  if (/^[0-9a-f]{6}$/i.test(value)) color.value = `#${value.toLowerCase()}`;
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
function drawPixel(x: number, y: number): void {
  const ctx = context();
  if (!ctx) return;
  const half = Math.floor(brushSize.value / 2);
  const points = symmetry.value ? [x, 63 - x] : [x];
  for (const px of new Set(points)) {
    if (tool.value === "eraser")
      ctx.clearRect(px - half, y - half, brushSize.value, brushSize.value);
    else {
      ctx.fillStyle = color.value;
      ctx.fillRect(px - half, y - half, brushSize.value, brushSize.value);
    }
  }
}
function floodFill(x: number, y: number): void {
  const ctx = context();
  if (!ctx) return;
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
    color.value = hexAt(x, y);
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
  phase: "begin" | "move" | "end";
}): void {
  if (payload.phase === "end") {
    drawing = false;
    updatePreview();
    return;
  }
  if (payload.phase === "begin") {
    if (tool.value === "picker") {
      color.value = hexAt(payload.x, payload.y);
      tool.value = "pencil";
      return;
    }
    remember();
    if (tool.value === "fill") {
      floodFill(payload.x, payload.y);
      updatePreview();
      return;
    }
    drawing = true;
  }
  if (drawing) {
    drawPixel(payload.x, payload.y);
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
              >Полная модель, оба слоя и инструменты пиксельного
              редактирования</span
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
            <div class="color-control">
              <label class="color-orb" :style="{ background: color }"
                ><input v-model="color" type="color" /></label
              ><input
                class="hex-field"
                :value="color.toUpperCase()"
                maxlength="7"
                spellcheck="false"
                aria-label="HEX цвет"
                @change="updateHex"
              />
            </div>
            <div class="swatches">
              <button
                v-for="swatch in swatches"
                :key="swatch"
                :class="{ active: color === swatch }"
                :style="{ background: swatch }"
                @click="color = swatch"
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
            <p class="tool-label">Слои модели</p>
            <button
              :class="{ active: innerLayer }"
              @click="innerLayer = !innerLayer"
            >
              <span><Icon name="shirt" :size="17" /></span>
              <div><b>Основной слой</b><small>Тело скина</small></div>
              <i /></button
            ><button
              :class="{ active: outerLayer }"
              @click="outerLayer = !outerLayer"
            >
              <span><Icon name="layers" :size="17" /></span>
              <div><b>Внешний слой</b><small>Маска и одежда</small></div>
              <i />
            </button>
            <p class="tool-label section-label">Части 2-го слоя</p>
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
              <Icon name="eye" :size="15" />
              <p>
                Переключатели меняют только предпросмотр и не удаляют пиксели.
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
  grid-template-columns: 190px minmax(400px, 1fr) 196px;
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
}
.color-orb input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.color-control code {
  font-family: var(--font-num);
  font-size: 10px;
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
