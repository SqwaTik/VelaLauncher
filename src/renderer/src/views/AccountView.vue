<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "@/components/Icon.vue";
import SkinEditorModal from "@/components/SkinEditorModal.vue";
import SkinPreview3D from "@/components/SkinPreview3D.vue";
import ConfirmDialog from "@/components/ConfirmDialog.vue";
import type { SkinModel } from "@shared/types";
import { useAccountStore } from "@/stores/account";
import { useSettingsStore } from "@/stores/settings";
import { useLocale } from "@/composables/useLocale";

const account = useAccountStore();
const settingsStore = useSettingsStore();
const { tr } = useLocale();
const showAddAccount = ref(false);
const showEditor = ref(false);
const offlineName = ref("");
const addMode = ref<"offline" | "ely" | "littleskin">("offline");
const elyUsername = ref("");
const elyPassword = ref("");
const elyTotp = ref("");
const littleSkinUsername = ref("");
const littleSkinPassword = ref("");
const removeTarget = ref<string | null>(null);
const skinModel = computed(() => account.active?.skinModel ?? "classic");
const shortUuid = computed(() =>
  account.active
    ? `${account.active.uuid.slice(0, 8)}…${account.active.uuid.slice(-8)}`
    : "—",
);

function addOffline(): void {
  if (!offlineName.value.trim()) return;
  account.addOffline(offlineName.value);
  offlineName.value = "";
  showAddAccount.value = false;
}
function providerName(type?: string): string {
  if (type === "ely") return "Ely.by";
  if (type === "littleskin") return "LittleSkin";
  if (type === "microsoft") return "Microsoft";
  return type
    ? tr("Автономный профиль", "Offline profile", "Perfil sin conexión")
    : tr("Профиль не выбран", "No profile selected", "Perfil no seleccionado");
}
async function addEly(): Promise<void> {
  if (!elyUsername.value.trim() || !elyPassword.value) return;
  try {
    await account.addEly({
      username: elyUsername.value,
      password: elyPassword.value,
      totp: elyTotp.value || undefined,
    });
    elyPassword.value = "";
    elyTotp.value = "";
    showAddAccount.value = false;
  } catch {
    /* the store exposes the server error in the modal */
  }
}
async function addLittleSkin(): Promise<void> {
  if (!littleSkinUsername.value.trim() || !littleSkinPassword.value) return;
  try {
    await account.addLittleSkin({
      username: littleSkinUsername.value,
      password: littleSkinPassword.value,
    });
    littleSkinPassword.value = "";
    showAddAccount.value = false;
  } catch {
    /* the store exposes the server error in the modal */
  }
}
function changeModel(model: SkinModel): void {
  void account.setSkinModel(model);
}
function openLittleSkinRegistration(): void {
  void window.royale.app.openExternal("https://littleskin.cn/auth/register");
}
function askRemove(id: string): void {
  if (settingsStore.settings?.confirmAccountDelete === false)
    account.remove(id);
  else removeTarget.value = id;
}
function confirmRemove(dontAsk: boolean): void {
  if (!removeTarget.value) return;
  account.remove(removeTarget.value);
  removeTarget.value = null;
  if (dontAsk && settingsStore.settings) {
    settingsStore.settings.confirmAccountDelete = false;
    settingsStore.save();
  }
}
</script>

