<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { SkinViewer } from "skinview3d";
import { MOUSE, Raycaster, Vector2 } from "three";
import type { Object3D } from "three";
import type { SkinModel } from "@shared/types";

const props = withDefaults(
  defineProps<{
    skin?: string | null;
    model?: SkinModel;
    autoRotate?: boolean;
    innerLayer?: boolean;
    outerLayer?: boolean;
    headOuter?: boolean;
    bodyOuter?: boolean;
    armsOuter?: boolean;
    legsOuter?: boolean;
    editable?: boolean;
    editLayer?: "inner" | "outer";
  }>(),
  {
    skin: null,
    model: "classic",
    autoRotate: true,
    innerLayer: true,
    outerLayer: true,
    headOuter: true,
    bodyOuter: true,
    armsOuter: true,
    legsOuter: true,
    editable: false,
    editLayer: "inner",
  },
);
const emit = defineEmits<{
  paint: [payload: { x: number; y: number; phase: "begin" | "move" | "end" }];
}>();

const host = ref<HTMLDivElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const loading = ref(true);
let viewer: SkinViewer | null = null;
let resizeObserver: ResizeObserver | null = null;
let loadNonce = 0;
let disposed = false;
let modelDrawing = false;
const raycaster = new Raycaster();
const pointer = new Vector2();

function layerOf(object: Object3D): "inner" | "outer" | null {
  let current: Object3D | null = object;
  while (current && current !== viewer?.playerObject.skin) {
    if (current.name === "inner" || current.name === "outer") {
      return current.name;
    }
    current = current.parent;
  }
  return null;
}

function isVisible(object: Object3D): boolean {
  let current: Object3D | null = object;
  while (current) {
    if (!current.visible) return false;
    if (current === viewer?.playerObject.skin) break;
    current = current.parent;
  }
  return true;
}

function texturePoint(event: PointerEvent): { x: number; y: number } | null {
  if (!viewer || !canvas.value) return null;
  const rect = canvas.value.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, viewer.camera);
  const hit = raycaster
    .intersectObject(viewer.playerObject.skin, true)
    .find(
      (entry) =>
        entry.uv &&
        isVisible(entry.object) &&
        layerOf(entry.object) === props.editLayer,
    );
  if (!hit?.uv) return null;
  return {
    x: Math.max(0, Math.min(63, Math.floor(hit.uv.x * 64))),
    y: Math.max(0, Math.min(63, Math.floor((1 - hit.uv.y) * 64))),
  };
}
function beginPaint(event: PointerEvent): void {
  if (!props.editable || event.button !== 0) return;
  event.preventDefault();
  event.stopPropagation();
  const point = texturePoint(event);
  if (!point) return;
  modelDrawing = true;
  canvas.value?.setPointerCapture(event.pointerId);
  emit("paint", { ...point, phase: "begin" });
}
function movePaint(event: PointerEvent): void {
  if (!props.editable || !modelDrawing) return;
  event.preventDefault();
  event.stopPropagation();
  const point = texturePoint(event);
  if (point) emit("paint", { ...point, phase: "move" });
}
function endPaint(event: PointerEvent): void {
  if (!modelDrawing) return;
  event.preventDefault();
  event.stopPropagation();
  modelDrawing = false;
  const point = texturePoint(event) ?? { x: 0, y: 0 };
  emit("paint", { ...point, phase: "end" });
}

