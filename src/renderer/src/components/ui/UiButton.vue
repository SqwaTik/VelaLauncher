<script setup lang="ts">
import Icon from "../Icon.vue";

withDefaults(
  defineProps<{
    variant?: "primary" | "default" | "ghost" | "gilt";
    size?: "sm" | "md";
    icon?: string;
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
  }>(),
  { variant: "default", size: "md" },
);
</script>

<template>
  <button
    class="ui-btn"
    :class="[`v-${variant}`, `s-${size}`, { block, loading }]"
    :disabled="disabled || loading"
  >
    <Icon
      v-if="loading"
      name="spinner"
      :size="size === 'sm' ? 15 : 17"
      class="spin"
    />
    <Icon v-else-if="icon" :name="icon" :size="size === 'sm' ? 15 : 17" />
    <span class="lbl"><slot /></span>
  </button>
</template>

<style scoped lang="scss">
.ui-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 42px;
  padding: 0 20px;
  border-radius: var(--r-sm);
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 14px;
  letter-spacing: 0.02em;
  color: var(--text-0);
  background: var(--panel);
  border: 1px solid var(--hairline);
  transition:
    background 0.18s var(--ease),
    border-color 0.18s var(--ease),
    transform 0.1s var(--ease),
    box-shadow 0.2s var(--ease),
    filter 0.18s var(--ease);
  white-space: nowrap;

  &:hover:not(:disabled) {
    background: var(--panel-hover);
    border-color: var(--hairline-strong);
  }
  &:active:not(:disabled) {
    transform: translateY(1px);
  }
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  &.block {
    width: 100%;
  }
  &.s-sm {
    height: 34px;
    padding: 0 14px;
    font-size: 13px;
  }
}

.v-primary {
  background: var(--regal);
  border-color: transparent;
  color: #fff;
  box-shadow: var(--glow-amethyst);
  &:hover:not(:disabled) {
    filter: brightness(1.08);
    border-color: transparent;
  }
}
.v-gilt {
  background: linear-gradient(135deg, #b8912b, #d4af37 55%, #ecc963);
  border-color: transparent;
  color: #2a1e00;
  &:hover:not(:disabled) {
    filter: brightness(1.06);
    border-color: transparent;
  }
}
.v-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-1);
  &:hover:not(:disabled) {
    background: var(--panel-hover);
    color: var(--text-0);
  }
}

.spin {
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
