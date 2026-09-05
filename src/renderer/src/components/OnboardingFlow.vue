<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Icon from "./Icon.vue";
import { GAME } from "@shared/constants";
import { useAccountStore } from "@/stores/account";
import { useSettingsStore } from "@/stores/settings";
import logo from "@/assets/images/vela-logo.png";

const account = useAccountStore();
const settings = useSettingsStore();
const step = ref(0);
const playerName = ref("");
const accountMode = ref<"offline" | "ely" | "littleskin">("offline");
const elyLogin = ref("");
const elyPassword = ref("");
const elyTotp = ref("");
const littleSkinLogin = ref("");
const littleSkinPassword = ref("");
const error = ref("");
const steps = ["Знакомство", "Профиль", "Java", "Готово"];
const javaReady = computed(() => Boolean(settings.java?.valid));
const accountBusy = computed(() => account.elyBusy || account.littleSkinBusy);
const accountCanSubmit = computed(() => {
  if (accountMode.value === "offline") return Boolean(playerName.value.trim());
  if (accountMode.value === "ely")
    return Boolean(elyLogin.value.trim() && elyPassword.value);
  return Boolean(littleSkinLogin.value.trim() && littleSkinPassword.value);
});

function stepMarker(index: number): string | number {
  return index < step.value ? "✓" : index + 1;
}
function stepDone(index: number): boolean {
  return index < step.value;
}

function next(): void {
  step.value = Math.min(steps.length - 1, step.value + 1);
}
async function addProfile(): Promise<void> {
  if (!accountCanSubmit.value || accountBusy.value) return;
  error.value = "";
  try {
    if (accountMode.value === "offline") {
      account.addOffline(playerName.value);
    } else if (accountMode.value === "ely") {
      await account.addEly({
        username: elyLogin.value.trim(),
        password: elyPassword.value,
        totp: elyTotp.value.trim() || undefined,
      });
    } else {
      await account.addLittleSkin({
        username: littleSkinLogin.value.trim(),
        password: littleSkinPassword.value,
      });
    }
    next();
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Не удалось войти в профиль.";
  }
}
async function installJava(): Promise<void> {
  if (settings.installingJava || javaReady.value) return;
  error.value = "";
  try {
    await settings.installJava();
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : String(cause);
  }
}
watch(step, (value) => {
  error.value = "";
  if (value === 2 && !javaReady.value) void installJava();
});
async function finish(): Promise<void> {
  if (!settings.settings) return;
  settings.settings.onboardingCompleted = true;
  await settings.saveNow();
}
</script>

