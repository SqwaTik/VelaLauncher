<script setup lang="ts">
defineProps<{ value: number; indeterminate?: boolean }>();
</script>

<template>
  <div class="ui-progress" :class="{ indet: indeterminate }">
    <div class="track">
      <div
        class="fill"
        :style="
          !indeterminate
            ? { width: `${Math.min(100, Math.max(0, value))}%` }
            : undefined
        "
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
.ui-progress .track {
  height: 6px;
  border-radius: 999px;
  background: var(--ink-4);
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 999px;
  background: var(--regal);
  box-shadow: 0 0 12px rgba(157, 92, 255, 0.5);
  transition: width 0.3s var(--ease);
}
.indet .fill {
  width: 34%;
  animation: slide 1.2s var(--ease-in-out) infinite;
}
@keyframes slide {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(330%);
  }
}
</style>
