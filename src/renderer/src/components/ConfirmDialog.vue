<script setup lang="ts">
import { ref } from "vue";
import Icon from "./Icon.vue";

withDefaults(
  defineProps<{
    title: string;
    message: string;
    confirmLabel?: string;
    icon?: string;
  }>(),
  { confirmLabel: "Удалить", icon: "trash" },
);
const emit = defineEmits<{ confirm: [dontAskAgain: boolean]; cancel: [] }>();
const dontAsk = ref(false);
</script>

<template>
  <Teleport to="body"
    ><div class="confirm-overlay" @click.self="emit('cancel')">
      <section class="confirm-dialog" role="alertdialog" aria-modal="true">
        <span class="danger-icon"><Icon :name="icon" :size="23" /></span>
        <h2>{{ title }}</h2>
        <p>{{ message }}</p>
        <label
          ><button
            class="checkbox"
            :class="{ checked: dontAsk }"
            @click="dontAsk = !dontAsk"
          >
            <Icon v-if="dontAsk" name="check" :size="14" /></button
          ><span>Больше не спрашивать для этого действия</span></label
        >
        <footer>
          <button class="btn btn-ghost" @click="emit('cancel')">Отмена</button
          ><button class="btn confirm" @click="emit('confirm', dontAsk)">
            <Icon :name="icon" :size="16" />{{ confirmLabel }}
          </button>
        </footer>
      </section>
    </div></Teleport
  >
</template>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  z-index: 800;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(3, 5, 4, 0.76);
  backdrop-filter: blur(10px);
  animation: confirm-fade 0.25s ease;
}
.confirm-dialog {
  width: min(410px, 100%);
  padding: 24px;
  border-radius: 18px;
  background: #151b17;
  border: 1px solid var(--hairline-strong);
  box-shadow: 0 28px 100px #000c;
  text-align: center;
  animation: confirm-in 0.38s var(--ease);
}
.danger-icon {
  width: 52px;
  height: 52px;
  margin: 0 auto 14px;
  display: grid;
  place-items: center;
  border-radius: 15px;
  color: var(--danger);
  background: rgba(255, 93, 108, 0.12);
  border: 1px solid rgba(255, 93, 108, 0.2);
}
h2 {
  font-size: 20px;
}
p {
  margin: 8px auto 18px;
  max-width: 340px;
  color: var(--text-2);
  font-size: 11.5px;
  line-height: 1.55;
}
label {
  padding: 10px 11px;
  display: flex;
  align-items: center;
  gap: 9px;
  border-radius: 10px;
  color: var(--text-2);
  background: var(--surface-2);
  font-size: 10.5px;
  text-align: left;
  cursor: pointer;
}
.checkbox {
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  flex: none;
  border-radius: 6px;
  background: var(--surface-3);
  border: 1px solid var(--hairline-strong);
}
.checkbox.checked {
  color: #07130a;
  background: var(--green);
  border-color: var(--green);
}
footer {
  margin-top: 19px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
.confirm {
  color: #fff;
  background: linear-gradient(135deg, #d83e50, #ff6575);
  box-shadow: 0 8px 22px rgba(255, 93, 108, 0.2);
}
@keyframes confirm-fade {
  from {
    opacity: 0;
  }
}
@keyframes confirm-in {
  from {
    opacity: 0;
    transform: translateY(20px) scale(0.97);
  }
}
</style>