<template>
  <div class="account-page">
    <header class="page-head">
      <div>
        <p class="eyebrow">
          {{
            tr("Профиль Minecraft", "Minecraft profile", "Perfil de Minecraft")
          }}
        </p>
        <h1>
          {{
            tr(
              "Аккаунт и внешний вид",
              "Account & appearance",
              "Cuenta y apariencia",
            )
          }}
        </h1>
        <p>
          {{
            tr(
              "Локальные профили и полноценная 3D-студия скинов.",
              "Local profiles and a complete 3D skin studio.",
              "Perfiles locales y un estudio 3D de skins completo.",
            )
          }}
        </p>
      </div>
    </header>

    <div class="account-layout">
      <aside class="profile-column">
        <section class="identity-card">
          <div class="skin-stage">
            <span class="skin-glow" /><SkinPreview3D
              :skin="account.skinSource"
              :cape="account.capeSource"
              :model="skinModel"
            />
          </div>
          <div class="identity-copy">
            <h2>
              {{
                account.active?.username ||
                tr(
                  "Предпросмотр Steve",
                  "Steve preview",
                  "Vista previa de Steve",
                )
              }}
            </h2>
            <span class="provider"
              ><Icon name="user" :size="13" />{{
                providerName(account.active?.type)
              }}</span
            ><code>{{ shortUuid }}</code>
          </div>
          <button class="edit-skin" @click="showEditor = true">
            <Icon name="pencil" :size="18" /><span>{{
              tr("Редактировать скин", "Edit skin", "Editar skin")
            }}</span>
          </button>

          <div v-if="account.active" class="cape-wardrobe">
            <header>
              <div>
                <h3>
                  {{
                    tr("Гардероб плащей", "Cape wardrobe", "Armario de capas")
                  }}
                </h3>
                <span>{{ account.customCapes.length }}/5</span>
              </div>
              <p>
                {{
                  tr(
                    "Клик — выбрать и заменить, ПКМ — удалить",
                    "Click to select and replace, right-click to remove",
                    "Clic para elegir y reemplazar, clic derecho para eliminar",
                  )
                }}
              </p>
            </header>
            <div class="cape-list">
              <button
                class="cape-tile no-cape"
                :class="{
                  active:
                    !account.activeCustomCape &&
                    !account.appearance?.capes.some(
                      (cape) => cape.state === 'ACTIVE',
                    ),
                }"
                :title="
                  tr('Без локального плаща', 'No local cape', 'Sin capa local')
                "
                @click="account.disableCape()"
              >
                <Icon name="close" :size="16" /><small>{{
                  tr("Нет", "None", "Ninguna")
                }}</small>
              </button>
              <button
                v-for="cape in account.appearance?.capes ?? []"
                :key="`official-${cape.id}`"
                class="cape-tile"
                :class="{
                  active: !account.activeCustomCape && cape.state === 'ACTIVE',
                }"
                :disabled="account.active?.type !== 'microsoft'"
                :title="
                  account.active?.type === 'microsoft'
                    ? tr(
                        'Выбрать официальный плащ',
                        'Select official cape',
                        'Elegir capa oficial',
                      )
                    : tr(
                        'Плащ этого сервиса доступен для просмотра',
                        'This service cape is available for preview',
                        'La capa de este servicio está disponible como vista previa',
                      )
                "
                @click="account.selectCape(cape.id)"
              >
                <img :src="cape.url" :alt="cape.alias" /><small>{{
                  cape.alias
                }}</small>
              </button>
              <button
                v-for="cape in account.customCapes"
                :key="cape.id"
                class="cape-tile"
                :class="{ active: account.activeCustomCape?.id === cape.id }"
                :title="
                  tr(
                    'Нажмите, чтобы выбрать или заменить. ПКМ — удалить',
                    'Click to select or replace. Right-click to remove',
                    'Clic para elegir o reemplazar. Clic derecho para eliminar',
                  )
                "
                @click="account.editCustomCape(cape.id)"
                @contextmenu.prevent="account.removeCustomCape(cape.id)"
              >
                <img :src="cape.dataUrl" :alt="cape.name" /><small>{{
                  cape.name
                }}</small>
              </button>
              <button
                v-if="account.customCapes.length < 5"
                class="cape-tile add-cape"
                :title="
                  tr('Загрузить PNG-плащ', 'Upload PNG cape', 'Subir capa PNG')
                "
                @click="account.addCustomCape()"
              >
                <Icon name="plus" :size="18" /><small>{{
                  tr("Добавить", "Add", "Añadir")
                }}</small>
              </button>
            </div>
            <p v-if="account.appearanceError" class="cape-error">
              <Icon name="alert" :size="13" />{{ account.appearanceError }}
            </p>
          </div>
        </section>

        <section class="accounts-panel">
          <header>
            <div>
              <h3>{{ tr("Профили", "Profiles", "Perfiles") }}</h3>
              <span>{{ account.accounts.length }}</span>
            </div>
            <button
              v-if="account.accounts.length"
              class="icon-button"
              title="Добавить"
              @click="showAddAccount = true"
            >
              <Icon name="plus" :size="17" />
            </button>
          </header>
          <div v-if="account.accounts.length" class="account-list">
            <button
              v-for="item in account.accounts"
              :key="item.id"
              :class="{ active: item.id === account.activeId }"
              @click="account.select(item.id)"
            >
              <img :src="account.avatarOf(item)" alt="" loading="lazy" /><span
                ><b>{{ item.username }}</b
                ><small>{{ providerName(item.type) }}</small></span
              ><i class="selected-dot" /><span
                class="remove"
                title="Удалить"
                @click.stop="askRemove(item.id)"
                ><Icon name="trash" :size="14"
              /></span>
            </button>
          </div>
          <button v-else class="first-account" @click="showAddAccount = true">
            <Icon name="plus" :size="18" />{{
              tr(
                "Создать первый профиль",
                "Create first profile",
                "Crear primer perfil",
              )
            }}
          </button>
        </section>
      </aside>

      <main class="appearance-column">
        <section class="studio-hero">
          <div>
            <p class="eyebrow">Skin Studio 3D</p>
            <h2>
              {{
                tr("Редактирование скина", "Skin editing", "Edición de skins")
              }}
            </h2>
            <p>
              Рисуйте прямо на 3D-модели или текстуре 64×64, переключайте
              основной и внешний слои, меняйте Classic/Slim и сохраняйте PNG без
              потери качества.
            </p>
          </div>
          <button class="editor-button" @click="showEditor = true">
            <span><Icon name="brush" :size="22" /></span>
            <div>
              <b>{{ tr("Открыть редактор", "Open editor", "Abrir editor") }}</b
              ><small
                >3D + {{ tr("текстура", "texture", "textura") }} 64×64</small
              >
            </div>
            <Icon name="chevron" :size="17" />
          </button>
        </section>

        <section class="appearance-section">
          <header>
            <div>
              <h3>
                {{
                  tr(
                    "Геометрия модели",
                    "Model geometry",
                    "Geometría del modelo",
                  )
                }}
              </h3>
              <p>
                Classic использует руки 4 px, Slim — 3 px. Предпросмотр меняется
                сразу.
              </p>
            </div>
          </header>
          <div class="model-grid">
            <button
              :disabled="!account.active"
              :class="{ active: skinModel === 'classic' }"
              @click="changeModel('classic')"
            >
              <span class="figure classic"><i /><i /><i /><i /><i /></span>
              <div>
                <b>Classic</b><small>Стандартные руки шириной 4 px</small>
              </div>
              <span class="radio" /></button
            ><button
              :disabled="!account.active"
              :class="{ active: skinModel === 'slim' }"
              @click="changeModel('slim')"
            >
              <span class="figure slim"><i /><i /><i /><i /><i /></span>
              <div><b>Slim</b><small>Тонкие руки шириной 3 px</small></div>
              <span class="radio" />
            </button>
          </div>
        </section>
      </main>
    </div>

    <Teleport to="body"
      ><Transition name="modal"
        ><div
          v-if="showAddAccount"
          class="modal-overlay"
          @click.self="showAddAccount = false"
        >
          <section class="account-modal">
            <header>
              <div>
                <p class="eyebrow">Новый профиль</p>
                <h2>Добавить профиль</h2>
              </div>
              <button class="icon-button" @click="showAddAccount = false">
                <Icon name="close" :size="19" />
              </button>
            </header>
            <div class="provider-tabs">
              <button
                :class="{ active: addMode === 'offline' }"
                @click="addMode = 'offline'"
              >
                <Icon name="user" :size="17" />Автономный</button
              ><button
                :class="{ active: addMode === 'ely' }"
                @click="addMode = 'ely'"
              >
                <img
                  src="https://ely.by/favicon.ico?v=2"
                  alt=""
                />Ely.by</button
              ><button
                :class="{ active: addMode === 'littleskin' }"
                @click="addMode = 'littleskin'"
              >
                <img src="https://littleskin.cn/favicon.png" alt="" />LittleSkin
              </button>
            </div>
            <div v-if="addMode === 'offline'" class="offline-option">
              <span><Icon name="user" :size="22" /></span>
              <div>
                <b>Автономный профиль</b>
                <p>
                  Для локальной игры и серверов без обязательной авторизации.
                </p>
              </div>
            </div>
            <form v-if="addMode === 'offline'" @submit.prevent="addOffline">
              <input
                v-model="offlineName"
                class="field"
                maxlength="16"
                placeholder="Имя игрока"
                autofocus
              /><button class="btn btn-primary" :disabled="!offlineName.trim()">
                <Icon name="plus" :size="16" />Добавить
              </button>
            </form>
            <form
              v-else-if="addMode === 'ely'"
              class="ely-form"
              @submit.prevent="addEly"
            >
              <input
                v-model="elyUsername"
                class="field"
                autocomplete="username"
                placeholder="Логин или email Ely.by"
                autofocus
              /><input
                v-model="elyPassword"
                class="field"
                type="password"
                autocomplete="current-password"
                placeholder="Пароль"
              /><input
                v-model="elyTotp"
                class="field"
                inputmode="numeric"
                autocomplete="one-time-code"
                placeholder="Код 2FA (если включён)"
              /><button
                class="btn btn-primary"
                :disabled="
                  account.elyBusy || !elyUsername.trim() || !elyPassword
                "
              >
                <Icon
                  :name="account.elyBusy ? 'spinner' : 'shield'"
                  :size="16"
                  :class="{ spin: account.elyBusy }"
                />{{ account.elyBusy ? "Входим…" : "Войти через Ely.by" }}
              </button>
            </form>
            <form v-else class="ely-form" @submit.prevent="addLittleSkin">
              <input
                v-model="littleSkinUsername"
                class="field"
                autocomplete="username"
                placeholder="Email LittleSkin"
                autofocus
              /><input
                v-model="littleSkinPassword"
                class="field"
                type="password"
                autocomplete="current-password"
                placeholder="Пароль"
              /><a
                class="register-link"
                href="#"
                @click.prevent="openLittleSkinRegistration"
                >Нет аккаунта? Зарегистрироваться</a
              ><button
                class="btn btn-primary"
                :disabled="
                  account.littleSkinBusy ||
                  !littleSkinUsername.trim() ||
                  !littleSkinPassword
                "
              >
                <Icon
                  :name="account.littleSkinBusy ? 'spinner' : 'shield'"
                  :size="16"
                  :class="{ spin: account.littleSkinBusy }"
                />{{
                  account.littleSkinBusy ? "Входим…" : "Войти через LittleSkin"
                }}
              </button>
            </form>
            <p v-if="addMode === 'ely' && account.elyError" class="auth-error">
              <Icon name="alert" :size="14" />{{ account.elyError }}
            </p>
            <p
              v-if="addMode === 'littleskin' && account.littleSkinError"
              class="auth-error"
            >
              <Icon name="alert" :size="14" />{{ account.littleSkinError }}
            </p>
            <p v-if="addMode === 'offline'" class="offline-note">
              <Icon name="shield" :size="15" />Официальные серверы и Realms
              требуют лицензионную авторизацию.
            </p>
          </section>
        </div></Transition
      ></Teleport
    >
    <SkinEditorModal v-if="showEditor" @close="showEditor = false" />
    <ConfirmDialog
      v-if="removeTarget"
      title="Удалить профиль?"
      message="Профиль будет удалён только из Royale Launcher. Игровые файлы и сохранения останутся на месте."
      @cancel="removeTarget = null"
      @confirm="confirmRemove"
    />
  </div>
