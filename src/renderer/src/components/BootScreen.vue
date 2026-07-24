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
  "Готовим Royale…",
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
  }, 430);
});

onBeforeUnmount(() => {
  if (progressTimer) clearInterval(progressTimer);
  if (textTimer) clearInterval(textTimer);
});

watch(
  () => props.ready,
  (ready) => {
    if (!ready) return;
    const remaining = Math.max(0, 900 - (Date.now() - startedAt));
    setTimeout(() => {
      if (progressTimer) clearInterval(progressTimer);
      if (textTimer) clearInterval(textTimer);
      pct.value = 100;
      statusText.value = "Готово";
      setTimeout(() => (leaving.value = true), 120);
      setTimeout(() => (gone.value = true), 500);
    }, remaining);
  },
);
</script>

<template>
  <Transition name="boot">
    <div v-if="!gone" class="boot" :class="{ leaving }">
      <div class="boot-inner">
        <div class="gyro" aria-hidden="true">
          <i class="orbit orbit-a" /><i class="orbit orbit-b" /><i
            class="orbit orbit-c"
          /><span><b /></span>
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
      circle at 50% 44%,
      rgba(62, 158, 91, 0.11),
      transparent 31%
    ),
    #080c09;
}
.boot::before {
  content: "";
  position: absolute;
  width: 520px;
  height: 520px;
  border: 1px solid rgba(86, 197, 104, 0.035);
  transform: rotate(45deg);
  animation: ambient 9s linear infinite;
}
.boot-inner {
  position: relative;
  width: 280px;
  display: flex;
  align-items: center;
  flex-direction: column;
}
.gyro {
  position: relative;
  width: 118px;
  height: 118px;
  display: grid;
  place-items: center;
  perspective: 380px;
}
.orbit {
  position: absolute;
  inset: 13px;
  border: 1px solid rgba(101, 214, 127, 0.55);
  border-radius: 50%;
  box-shadow:
    inset 0 0 18px rgba(83, 195, 106, 0.08),
    0 0 16px rgba(83, 195, 106, 0.08);
}
.orbit::after {
  content: "";
  position: absolute;
  top: -3px;
  left: 50%;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #77dc8c;
  box-shadow: 0 0 13px #56c568;
}
.orbit-a {
  animation: orbit-a 1.8s linear infinite;
}
.orbit-b {
  animation: orbit-b 2.2s linear infinite reverse;
}
.orbit-c {
  inset: 25px;
  animation: orbit-c 1.45s linear infinite;
}
.gyro > span {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(118, 229, 143, 0.65);
  transform: rotate(45deg);
  background: rgba(83, 195, 106, 0.08);
  box-shadow: 0 0 30px rgba(83, 195, 106, 0.18);
  animation: core 1.6s ease-in-out infinite;
}
.gyro > span b {
  width: 10px;
  height: 10px;
  background: #73d889;
  box-shadow: 0 0 18px #56c568;
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
  background: linear-gradient(90deg, #338b4a, #6ad081);
  box-shadow: 0 0 12px rgba(86, 197, 104, 0.55);
  transition: width 0.22s ease-out;
}
.boot-inner small {
  margin-top: 8px;
  color: var(--text-3);
  font: 8px var(--font-num);
}
@keyframes orbit-a {
  to {
    transform: rotate(360deg) rotateX(58deg);
  }
}
@keyframes orbit-b {
  to {
    transform: rotate(360deg) rotateY(63deg);
  }
}
@keyframes orbit-c {
  to {
    transform: rotate(-360deg) rotateX(72deg) rotateY(18deg);
  }
}
@keyframes core {
  50% {
    transform: rotate(135deg) scale(0.82);
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
