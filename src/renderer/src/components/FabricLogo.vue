<script setup lang="ts">
import logo from "@/assets/images/fabric-official.png";
</script>

<template>
  <img class="fabric-logo" :src="logo" alt="" aria-hidden="true" />
</template>

<style scoped>
.fabric-logo {
  display: block;
  width: 1em;
  height: 1em;
  object-fit: contain;
  image-rendering: pixelated;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
}
</style>