<template>
  <Teleport to="body"
    ><div class="onboarding">
      <section class="tour">
        <aside>
          <img :src="logo" alt="Vela" />
          <p>VELA LAUNCHER</p>
          <nav>
            <span
              v-for="(label, index) in steps"
              :key="label"
              :class="{ active: index === step, done: stepDone(index) }"
              ><i>{{ stepMarker(index) }}</i
              ><b>{{ label }}</b></span
            >
          </nav>
        </aside>
        <main>
          <Transition name="tour-step" mode="out-in">
            <div v-if="step === 0" key="welcome" class="tour-page">
              <p class="eyebrow">Добро пожаловать</p>
              <h1>Здравствуйте, это Vela Launcher</h1>
              <p>
                Vela собирает игру, профили и настройки в одном спокойном
                интерфейсе. После знакомства останется выбрать профиль и нажать
                одну кнопку на главной.
              </p>
              <div class="tour-feature">
                <span><Icon name="play" :size="18" /><b>Быстрый старт</b></span
                ><span
                  ><Icon name="palette" :size="18" /><b
                    >Свой внешний вид</b
                  ></span
                ><span
                  ><Icon name="shield" :size="18" /><b>Проверка файлов</b></span
                >
              </div>
            </div>
            <div v-else-if="step === 1" key="account" class="tour-page">
              <p class="eyebrow">Шаг 2</p>
              <h1>Добавьте игровой профиль</h1>
              <p>
                Выберите сервис и войдите. Данные передаются только выбранному
                серверу авторизации и сохраняются локально на этом компьютере.
              </p>
              <div class="provider-tabs">
                <button
                  :class="{ active: accountMode === 'offline' }"
                  @click="accountMode = 'offline'"
                >
                  <i>O</i
                  ><span><b>Автономный</b><small>Без сервера</small></span>
                </button>
                <button
                  :class="{ active: accountMode === 'ely' }"
                  @click="accountMode = 'ely'"
                >
                  <i>E</i><span><b>Ely.by</b><small>Yggdrasil</small></span>
                </button>
                <button
                  :class="{ active: accountMode === 'littleskin' }"
                  @click="accountMode = 'littleskin'"
                >
                  <i>L</i><span><b>LittleSkin</b><small>Yggdrasil</small></span>
                </button>
              </div>
              <div class="account-fields">
                <label v-if="accountMode === 'offline'"
                  ><span>Имя игрока</span
                  ><input
                    v-model="playerName"
                    class="field"
                    maxlength="16"
                    placeholder="Например, Steve"
                    @keydown.enter="addProfile"
                /></label>
                <template v-else-if="accountMode === 'ely'">
                  <label
                    ><span>Логин Ely.by</span
                    ><input
                      v-model="elyLogin"
                      class="field"
                      autocomplete="username"
                      placeholder="Почта или имя"
                  /></label>
                  <label
                    ><span>Пароль</span
                    ><input
                      v-model="elyPassword"
                      class="field"
                      type="password"
                      autocomplete="current-password"
                      @keydown.enter="addProfile"
                  /></label>
                  <label
                    ><span>Код 2FA, если включён</span
                    ><input
                      v-model="elyTotp"
                      class="field"
                      inputmode="numeric"
                      maxlength="8"
                  /></label>
                </template>
                <template v-else>
                  <label
                    ><span>Логин LittleSkin</span
                    ><input
                      v-model="littleSkinLogin"
                      class="field"
                      autocomplete="username"
                      placeholder="Почта или имя"
                  /></label>
                  <label
                    ><span>Пароль</span
                    ><input
                      v-model="littleSkinPassword"
                      class="field"
                      type="password"
                      autocomplete="current-password"
                      @keydown.enter="addProfile"
                  /></label>
                </template>
              </div>
              <p v-if="error" class="tour-error">{{ error }}</p>
            </div>
            <div v-else-if="step === 2" key="java" class="tour-page">
              <p class="eyebrow">Шаг 3</p>
              <h1>Java {{ GAME.javaMajor }} для Minecraft</h1>
              <p>
                Java — среда, в которой работает Minecraft. Если подходящей
                версии нет, Vela загрузит её в собственную папку автоматически
                и не изменит системные настройки.
              </p>
              <div class="java-state" :class="{ ok: javaReady }">
                <span
                  ><Icon :name="javaReady ? 'check' : 'chip'" :size="22"
                /></span>
                <div>
                  <b>{{
                    javaReady
                      ? `Java ${settings.java?.majorVersion} готова`
                      : `Java ${GAME.javaMajor} не найдена`
                  }}</b
                  ><small>{{
                    settings.java?.path || `.royale/jre/java${GAME.javaMajor}`
                  }}</small>
                </div>
              </div>
              <div v-if="settings.installingJava" class="java-progress">
                <Icon name="spinner" :size="17" class="spin" /><span
                  ><b
                    >{{
                      Math.round(
                        (settings.javaInstallProgress?.progress || 0) * 100,
                      )
                    }}%</b
                  ><small>{{
                    settings.javaInstallProgress?.message ||
                    "Подготавливаем Java…"
                  }}</small></span
                >
              </div>
              <button
                v-else-if="!javaReady && error"
                class="btn java-install"
                @click="installJava"
              >
                <Icon name="refresh" :size="17" />Повторить
              </button>
              <p v-if="error" class="tour-error">{{ error }}</p>
            </div>
            <div v-else key="done" class="tour-page done-page">
              <span class="done-mark"><Icon name="check" :size="34" /></span>
              <p class="eyebrow">Всё настроено</p>
              <h1>Vela готов к работе</h1>
              <p>
                На главной нажмите «Установить». Во время загрузки можно
                поставить процесс на паузу, а подробный этап всегда показан
                рядом с кнопкой.
              </p>
            </div>
          </Transition>
          <footer>
            <button
              v-if="step > 0 && step < 3"
              class="btn btn-ghost"
              @click="step--"
            >
              Назад</button
            ><span /><button
              v-if="step === 0"
              class="btn btn-primary"
              @click="next"
            >
              Начать</button
            ><template v-else-if="step === 1"
              ><button class="btn btn-ghost" @click="next">Пропустить</button
              ><button
                class="btn btn-primary"
                :disabled="!accountCanSubmit || accountBusy"
                @click="addProfile"
              >
                {{ accountBusy ? "Входим…" : "Продолжить" }}
              </button></template
            ><button
              v-else-if="step === 2"
              class="btn btn-primary"
              :disabled="settings.installingJava"
              @click="next"
            >
              {{ javaReady ? "Далее" : "Продолжить без Java" }}</button
            ><button v-else class="btn btn-primary" @click="finish">
              Открыть лаунчер
            </button>
          </footer>
        </main>
      </section>
    </div></Teleport
  >
