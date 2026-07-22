<template>
  <span class="ms-logo" aria-hidden="true">
    <i class="red" />
    <i class="green" />
    <i class="blue" />
    <i class="yellow" />
  </span>
</template>

<style scoped>
.ms-logo {
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 2px;
  width: 18px;
  height: 18px;
  flex: none;
}
.ms-logo i {
  display: block;
}
.red {
  background: #f25022;
}
.green {
  background: #7fba00;
}
.blue {
  background: #00a4ef;
}
.yellow {
  background: #ffb900;
}
</style>