function resize(): void {
  if (!host.value || !viewer) return;
  viewer.setSize(
    Math.max(1, host.value.clientWidth),
    Math.max(1, host.value.clientHeight),
  );
}
function applyLayers(): void {
  if (!viewer) return;
  const skin = viewer.playerObject.skin;
  skin.setInnerLayerVisible(props.innerLayer);
  skin.setOuterLayerVisible(props.outerLayer);
  skin.head.outerLayer.visible = props.outerLayer && props.headOuter;
  skin.body.outerLayer.visible = props.outerLayer && props.bodyOuter;
  skin.leftArm.outerLayer.visible = props.outerLayer && props.armsOuter;
  skin.rightArm.outerLayer.visible = props.outerLayer && props.armsOuter;
  skin.leftLeg.outerLayer.visible = props.outerLayer && props.legsOuter;
  skin.rightLeg.outerLayer.visible = props.outerLayer && props.legsOuter;
}
async function loadSkin(source: string | null | undefined): Promise<void> {
  if (!viewer) return;
  const nonce = ++loadNonce;
  try {
    await viewer.loadSkin(source || "https://minotar.net/skin/Steve", {
      model: props.model === "slim" ? "slim" : "default",
    });
  } catch {
    if (nonce === loadNonce)
      await viewer
        .loadSkin("https://minotar.net/skin/Steve", { model: "default" })
        .catch(() => undefined);
  }
  if (nonce === loadNonce) applyLayers();
}

onMounted(async () => {
  // Let the route/modal paint its shell before WebGL and the dynamic module
  // are initialized. This removes the blank frame on slower GPUs.
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
  const { IdleAnimation, SkinViewer: Viewer } = await import("skinview3d");
  if (disposed) return;
  if (!canvas.value || !host.value) return;
  viewer = new Viewer({
    canvas: canvas.value,
    width: host.value.clientWidth,
    height: host.value.clientHeight,
  });
  viewer.background = null;
  viewer.autoRotate = props.autoRotate;
  viewer.autoRotateSpeed = 0.55;
  viewer.zoom = 0.84;
  viewer.controls.enablePan = false;
  viewer.controls.enableRotate = true;
  viewer.controls.enableZoom = true;
  viewer.controls.mouseButtons.RIGHT = MOUSE.ROTATE;
  const idle = new IdleAnimation();
  idle.speed = 0.7;
  viewer.animation = idle;
  resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host.value);
  await loadSkin(props.skin);
  loading.value = false;
});
onBeforeUnmount(() => {
  disposed = true;
  resizeObserver?.disconnect();
  viewer?.dispose();
  viewer = null;
});

watch(
  () => props.skin,
  (value) => void loadSkin(value),
);
watch(
  () => props.model,
  () => void loadSkin(props.skin),
);
watch(
  () => props.autoRotate,
  (value) => {
    if (viewer) viewer.autoRotate = value;
  },
);
watch(
  () => [
    props.innerLayer,
    props.outerLayer,
    props.headOuter,
    props.bodyOuter,
    props.armsOuter,
    props.legsOuter,
  ],
  applyLayers,
);
</script>

<template>
  <div ref="host" class="skin-preview-3d" :class="{ editable }">
    <canvas
      ref="canvas"
      @pointerdown.capture="beginPaint"
      @pointermove.capture="movePaint"
      @pointerup.capture="endPaint"
      @pointercancel.capture="endPaint"
      @contextmenu.prevent
    /><Transition name="model-loading"
      ><div v-if="loading" class="model-loading">
        <span><i /><i /><i /></span></div></Transition
    ><slot />
  </div>
</template>

<style scoped>
.skin-preview-3d {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
.skin-preview-3d canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
  touch-action: none;
}
.skin-preview-3d.editable canvas {
  cursor: crosshair;
}
.skin-preview-3d canvas:active {
  cursor: grabbing;
}
.skin-preview-3d.editable canvas:active {
  cursor: crosshair;
}
.model-loading {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  background: radial-gradient(
    circle,
    rgba(83, 195, 106, 0.12),
    transparent 60%
  );
}
.model-loading > span {
  display: flex;
  gap: 5px;
}
.model-loading i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--green);
  animation: model-dot 0.7s ease-in-out infinite alternate;
}
.model-loading i:nth-child(2) {
  animation-delay: 0.12s;
}
.model-loading i:nth-child(3) {
  animation-delay: 0.24s;
}
.model-loading-enter-active,
.model-loading-leave-active {
  transition: opacity 0.22s;
}
.model-loading-enter-from,
.model-loading-leave-to {
  opacity: 0;
}
@keyframes model-dot {
  to {
    opacity: 0.25;
    transform: translateY(-5px);
  }
}
</style>