</template>

<style scoped lang="scss">
.onboarding {
  position: fixed;
  inset: 0;
  z-index: 980;
  display: grid;
  place-items: center;
  padding: 24px;
  background:
    radial-gradient(
      800px 500px at 50% 25%,
      rgba(118, 104, 255, 0.18),
      transparent 68%
    ),
    #090a12;
}
.tour {
  width: min(920px, 100%);
  min-height: 540px;
  display: grid;
  grid-template-columns: 230px 1fr;
  overflow: hidden;
  border-radius: 24px;
  background: #11131d;
  border: 1px solid var(--hairline-strong);
  box-shadow: 0 35px 120px #000c;
}
.tour > aside {
  padding: 30px 24px;
  background: linear-gradient(165deg, #1a1d31, #0c0e18);
  border-right: 1px solid var(--hairline);
}
.tour > aside > img {
  width: 80px;
  height: 80px;
  object-fit: contain;
  filter: drop-shadow(0 14px 28px rgba(81, 79, 255, 0.35));
}
.tour > aside > p {
  margin-top: 12px;
  color: var(--green);
  font: 700 10px var(--font-num);
  letter-spacing: 0.16em;
}
.tour nav {
  margin-top: 42px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.tour nav span {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-3);
}
.tour nav i {
  width: 29px;
  height: 29px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface-3);
  font: 700 10px var(--font-num);
  font-style: normal;
}
.tour nav b {
  font-size: 11px;
}
.tour nav span.active {
  color: var(--text-0);
}
.tour nav span.active i,
.tour nav span.done i {
  color: #f7f5ff;
  background: var(--green);
  box-shadow: 0 0 18px rgba(118, 104, 255, 0.34);
}
.tour > main {
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.tour-page {
  padding: 65px 58px 30px;
  overflow-y: auto;
}
.tour-page h1 {
  max-width: 540px;
  margin-top: 7px;
  font-size: 34px;
  line-height: 1.08;
}
.tour-page > p:not(.eyebrow):not(.tour-error) {
  max-width: 560px;
  margin-top: 16px;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1.65;
}
.tour-page code {
  padding: 2px 5px;
  border-radius: 5px;
  background: var(--surface-3);
  font: 11px var(--font-num);
}
.tour-feature {
  margin-top: 30px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.tour-feature span {
  min-height: 72px;
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 9px;
  border-radius: 12px;
  color: var(--green);
  background: var(--green-soft);
  border: 1px solid var(--green-line);
}
.tour-feature b {
  color: var(--text-1);
  font-size: 10px;
}
.tour-page label {
  max-width: 440px;
  margin-top: 28px;
  display: block;
}
.tour-page label span {
  display: block;
  margin-bottom: 7px;
  color: var(--text-2);
  font-size: 10px;
}
.tour-page label input {
  width: 100%;
}
.provider-tabs {
  max-width: 560px;
  margin-top: 22px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 7px;
}
.provider-tabs button {
  min-width: 0;
  padding: 9px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 11px;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  text-align: left;
}
.provider-tabs button:hover,
.provider-tabs button.active {
  color: var(--green);
  border-color: var(--green-line);
  background: var(--green-soft);
}
.provider-tabs i {
  width: 29px;
  height: 29px;
  display: grid;
  place-items: center;
  flex: none;
  border-radius: 8px;
  color: currentColor;
  background: rgba(255, 255, 255, 0.045);
  font: 800 11px var(--font-num);
  font-style: normal;
}
.provider-tabs span,
.provider-tabs b,
.provider-tabs small {
  min-width: 0;
  display: block;
}
.provider-tabs b {
  overflow: hidden;
  color: var(--text-1);
  font-size: 9.5px;
  text-overflow: ellipsis;
}
.provider-tabs small {
  margin-top: 2px;
  color: var(--text-3);
  font-size: 7.5px;
}
.account-fields {
  max-width: 560px;
  margin-top: 13px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 9px;
}
.account-fields label {
  max-width: none;
  margin-top: 0;
}
.account-fields label:only-child {
  grid-column: 1 / -1;
}
.java-state {
  max-width: 520px;
  margin-top: 25px;
  padding: 14px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 13px;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
}
.java-state > span {
  width: 43px;
  height: 43px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  color: var(--warn);
  background: rgba(232, 200, 116, 0.1);
}
.java-state.ok > span {
  color: var(--green);
  background: var(--green-soft);
}
.java-state b,
.java-state small {
  display: block;
}
.java-state b {
  font-size: 12px;
}
.java-state small {
  max-width: 400px;
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-3);
  font: 9px var(--font-num);
}
.java-install {
  margin-top: 12px;
}
.java-progress {
  max-width: 520px;
  margin-top: 12px;
  padding: 11px 13px;
  display: flex;
  align-items: center;
  gap: 10px;
  border-radius: 11px;
  color: var(--green);
  background: var(--green-soft);
  border: 1px solid var(--green-line);
}
.java-progress span,
.java-progress b,
.java-progress small {
  display: block;
}
.java-progress b {
  color: var(--text-0);
  font: 700 10px var(--font-num);
}
.java-progress small {
  margin-top: 3px;
  color: var(--text-3);
  font-size: 8.5px;
}
.tour-error {
  margin-top: 10px;
  color: var(--danger);
  font-size: 10px;
}
.done-page {
  text-align: center;
}
.done-mark {
  width: 82px;
  height: 82px;
  margin: 0 auto 18px;
  display: grid;
  place-items: center;
  border-radius: 24px;
  color: #f7f5ff;
  background: var(--green-grad);
  box-shadow: var(--glow-green);
}
.done-page h1,
.done-page > p {
  margin-left: auto;
  margin-right: auto;
}
.tour > main > footer {
  margin-top: auto;
  padding: 20px 28px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-top: 1px solid var(--hairline);
}
.tour > main > footer > span {
  flex: 1;
}
.tour-step-enter-active,
.tour-step-leave-active {
  transition:
    opacity 0.18s var(--ease),
    transform 0.2s var(--ease);
}
.tour-step-enter-from {
  opacity: 0;
  transform: translateX(12px);
}
.tour-step-leave-to {
  opacity: 0;
  transform: translateX(-8px);
}
.spin {
  animation: spin 0.75s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
@media (max-width: 700px) {
  .tour {
    grid-template-columns: 1fr;
  }
  .tour > aside {
    display: none;
  }
  .tour-page {
    padding: 45px 28px 25px;
  }
  .tour-feature {
    grid-template-columns: 1fr;
  }
  .provider-tabs,
  .account-fields {
    grid-template-columns: 1fr;
  }
  .onboarding {
    padding: 12px;
  }
}
</style>
