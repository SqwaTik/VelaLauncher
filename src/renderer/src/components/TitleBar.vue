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
      <span class="brand-wave"
        ><img class="mark" :src="velaLogo" alt=""
      /></span>
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
  background: var(--surface-1);
  border-bottom: 1px solid var(--hairline);
}
.drag {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  gap: 9px;
  height: 100%;
  flex: 1;
  padding-left: 0;
}
.brand-wave {
  position: relative;
  width: 54px;
  height: 100%;
  display: grid;
  place-items: center;
  background: linear-gradient(
    135deg,
    rgba(154, 124, 255, 0.18),
    rgba(89, 212, 119, 0.12)
  );
  border-right: 1px solid var(--hairline);
  border-radius: 0 0 21px 0;
}
.brand-wave::after {
  content: "";
  position: absolute;
  right: -10px;
  bottom: -1px;
  width: 18px;
  height: 10px;
  border: 2px solid var(--green-line);
  border-top: 0;
  border-left: 0;
  border-radius: 0 0 18px 0;
  opacity: 0.65;
}
.mark {
  width: 27px;
  height: 27px;
  border-radius: 8px;
  display: block;
  object-fit: cover;
  background: transparent;
  box-shadow: 0 2px 10px rgba(86, 197, 104, 0.4);
  transition:
    transform 0.25s var(--ease),
    box-shadow 0.25s var(--ease);
}
.drag:hover .mark {
  transform: scale(1.1) rotate(-6deg);
  box-shadow: 0 4px 16px rgba(86, 197, 104, 0.6);
}
.name {
  margin-left: 7px;
  font-family: var(--font-display);
  font-weight: 700;
  color: var(--text-0);
  font-size: 14px;
  letter-spacing: 0.06em;
}
.ver {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 1px;
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
    background: var(--surface-3);
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
