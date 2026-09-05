<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "./Icon.vue";
import { useLauncherStore } from "@/stores/launcher";

const launcher = useLauncherStore();
const detailsOpen = ref(false);
const copied = ref(false);
const summary = computed(() => {
  const lines = (launcher.crash?.crashReport || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    lines.find((line) => /exception|error|caused by/i.test(line)) ||
    lines[0] ||
    "Код завершения не равен нулю."
  );
});

async function copyReport(): Promise<void> {
  await navigator.clipboard.writeText(
    launcher.crash?.crashReport || summary.value,
  );
  copied.value = true;
  setTimeout(() => (copied.value = false), 1400);
}
</script>

<template>
  <Teleport to="body"
    ><Transition name="crash-dialog">
      <div
        v-if="launcher.crash"
        class="crash-overlay"
        @click.self="launcher.dismissCrash()"
      >
        <section class="crash-card" role="alertdialog" aria-modal="true">
          <header>
            <span><Icon name="alert" :size="25" /></span>
            <div>
              <p class="eyebrow">VELA RECOVERY</p>
              <h2>Vela неожиданно закрылся</h2>
            </div>
            <button class="icon-button" @click="launcher.dismissCrash()">
              <Icon name="close" :size="19" />
            </button>
          </header>
          <div class="crash-summary">
            <Icon name="warning" :size="18" />
            <div>
              <b>Что произошло</b>
              <p>{{ summary }}</p>
              <small>Код: {{ launcher.crash.code ?? "неизвестен" }}</small>
            </div>
          </div>
          <button class="details-toggle" @click="detailsOpen = !detailsOpen">
            <Icon name="code" :size="16" />{{
              detailsOpen
                ? "Скрыть технический отчёт"
                : "Показать технический отчёт"
            }}<Icon
              name="chevron"
              :size="14"
              :class="{ rotated: detailsOpen }"
            />
          </button>
          <pre v-if="detailsOpen">{{
            launcher.crash.crashReport || "Отчёт Minecraft не создан."
          }}</pre>
          <footer>
            <button class="btn btn-ghost" @click="copyReport">
              <Icon :name="copied ? 'check' : 'copy'" :size="15" />{{
                copied ? "Скопировано" : "Копировать отчёт"
              }}</button
            ><button class="btn" @click="launcher.dismissCrash()">
              Закрыть</button
            >
          </footer>
        </section>
      </div>
    </Transition></Teleport
  >
</template>

<style scoped lang="scss">
.crash-overlay {
  position: fixed;
  inset: 0;
  z-index: 800;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(3, 5, 4, 0.82);
  backdrop-filter: blur(12px);
}
.crash-card {
  width: min(680px, 100%);
  max-height: calc(100vh - 40px);
  padding: 22px;
  overflow: auto;
  border-radius: 20px;
  background: var(--surface-1);
  border: 1px solid var(--hairline-strong);
  box-shadow: 0 36px 120px #000d;
}
.crash-card > header {
  display: grid;
  grid-template-columns: 46px 1fr 36px;
  align-items: start;
  gap: 12px;
}
.crash-card > header > span {
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: 13px;
  color: var(--danger);
  background: rgba(255, 93, 108, 0.12);
}
.crash-card h2 {
  margin-top: 4px;
  font-size: 22px;
}
.crash-summary {
  margin-top: 20px;
  padding: 14px;
  display: flex;
  gap: 11px;
  border-radius: 12px;
  color: var(--warn);
  background: rgba(232, 200, 116, 0.08);
  border: 1px solid rgba(232, 200, 116, 0.17);
}
.crash-summary div {
  min-width: 0;
}
.crash-summary b {
  color: var(--text-0);
  font-size: 12px;
}
.crash-summary p {
  margin-top: 6px;
  overflow: hidden;
  color: var(--text-1);
  font: 11px var(--font-num);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.crash-summary small {
  display: block;
  margin-top: 7px;
  color: var(--text-3);
  font-size: 9px;
}
.details-toggle {
  width: 100%;
  height: 40px;
  margin-top: 10px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 9px;
  color: var(--text-2);
  background: var(--surface-2);
  font-size: 10.5px;
  text-align: left;
}
.details-toggle svg:last-child {
  margin-left: auto;
}
.details-toggle .rotated {
  transform: rotate(90deg);
}
pre {
  max-height: 180px;
  margin-top: 8px;
  padding: 12px;
  overflow: auto;
  border-radius: 9px;
  color: #b8c8bc;
  background: #080b09;
  font:
    9.5px/1.45 ui-monospace,
    monospace;
  user-select: text;
  white-space: pre-wrap;
}
.crash-card footer {
  margin-top: 18px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}
.crash-dialog-enter-active,
.crash-dialog-leave-active {
  transition: opacity 0.18s;
}
.crash-dialog-enter-active .crash-card,
.crash-dialog-leave-active .crash-card {
  transition:
    transform 0.22s var(--ease),
    opacity 0.18s;
}
.crash-dialog-enter-from,
.crash-dialog-leave-to {
  opacity: 0;
}
.crash-dialog-enter-from .crash-card,
.crash-dialog-leave-to .crash-card {
  opacity: 0;
  transform: translateY(16px) scale(0.98);
}
</style>
