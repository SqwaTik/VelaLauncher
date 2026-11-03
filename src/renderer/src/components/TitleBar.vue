<script setup lang="ts">
import { onMounted, ref } from "vue";
import { BRAND } from "@shared/constants";
import velaLogo from "@/assets/images/vela-logo.png";

const version = ref("0.1.0");
onMounted(async () => {
  try {
    version.value = await window.royale.app.getVersion();
  } catch {
    /* outside electron */
  }
});
const min = () => window.royale?.window.minimize();
const max = () => window.royale?.window.maximize();
const close = () => window.royale?.window.close();
</script>

<template>
  <div class="titlebar">
    <div class="drag">
      <img class="mark" :src="velaLogo" alt="" draggable="false" />
      <span class="name">{{ BRAND.name }}</span>
      <span class="ver">v{{ version }}</span>
    </div>
    <div class="controls">
      <button class="ctl" aria-label="Свернуть" title="Свернуть" @click="min">
        <svg width="12" height="2" viewBox="0 0 12 2">
          <rect width="12" height="2" rx="1" fill="currentColor" />
        </svg>
      </button>
      <button
        class="ctl"
        aria-label="Развернуть"
        title="Развернуть"
        @click="max"
      >
        <svg width="11" height="11" viewBox="0 0 11 11">
          <rect
            x="0.5"
            y="0.5"
            width="10"
            height="10"
            rx="1.5"
            stroke="currentColor"
            stroke-width="1.4"
            fill="none"
          />
        </svg>
      </button>
      <button
        class="ctl close"
        aria-label="Закрыть"
        title="Закрыть"
        @click="close"
      >
        <svg width="12" height="12" viewBox="0 0 12 12">
          <line
            x1="1"
            y1="1"
            x2="11"
            y2="11"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
          <line
            x1="11"
            y1="1"
            x2="1"
            y2="11"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.titlebar {
  height: var(--titlebar-h);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: none;
  z-index: 50;
  background: transparent;
}
.drag {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 100%;
  flex: 1;
  padding-left: 22px;
}
.mark {
  width: 26px;
  height: 26px;
  display: block;
  object-fit: contain;
  filter: drop-shadow(0 2px 8px rgba(117, 108, 255, 0.35));
}
.name {
  margin-left: 4px;
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--text-0);
  font-size: 13.5px;
  letter-spacing: 0.04em;
}
.ver {
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  color: var(--text-2);
  background: rgba(255, 255, 255, 0.05);
}
.controls {
  display: flex;
  -webkit-app-region: no-drag;
  height: 100%;
}
.ctl {
  width: 46px;
  height: 100%;
  display: grid;
  place-items: center;
  color: var(--text-2);
  transition:
    background 0.14s,
    color 0.14s;
  svg {
    transition: transform 0.14s var(--ease);
  }
  &:hover {
    background: rgba(255, 255, 255, 0.07);
    color: var(--text-0);
  }
  &:hover svg {
    transform: scale(1.15);
  }
  &:active svg {
    transform: scale(0.88);
  }
}
.close:hover {
  background: var(--danger);
  color: #fff;
}
</style>
