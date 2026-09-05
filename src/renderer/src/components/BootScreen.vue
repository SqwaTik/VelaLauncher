<script setup lang="ts">
/**
 * Boot / loading overlay shown while the app hydrates persisted state and
 * subscribes to backend events. An isometric Minecraft-style block builds
 * itself, the wordmark rises, status text cycles, and a green rail fills.
 * Fades + scales out once `ready` flips true.
 */
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { BRAND } from "@shared/constants";
import velaLogo from "@/assets/images/vela-logo.png";

const props = defineProps<{ ready: boolean }>();

const pct = ref(6);
const leaving = ref(false);
const gone = ref(false);
const statusText = ref("Инициализация…");

const steps = [
  "Инициализация…",
  "Загрузка настроек…",
  "Проверка Java…",
  "Подключение к Modrinth…",
  "Почти готово…",
];
let stepIdx = 0;
const startedAt = Date.now();
let progressTimer: ReturnType<typeof setInterval> | null = null;
let stepTimer: ReturnType<typeof setInterval> | null = null;

onMounted(() => {
  progressTimer = setInterval(() => {
    if (pct.value < 90) pct.value += Math.max(0.8, (92 - pct.value) * 0.07);
  }, 90);
  stepTimer = setInterval(() => {
    stepIdx = Math.min(stepIdx + 1, steps.length - 1);
    statusText.value = steps[stepIdx];
  }, 620);
});

onBeforeUnmount(() => {
  if (progressTimer) clearInterval(progressTimer);
  if (stepTimer) clearInterval(stepTimer);
});

watch(
  () => props.ready,
  (r) => {
    if (!r) return;
    const remaining = Math.max(0, 1350 - (Date.now() - startedAt));
    setTimeout(() => {
      if (progressTimer) clearInterval(progressTimer);
      if (stepTimer) clearInterval(stepTimer);
      pct.value = 100;
      statusText.value = "Готово";
      setTimeout(() => (leaving.value = true), 240);
      setTimeout(() => (gone.value = true), 760);
    }, remaining);
  },
);
</script>

<template>
  <Transition name="boot">
    <div v-if="!gone" class="boot" :class="{ leaving }">
      <div class="boot-inner">
        <div class="logo-stage">
          <span /><img :src="velaLogo" alt="Vela" />
        </div>

        <h1 class="wordmark">
          <span class="a">{{ BRAND.name }}</span>
          <span class="b">MASTER</span>
        </h1>
        <p class="tagline">{{ BRAND.tagline }}</p>

        <div class="rail">
          <div class="fill" :style="{ width: pct + '%' }" />
        </div>
        <p class="status">{{ statusText }}</p>
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
  background:
    radial-gradient(
      700px 460px at 50% 34%,
      rgba(86, 197, 104, 0.1),
      transparent 60%
    ),
    var(--surface-0);
  overflow: hidden;
}
.boot-inner {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.logo-stage {
  position: relative;
  width: 122px;
  height: 122px;
  margin-bottom: 26px;
  border-radius: 28px;
  padding: 2px;
  background: linear-gradient(135deg, #b445ff, #447dff, #58df89);
  box-shadow: 0 22px 70px rgba(84, 71, 255, 0.34);
  animation: logo-float 3s ease-in-out infinite;
}
.logo-stage::before {
  content: "";
  position: absolute;
  inset: -30px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    rgba(105, 69, 255, 0.26),
    transparent 68%
  );
  z-index: -1;
  animation: pulse 2.4s ease-in-out infinite;
}
.logo-stage img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
  border-radius: 26px;
}
.logo-stage span {
  position: absolute;
  inset: 8px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 21px;
  z-index: 2;
}
@keyframes logo-float {
  50% {
    transform: translateY(-8px) scale(1.025);
  }
}
@keyframes pulse {
  50% {
    transform: scale(1.18);
    opacity: 0.65;
  }
}

/* --- isometric cube --- */
.cube {
  position: relative;
  width: 108px;
  height: 116px;
  margin-bottom: 30px;
  transform-style: preserve-3d;
  animation: cube-bob 3s var(--ease-in-out) infinite;
}
.face {
  position: absolute;
  width: 54px;
  height: 54px;
  left: 27px;
  top: 28px;
  opacity: 0;
}
.top {
  background: linear-gradient(135deg, #74d886, #56c568);
  transform: rotate(45deg) skew(-15deg, -15deg) translateY(-32px) scaleY(0.58);
  animation: face-in 0.5s var(--ease) 0.1s forwards;
}
.left {
  background: linear-gradient(135deg, #3a9e4c, #2f7d3c);
  transform: skewY(20deg) translateX(-19px) translateY(6px);
  animation: face-in 0.5s var(--ease) 0.28s forwards;
}
.right {
  background: linear-gradient(135deg, #4bb85c, #3a9e4c);
  transform: skewY(-20deg) translateX(19px) translateY(6px);
  animation: face-in 0.5s var(--ease) 0.46s forwards;
}
/* faces fade in without touching their positioning transforms */
@keyframes face-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
.spark {
  position: absolute;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--green-bright);
  opacity: 0;
}
.s1 {
  left: 6px;
  top: 20px;
  animation: spark 1.8s var(--ease-in-out) 0.9s infinite;
}
.s2 {
  right: 8px;
  top: 40px;
  animation: spark 1.8s var(--ease-in-out) 1.3s infinite;
}
.s3 {
  left: 18px;
  bottom: 8px;
  animation: spark 1.8s var(--ease-in-out) 1.6s infinite;
}

.wordmark {
  display: flex;
  align-items: baseline;
  gap: 11px;
  font-family: var(--font-display);
  font-size: 40px;
  letter-spacing: 0.05em;
  opacity: 0;
  animation: rise 0.6s var(--ease) 0.5s forwards;
  .a {
    color: var(--text-0);
  }
  .b {
    background: linear-gradient(180deg, var(--green-bright), var(--green-deep));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
}
.tagline {
  color: var(--text-2);
  font-size: 13px;
  letter-spacing: 0.03em;
  opacity: 0;
  margin-top: 6px;
  animation: rise 0.6s var(--ease) 0.68s forwards;
}
.rail {
  margin-top: 30px;
  width: 240px;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  overflow: hidden;
  opacity: 0;
  animation: rise 0.6s var(--ease) 0.82s forwards;
}
.fill {
  height: 100%;
  border-radius: 999px;
  background: var(--green-grad);
  transition: width 0.3s var(--ease);
  box-shadow: 0 0 14px rgba(86, 197, 104, 0.7);
}
.status {
  margin-top: 14px;
  font-size: 12.5px;
  color: var(--text-3);
  letter-spacing: 0.02em;
  opacity: 0;
  animation: rise 0.6s var(--ease) 0.95s forwards;
}

@keyframes cube-bob {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-9px);
  }
}
@keyframes spark {
  0%,
  100% {
    opacity: 0;
    transform: translateY(0) scale(0.6);
  }
  40% {
    opacity: 1;
    transform: translateY(-10px) scale(1);
  }
}
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.boot-enter-active,
.boot-leave-active {
  transition: opacity 0.5s var(--ease);
}
.boot.leaving {
  opacity: 0;
  transform: scale(1.05);
  transition:
    opacity 0.5s var(--ease),
    transform 0.5s var(--ease);
}
.boot-leave-to {
  opacity: 0;
}
</style>
