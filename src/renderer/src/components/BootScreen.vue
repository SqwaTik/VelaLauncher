<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import logo from "@/assets/images/vela-logo.png";

const props = defineProps<{ ready: boolean }>();
const pct = ref(6);
const leaving = ref(false);
const gone = ref(false);
const statusText = ref("Запускаем интерфейс…");
const steps = [
  "Запускаем интерфейс…",
  "Читаем настройки…",
  "Проверяем игровые службы…",
  "Готовим Vela…",
];
const startedAt = Date.now();
/** Long enough for the logo to settle without flashing; it no longer holds a ready launcher back. */
const MIN_VISIBLE_MS = 700;
let step = 0;
let progressTimer: ReturnType<typeof setInterval> | null = null;
let textTimer: ReturnType<typeof setInterval> | null = null;

function stopTimers(): void {
  if (progressTimer) clearInterval(progressTimer);
  if (textTimer) clearInterval(textTimer);
  progressTimer = textTimer = null;
}

onMounted(() => {
  progressTimer = setInterval(() => {
    if (pct.value < 90) pct.value += Math.max(0.6, (92 - pct.value) * 0.09);
  }, 80);
  textTimer = setInterval(() => {
    step = Math.min(step + 1, steps.length - 1);
    statusText.value = steps[step];
  }, 560);
});

onBeforeUnmount(stopTimers);

watch(
  () => props.ready,
  (ready) => {
    if (!ready) return;
    const remaining = Math.max(0, MIN_VISIBLE_MS - (Date.now() - startedAt));
    setTimeout(() => {
      stopTimers();
      pct.value = 100;
      statusText.value = "Готово";
      setTimeout(() => (leaving.value = true), 220);
      setTimeout(() => (gone.value = true), 640);
    }, remaining);
  },
  { immediate: true },
);
</script>

<template>
  <div v-if="!gone" class="boot" :class="{ leaving }" role="status" aria-live="polite">
    <div class="boot-inner">
      <div class="mark" aria-hidden="true">
        <i class="halo" />
        <i class="orbit" />
        <img :src="logo" alt="" draggable="false" />
      </div>
      <h1>Vela</h1>
      <p class="status">{{ statusText }}</p>
      <div class="rail">
        <i :style="{ width: `${pct}%` }" />
      </div>
      <small>{{ Math.round(pct) }}%</small>
    </div>
  </div>
</template>

<style scoped lang="scss">
.boot {
  position: fixed;
  inset: 0;
  z-index: 999;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    radial-gradient(circle at 50% 42%, rgba(117, 108, 255, 0.16), transparent 34%),
    radial-gradient(circle at 62% 58%, rgba(92, 203, 255, 0.06), transparent 30%),
    var(--surface-0);
  transition:
    opacity 0.38s var(--ease),
    transform 0.38s var(--ease);
}
.boot.leaving {
  opacity: 0;
  transform: scale(1.02);
  pointer-events: none;
}
.boot-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 260px;
  animation: rise 0.55s var(--ease) both;
}
.mark {
  position: relative;
  width: 104px;
  height: 104px;
  display: grid;
  place-items: center;
}
.mark img {
  position: relative;
  width: 58px;
  height: 58px;
  object-fit: contain;
  filter: drop-shadow(0 8px 22px rgba(117, 108, 255, 0.45));
  animation: breathe 2.4s var(--ease-in-out) infinite;
  user-select: none;
}
.halo {
  position: absolute;
  inset: 10px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--green-soft), transparent 70%);
  animation: breathe 2.4s var(--ease-in-out) infinite;
}
/* One accent arc that fades from violet to cyan, like the progress rail. */
.orbit {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: conic-gradient(from 0deg, transparent 0 62%, #6255ea 78%, #5ccbff 96%, transparent 100%);
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 2px), #000 calc(100% - 2px));
  animation: spin 1.5s linear infinite;
}
h1 {
  margin: 18px 0 0;
  color: var(--text-0);
  font: 600 19px var(--font-display);
  letter-spacing: 0.04em;
}
.status {
  min-height: 18px;
  margin: 6px 0 0;
  color: var(--text-2);
  font-size: 11.5px;
  letter-spacing: 0.02em;
}
.rail {
  width: 200px;
  height: 3px;
  margin-top: 16px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--hairline);
}
.rail i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--green-grad);
  box-shadow: 0 0 12px rgba(117, 108, 255, 0.55);
  transition: width 0.22s ease-out;
}
small {
  margin-top: 8px;
  color: var(--text-3);
  font: 9px var(--font-num);
  font-variant-numeric: tabular-nums;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes breathe {
  50% {
    transform: scale(0.95);
    opacity: 0.85;
  }
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
@media (prefers-reduced-motion: reduce) {
  .orbit,
  .halo,
  .mark img,
  .boot-inner {
    animation: none;
  }
}
</style>
