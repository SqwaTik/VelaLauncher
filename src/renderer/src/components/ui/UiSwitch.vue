<script setup lang="ts">
import Icon from "@/components/Icon.vue";
const model = defineModel<boolean>({ default: false });
defineProps<{ disabled?: boolean }>();
</script>

<template>
  <button
    type="button"
    class="ui-switch"
    :class="{ on: model }"
    :disabled="disabled"
    role="switch"
    :aria-checked="model"
    @click.stop="model = !model"
  >
    <span class="track-mark off-mark"
      ><Icon name="close" :size="11" :stroke="2.5"
    /></span>
    <span class="track-mark on-mark"
      ><Icon name="check" :size="12" :stroke="2.6"
    /></span>
    <span class="knob" />
  </button>
</template>

<style scoped lang="scss">
.ui-switch {
  width: 50px;
  height: 28px;
  border-radius: 999px;
  background: var(--ink-4);
  border: 1px solid var(--hairline-strong);
  position: relative;
  transition:
    background 0.16s var(--ease-standard),
    border-color 0.16s var(--ease-standard),
    box-shadow 0.16s;
  flex: none;

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
  &.on {
    background: var(--green-deep);
    border-color: var(--green-line);
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);
  }
  &:hover:not(:disabled) {
    border-color: var(--text-3);
  }
  &:active:not(:disabled) {
    transform: none;
  }
}
.track-mark {
  position: absolute;
  top: 50%;
  z-index: 0;
  display: grid;
  place-items: center;
  color: rgba(255, 255, 255, 0.5);
  transform: translateY(-50%);
  transition: opacity 0.14s;
}
.off-mark {
  right: 6px;
}
.on-mark {
  left: 6px;
  opacity: 0;
}
.on .off-mark {
  opacity: 0;
}
.on .on-mark {
  opacity: 1;
  color: #fff;
}
.knob {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #f5f4ff;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.4);
  transition:
    transform 0.17s cubic-bezier(0.2, 0.9, 0.35, 1.15),
    background 0.14s;
}
.on .knob {
  transform: translateX(22px);
  background: #fff;
}
</style>
