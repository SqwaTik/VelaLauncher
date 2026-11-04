<script setup lang="ts">
import fabric from "@/assets/images/fabric-official.png";
import type { LoaderId } from "@shared/targets";

defineProps<{ loader: LoaderId }>();
</script>

<template>
  <img
    v-if="loader === 'fabric'"
    class="loader-logo"
    :src="fabric"
    alt=""
    aria-hidden="true"
  />
  <svg v-else class="loader-logo" viewBox="0 0 24 24" aria-hidden="true">
    <defs>
      <linearGradient id="vela-neoforge-face" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#ffb36b" />
        <stop offset="1" stop-color="#e2672a" />
      </linearGradient>
    </defs>
    <!-- Anvil: horn on the left, waist, then the foot. -->
    <path
      fill="url(#vela-neoforge-face)"
      d="M2.5 6.2h14.2l4.8 2.1v2.1h-5.6v2.3c0 1.6 1.2 2.9 2.8 3.1v1.9H6.1v-1.9c1.6-.2 2.8-1.5 2.8-3.1v-1.6C5.3 10.6 2.9 8.9 2.5 6.2z"
    />
    <path fill="#b9501d" d="M4.6 18.9h14.6V21H4.6z" />
  </svg>
</template>

<style scoped>
.loader-logo {
  display: block;
  width: 1em;
  height: 1em;
  object-fit: contain;
  image-rendering: pixelated;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}
</style>