</template>

<style scoped lang="scss">
.account-page {
  width: 100%;
  min-width: 0;
  max-width: 1180px;
  margin: 0 auto;
  padding: 28px clamp(16px, 3vw, 30px) 56px;
  overflow-x: hidden;
}
.page-head {
  margin-bottom: 23px;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 22px;
}
.page-head h1 {
  margin-top: 3px;
  font-size: clamp(24px, 3vw, 30px);
  overflow-wrap: anywhere;
}
.page-head > div > p:last-child {
  margin-top: 6px;
  color: var(--text-3);
  font-size: 12px;
}
.account-layout {
  display: grid;
  grid-template-columns: 290px minmax(0, 1fr);
  gap: 18px;
}
.profile-column,
.appearance-column {
  display: flex;
  flex-direction: column;
  gap: 13px;
}
.identity-card,
.accounts-panel,
.studio-hero,
.appearance-section {
  border-radius: 16px;
  background: rgba(17, 23, 19, 0.9);
  border: 1px solid var(--hairline);
  backdrop-filter: blur(18px);
}
.identity-card {
  overflow: hidden;
}
.skin-stage {
  position: relative;
  height: 285px;
  background:
    radial-gradient(
      circle at 50% 46%,
      rgba(78, 190, 103, 0.18),
      transparent 52%
    ),
    linear-gradient(145deg, #19251c, #0c120e);
}
.skin-glow {
  position: absolute;
  left: 50%;
  bottom: 22px;
  width: 140px;
  height: 22px;
  border-radius: 50%;
  background: rgba(83, 195, 106, 0.2);
  filter: blur(11px);
  transform: translateX(-50%);
}
.identity-copy {
  padding: 14px 16px 9px;
}
.identity-copy h2 {
  font-size: 19px;
}
.provider {
  margin-top: 5px;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--green);
  font-size: 10.5px;
}
.identity-copy code {
  display: block;
  margin-top: 9px;
  color: var(--text-3);
  font-family: var(--font-num);
  font-size: 9px;
}
.edit-skin {
  width: calc(100% - 24px);
  height: 42px;
  margin: 6px 12px 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 10px;
  color: #07130a;
  background: var(--green-grad);
  font-size: 11.5px;
  font-weight: 750;
}
.edit-skin:hover {
  transform: translateY(-2px);
  box-shadow: var(--glow-green);
}
.cape-wardrobe {
  margin-top: 2px;
  padding: 14px 12px 12px;
  border-top: 1px solid var(--hairline);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.018), transparent);
}
.cape-wardrobe > header {
  padding: 1px 2px 10px;
}
.cape-wardrobe > header > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.cape-wardrobe h3 {
  color: var(--text-0);
  font-size: 12px;
}
.cape-wardrobe header span {
  padding: 3px 7px;
  border-radius: 999px;
  color: var(--green);
  background: var(--green-soft);
  font: 8px var(--font-num);
}
.cape-wardrobe header p {
  margin-top: 4px;
  color: var(--text-3);
  font-size: 8px;
}
.cape-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
}
.cape-tile {
  position: relative;
  min-width: 0;
  height: 74px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid var(--hairline);
  border-radius: 10px;
  color: var(--text-3);
  background: var(--surface-2);
}
.cape-tile:hover {
  transform: translateY(-2px);
  color: var(--text-1);
  border-color: var(--hairline-strong);
}
.cape-tile.active {
  color: var(--green);
  border-color: var(--green-line);
  background: var(--green-soft);
  box-shadow: inset 0 0 0 1px rgba(83, 195, 106, 0.08);
}
.cape-tile img {
  width: 48px;
  height: 40px;
  object-fit: contain;
  image-rendering: pixelated;
}
.cape-tile small {
  width: 100%;
  overflow: hidden;
  color: currentColor;
  font-size: 7.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.add-cape {
  border-style: dashed;
  color: var(--green);
}
.no-cape {
  color: var(--text-3);
}
.cape-error {
  margin-top: 8px;
  padding: 7px 8px;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  border-radius: 8px;
  color: var(--danger);
  background: rgba(255, 93, 108, 0.09);
  font-size: 8px;
  line-height: 1.4;
}
.accounts-panel {
  padding: 12px;
}
.accounts-panel > header {
  padding: 2px 3px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.accounts-panel > header > div {
  display: flex;
  align-items: center;
  gap: 7px;
}
.accounts-panel h3 {
  font-size: 13px;
}
.accounts-panel header div > span {
  min-width: 21px;
  height: 18px;
  padding: 0 6px;
  display: grid;
  place-items: center;
  border-radius: 999px;
  color: var(--green);
  background: var(--green-soft);
  font-size: 8px;
}
.account-list {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.account-list > button {
  position: relative;
  width: 100%;
  height: 54px;
  padding: 5px 7px;
  display: flex;
  align-items: center;
  gap: 9px;
  border-radius: 10px;
  color: var(--text-2);
  text-align: left;
}
.account-list > button:hover {
  background: var(--surface-3);
}
.account-list > button.active {
  background: var(--green-soft);
}
.account-list img {
  width: 38px;
  height: 38px;
  border-radius: 9px;
  image-rendering: pixelated;
}
.account-list > button > span:nth-child(2) {
  min-width: 0;
  flex: 1;
}
.account-list b,
.account-list small {
  display: block;
}
.account-list b {
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-0);
  font-size: 11px;
}
.account-list small {
  margin-top: 2px;
  color: var(--text-3);
  font-size: 8.5px;
}
.selected-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: transparent;
}
.account-list button.active .selected-dot {
  background: var(--green);
  box-shadow: 0 0 8px rgba(83, 195, 106, 0.7);
}
.remove {
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 7px;
  opacity: 0;
  color: var(--text-3);
}
.account-list button:hover .remove {
  opacity: 1;
}
.remove:hover {
  color: var(--danger);
  background: rgba(255, 93, 108, 0.1);
}
.first-account {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 10px;
  color: var(--green);
  background: var(--green-soft);
  font-size: 10.5px;
  text-align: center;
}
.first-account :deep(svg) {
  flex: none;
}
.studio-hero {
  padding: 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;
  background: linear-gradient(
    120deg,
    rgba(35, 74, 44, 0.88),
    rgba(17, 23, 19, 0.94) 62%
  );
}
.studio-hero h2 {
  margin-top: 4px;
  font-size: 24px;
}
.studio-hero > div > p:nth-child(3) {
  max-width: 600px;
  margin-top: 7px;
  color: var(--text-2);
  font-size: 11.5px;
  line-height: 1.55;
}
.feature-row {
  margin-top: 14px;
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}
.feature-row span {
  padding: 5px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 7px;
  color: var(--green);
  background: var(--green-soft);
  font-size: 8.5px;
}
.editor-button {
  width: 235px;
  min-height: 68px;
  padding: 9px;
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
  border-radius: 13px;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  text-align: left;
}
.editor-button:hover {
  transform: translateX(4px);
  border-color: var(--green-line);
  background: var(--surface-3);
}
.editor-button > span {
  width: 43px;
  height: 43px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  color: var(--green);
  background: var(--green-soft);
}
.editor-button > div {
  flex: 1;
}
.editor-button b,
.editor-button small {
  display: block;
}
.editor-button b {
  color: var(--text-0);
  font-size: 11px;
}
.editor-button small {
  margin-top: 3px;
  color: var(--text-3);
  font-size: 8.5px;
}
.appearance-section {
  padding: 18px;
}
.appearance-section > header {
  margin-bottom: 13px;
}
.appearance-section h3 {
  font-size: 15px;
}
.appearance-section header p {
  margin-top: 4px;
  color: var(--text-3);
  font-size: 10.5px;
}
.model-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.model-grid > button {
  min-height: 84px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 12px;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--hairline);
  text-align: left;
}
.model-grid > button:hover:not(:disabled) {
  transform: translateY(-2px);
  border-color: var(--hairline-strong);
}
.model-grid > button.active {
  color: var(--green);
  background: var(--green-soft);
  border-color: var(--green-line);
}
.model-grid > button:disabled {
  opacity: 0.45;
}
.model-grid > button > div {
  flex: 1;
}
.model-grid b,
.model-grid small {
  display: block;
}
.model-grid b {
  color: var(--text-0);
  font-size: 11.5px;
}
.model-grid small {
  margin-top: 3px;
  color: var(--text-3);
  font-size: 9px;
}
.radio {
  width: 15px;
  height: 15px;
  border: 2px solid var(--surface-4);
  border-radius: 50%;
}
.model-grid button.active .radio {
  border: 4px solid var(--green);
}
.figure {
  position: relative;
  width: 34px;
  height: 56px;
  flex: none;
}
.figure i {
  position: absolute;
  display: block;
  border-radius: 3px;
  background: currentColor;
}
.figure i:nth-child(1) {
  left: 10px;
  top: 0;
  width: 14px;
  height: 14px;
}
.figure i:nth-child(2) {
  left: 9px;
  top: 16px;
  width: 16px;
  height: 21px;
}
.figure i:nth-child(3) {
  left: 1px;
  top: 17px;
  width: 7px;
  height: 24px;
}
.figure i:nth-child(4) {
  right: 1px;
  top: 17px;
  width: 7px;
  height: 24px;
}
.figure.slim i:nth-child(3),
.figure.slim i:nth-child(4) {
  width: 5px;
}
.figure.slim i:nth-child(3) {
  left: 3px;
}
.figure.slim i:nth-child(4) {
  right: 3px;
}
.figure i:nth-child(5) {
  left: 10px;
  top: 39px;
  width: 14px;
  height: 17px;
}
.layer-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.layer-cards article {
  padding: 12px;
  display: flex;
  align-items: center;
  gap: 9px;
  border-radius: 11px;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
}
.layer-cards article > span {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 9px;
  color: var(--green);
  background: var(--green-soft);
}
.layer-cards article > div {
  min-width: 0;
  flex: 1;
}
.layer-cards b {
  color: var(--text-0);
  font-size: 10.5px;
}
.layer-cards p {
  margin-top: 3px;
  color: var(--text-3);
  font-size: 8.5px;
}
.layer-cards article > svg {
  color: var(--green);
}
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 520;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(3, 6, 4, 0.74);
  backdrop-filter: blur(10px);
}
.account-modal {
  width: min(470px, 100%);
  padding: 20px;
  border-radius: 18px;
  background: #151b17;
  border: 1px solid var(--hairline-strong);
  box-shadow: 0 30px 100px #000c;
}
.account-modal > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.account-modal h2 {
  margin-top: 3px;
  font-size: 22px;
}
.provider-tabs {
  margin-top: 16px;
  padding: 4px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
  border-radius: 11px;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
}
.provider-tabs button {
  height: 38px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border-radius: 8px;
  color: var(--text-3);
  font-size: 10px;
  font-weight: 700;
}
.provider-tabs button img {
  width: 18px;
  height: 18px;
  object-fit: contain;
  border-radius: 4px;
}
.provider-tabs button.active {
  color: var(--green);
  background: var(--green-soft);
  box-shadow: inset 0 0 0 1px var(--green-line);
}
.account-modal form.ely-form {
  display: flex;
  flex-direction: column;
}
.ely-form .btn {
  height: 42px;
  justify-content: center;
}
.register-link {
  align-self: flex-start;
  color: var(--green);
  font-size: 9.5px;
}
.register-link:hover {
  text-decoration: underline;
}
.auth-error {
  margin-top: 10px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  gap: 7px;
  border-radius: 8px;
  color: var(--danger);
  background: rgba(255, 93, 108, 0.1);
  font-size: 9.5px;
}
.spin {
  animation: spin 0.75s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.offline-option {
  margin-top: 17px;
  padding: 13px;
  display: flex;
  gap: 11px;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1px solid var(--hairline);
}
.offline-option > span {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  color: var(--green);
  background: var(--green-soft);
}
.offline-option b {
  color: var(--text-0);
  font-size: 11.5px;
}
.offline-option p {
  margin-top: 4px;
  color: var(--text-3);
  font-size: 9.5px;
  line-height: 1.45;
}
.account-modal form {
  margin-top: 10px;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}
.offline-note {
  margin-top: 12px;
  display: flex;
  gap: 7px;
  color: var(--text-3);
  font-size: 9.5px;
  line-height: 1.4;
}
.offline-note svg {
  color: var(--warn);
  margin-top: 1px;
}
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s;
}
.modal-enter-active .account-modal,
.modal-leave-active .account-modal {
  transition:
    transform 0.4s var(--ease),
    opacity 0.3s;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-from .account-modal,
.modal-leave-to .account-modal {
  transform: translateY(24px) scale(0.97);
}
@media (max-width: 980px) {
  .account-layout {
    grid-template-columns: 1fr;
  }
  .studio-hero {
    align-items: stretch;
    flex-direction: column;
  }
  .editor-button {
    width: 100%;
  }
  .model-grid,
  .layer-cards {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 680px) {
  .profile-column {
    display: flex;
  }
  .page-head {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
