<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

const props = defineProps<{ ready: boolean }>();
const pct = ref(8);
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
let step = 0;
let progressTimer: ReturnType<typeof setInterval> | null = null;
let textTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  progressTimer = setInterval(() => {
    if (pct.value < 91) pct.value += Math.max(0.7, (93 - pct.value) * 0.08);
  }, 85);
  textTimer = setInterval(() => {
    step = Math.min(step + 1, steps.length - 1);
    statusText.value = steps[step];
  }, 620);
});

onBeforeUnmount(() => {
  if (progressTimer) clearInterval(progressTimer);
  if (textTimer) clearInterval(textTimer);
});

watch(
  () => props.ready,
  (ready) => {
    if (!ready) return;
    const remaining = Math.max(0, 2600 - (Date.now() - startedAt));
    setTimeout(() => {
      if (progressTimer) clearInterval(progressTimer);
      if (textTimer) clearInterval(textTimer);
      pct.value = 100;
      statusText.value = "Готово";
      setTimeout(() => (leaving.value = true), 180);
      setTimeout(() => (gone.value = true), 650);
    }, remaining);
  },
);
</script>

<template>
  <Transition name="boot">
    <div v-if="!gone" class="boot" :class="{ leaving }">
      <div class="boot-inner">
        <div class="kinetic-loader" aria-hidden="true">
          <i class="ring ring-outer" />
          <i class="ring ring-middle" />
          <i class="ring ring-inner" />
          <span class="loader-core"><b /></span>
          <em class="node node-a" />
          <em class="node node-b" />
          <em class="node node-c" />
        </div>
        <p class="status">{{ statusText }}</p>
        <div class="rail">
          <i :style="{ width: `${pct}%` }" />
        </div>
        <small>{{ Math.round(pct) }}%</small>
      </div>
    </div>
  </Transition>
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
    radial-gradient(
      circle at 50% 46%,
      rgba(75, 155, 100, 0.1),
      transparent 28%
    ),
    linear-gradient(145deg, #0b0c15, #070811);
}
.boot::before {
  content: "";
  position: absolute;
  width: 460px;
  height: 460px;
  border: 1px solid rgba(126, 180, 140, 0.035);
  transform: rotate(45deg);
  animation: ambient 13s linear infinite;
}
.boot-inner {
  position: relative;
  width: 280px;
  display: flex;
  align-items: center;
  flex-direction: column;
}
.kinetic-loader {
  position: relative;
  width: 124px;
  height: 124px;
  display: grid;
  place-items: center;
  filter: drop-shadow(0 12px 28px rgba(0, 0, 0, 0.44));
}
.ring {
  position: absolute;
  border: 1px solid transparent;
  border-radius: 50%;
  will-change: transform;
}
.ring-outer {
  inset: 5px;
  border-top-color: rgba(113, 206, 132, 0.72);
  border-right-color: rgba(113, 206, 132, 0.15);
  border-bottom-color: rgba(113, 206, 132, 0.42);
  animation: spin-loader 2.8s cubic-bezier(0.54, 0.05, 0.3, 0.94) infinite;
}
.ring-middle {
  inset: 18px;
  border-top-color: rgba(224, 235, 228, 0.16);
  border-left-color: rgba(224, 235, 228, 0.52);
  animation: spin-loader-reverse 2s cubic-bezier(0.54, 0.05, 0.3, 0.94) infinite;
}
.ring-inner {
  inset: 32px;
  border-right-color: rgba(91, 189, 114, 0.72);
  border-bottom-color: rgba(91, 189, 114, 0.18);
  animation: spin-loader 1.35s linear infinite;
}
.loader-core {
  position: relative;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(142, 214, 157, 0.58);
  border-radius: 7px;
  transform: rotate(45deg);
  background: rgba(76, 151, 92, 0.1);
  box-shadow:
    inset 0 0 13px rgba(96, 201, 119, 0.08),
    0 0 26px rgba(76, 173, 99, 0.13);
  animation: core-pulse 1.7s ease-in-out infinite;
}
.loader-core b {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  background: #9288ff;
  box-shadow: 0 0 13px rgba(103, 207, 126, 0.78);
}
.node {
  position: absolute;
  width: 5px;
  height: 5px;
  border: 1px solid rgba(144, 218, 160, 0.72);
  border-radius: 50%;
  background: #0c0e18;
}
.node-a {
  top: 3px;
  left: 59px;
}
.node-b {
  right: 16px;
  bottom: 24px;
}
.node-c {
  left: 24px;
  bottom: 15px;
}
.status {
  min-height: 20px;
  margin-top: 24px;
  color: var(--text-1);
  font-size: 11.5px;
  letter-spacing: 0.02em;
}
.rail {
  width: 220px;
  height: 3px;
  margin-top: 11px;
  overflow: hidden;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
}
.rail i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #6255ea, #43c7f4);
  box-shadow: 0 0 12px rgba(118, 104, 255, 0.55);
  transition: width 0.22s ease-out;
}
.boot-inner small {
  margin-top: 8px;
  color: var(--text-3);
  font: 8px var(--font-num);
}
@keyframes spin-loader {
  to {
    transform: rotate(360deg);
  }
}
@keyframes spin-loader-reverse {
  to {
    transform: rotate(-360deg);
  }
}
@keyframes core-pulse {
  50% {
    transform: rotate(135deg) scale(0.86);
    opacity: 0.72;
  }
}
@keyframes ambient {
  to {
    transform: rotate(405deg);
  }
}
.boot.leaving {
  opacity: 0;
  transform: scale(1.025);
  transition:
    opacity 0.34s ease,
    transform 0.34s ease;
}
.boot-enter-active,
.boot-leave-active {
  transition: opacity 0.3s ease;
}
.boot-leave-to {
  opacity: 0;
}
</style>
