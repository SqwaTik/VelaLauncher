<script setup lang="ts" generic="T extends string">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import Icon from "@/components/Icon.vue";

/** Themed replacement for the native select, whose popup ignores the launcher styles. */
const props = defineProps<{
  options: readonly { value: T; label: string }[];
  ariaLabel?: string;
}>();
const model = defineModel<T>({ required: true });

const open = ref(false);
const highlighted = ref(0);
const root = ref<HTMLElement | null>(null);
const list = ref<HTMLElement | null>(null);
const current = computed(() => props.options.find((option) => option.value === model.value));

function onOutside(event: PointerEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) close();
}

async function show(): Promise<void> {
  if (open.value) return;
  open.value = true;
  highlighted.value = Math.max(0, props.options.findIndex((option) => option.value === model.value));
  document.addEventListener("pointerdown", onOutside, true);
  await nextTick();
  list.value?.focus();
}

function close(): void {
  open.value = false;
  document.removeEventListener("pointerdown", onOutside, true);
}

function pick(value: T): void {
  model.value = value;
  close();
}

function onKey(event: KeyboardEvent): void {
  if (!open.value) {
    if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      void show();
    }
    return;
  }
  const count = props.options.length;
  if (event.key === "ArrowDown") highlighted.value = (highlighted.value + 1) % count;
  else if (event.key === "ArrowUp") highlighted.value = (highlighted.value - 1 + count) % count;
  else if (event.key === "Enter" || event.key === " ") pick(props.options[highlighted.value].value);
  else if (event.key === "Escape" || event.key === "Tab") close();
  else return;
  event.preventDefault();
}

onBeforeUnmount(close);
</script>

<template>
  <div ref="root" class="ui-select" :class="{ open }" @keydown="onKey">
    <button
      type="button"
      class="ui-select-trigger"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-label="ariaLabel"
      @click="open ? close() : show()"
    >
      <span>{{ current?.label ?? "" }}</span>
      <Icon name="chevron" :size="14" />
    </button>
    <Transition name="ui-select-pop">
      <ul v-if="open" ref="list" class="ui-select-list" role="listbox" tabindex="-1">
        <li
          v-for="(option, index) in options"
          :key="option.value"
          role="option"
          :aria-selected="option.value === model"
          :class="{ selected: option.value === model, highlighted: index === highlighted }"
          @pointerenter="highlighted = index"
          @click="pick(option.value)"
        >
          <span>{{ option.label }}</span>
          <Icon v-if="option.value === model" name="check" :size="12" />
        </li>
      </ul>
    </Transition>
  </div>
</template>

<style scoped>
.ui-select {
  position: relative;
  width: 100%;
}
.ui-select-trigger {
  width: 100%;
  height: 34px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 9px;
  color: var(--text-1);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  font-size: 10px;
  text-align: left;
  transition:
    background 0.15s,
    border-color 0.15s;
}
.ui-select-trigger:hover,
.ui-select.open .ui-select-trigger {
  background: var(--surface-3);
  border-color: var(--green-line);
}
.ui-select-trigger :deep(svg) {
  color: var(--text-3);
  transform: rotate(90deg);
  transition: transform 0.2s var(--ease);
}
.ui-select.open .ui-select-trigger :deep(svg) {
  transform: rotate(-90deg);
}
.ui-select-list {
  position: absolute;
  z-index: 40;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  margin: 0;
  padding: 5px;
  list-style: none;
  border-radius: 11px;
  background: linear-gradient(180deg, var(--surface-3), var(--surface-2));
  border: 1px solid var(--hairline-strong);
  box-shadow:
    0 18px 40px rgba(0, 0, 0, 0.45),
    0 0 0 1px rgba(117, 108, 255, 0.06);
  outline: none;
}
.ui-select-list li {
  height: 30px;
  padding: 0 9px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 7px;
  color: var(--text-2);
  font-size: 10px;
  cursor: pointer;
}
.ui-select-list li.highlighted {
  color: var(--text-0);
  background: rgba(255, 255, 255, 0.05);
}
.ui-select-list li.selected {
  color: var(--text-0);
  background: var(--green-soft);
}
.ui-select-list li :deep(svg) {
  color: var(--green-bright);
}
.ui-select-pop-enter-active,
.ui-select-pop-leave-active {
  transition:
    opacity 0.14s,
    transform 0.16s var(--ease);
}
.ui-select-pop-enter-from,
.ui-select-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
