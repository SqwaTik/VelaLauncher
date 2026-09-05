import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  StoredAccount,
  AccountType,
  SkinModel,
  Friend,
  MinecraftAppearance,
  CustomCape,
  ElyLoginInput,
  LittleSkinLoginInput,
} from "@shared/types";

export type { AccountType, SkinModel };
export type Account = StoredAccount;
export const MAX_ACCOUNTS = 6;

/** Offline UUID: launcher-local stable identity derived from the player name. */
function offlineUuid(name: string): string {
  let h = 0x811c9dc5;
  const seed = `OfflinePlayer:${name}`;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const hex = (n: number): string => (n >>> 0).toString(16).padStart(8, "0");
  const a = hex(h);
  const b = hex(Math.imul(h ^ 0x9e3779b9, 0x85ebca6b));
  const c = hex(Math.imul(h ^ 0xc2b2ae35, 0x27d4eb2f));
  const d = hex(Math.imul(h ^ 0x165667b1, 0x1b873593));
  const raw = (a + b + c + d).slice(0, 32);
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-3${raw.slice(13, 16)}-${raw.slice(16, 20)}-${raw.slice(20, 32)}`;
}

/** Head render from Minotar (works for offline names too, falls back to Steve). */
function avatarFor(
  a: Pick<
    StoredAccount,
    "username" | "uuid" | "type" | "skinHeadDataUrl"
  >,
): string {
  if (a.skinHeadDataUrl) return a.skinHeadDataUrl;
  const key = a.type === "microsoft" ? a.uuid : a.username;
  return `https://minotar.net/helm/${encodeURIComponent(key)}/128.png`;
}

async function headFromSkin(dataUrl: string): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const value = new Image();
    value.onload = () => resolve(value);
    value.onerror = () => reject(new Error("Не удалось прочитать PNG-скин."));
    value.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Не удалось подготовить аватар скина.");
  context.imageSmoothingEnabled = false;
  context.drawImage(image, 8, 8, 8, 8, 0, 0, 128, 128);
  context.drawImage(image, 40, 8, 8, 8, 0, 0, 128, 128);
  return canvas.toDataURL("image/png");
}

function userFacingError(error: unknown, fallback: string): string {
  const raw =
    error instanceof Error ? error.message : String(error || fallback);
  return (
    raw
      .replace(/^Error invoking remote method '[^']+':\s*/i, "")
      .replace(/^Error:\s*/i, "")
      .trim() || fallback
  );
}

export const useAccountStore = defineStore("account", () => {
  const accounts = ref<StoredAccount[]>([]);
  const activeId = ref<string | null>(null);
  const friends = ref<Friend[]>([]);
  const accountLimitError = ref("");

  const elyBusy = ref(false);
  const elyError = ref("");
  const littleSkinBusy = ref(false);
  const littleSkinError = ref("");

  const active = computed(
    () => accounts.value.find((a) => a.id === activeId.value) ?? null,
  );
  const canAddAccount = computed(() => accounts.value.length < MAX_ACCOUNTS);

  function requireAccountSlot(existingId?: string): void {
    accountLimitError.value = "";
    if (
      !existingId &&
      accounts.value.length >= MAX_ACCOUNTS
    ) {
      accountLimitError.value = "Можно добавить не больше 6 аккаунтов.";
      throw new Error(accountLimitError.value);
    }
  }
  const avatar = computed(() => (active.value ? avatarFor(active.value) : ""));
  const skinSource = computed(() => {
    if (!active.value) return null;
    return (
      active.value.skinDataUrl ||
      appearance.value?.skinDataUrl ||
      `https://minotar.net/skin/${encodeURIComponent(active.value.username)}`
    );
  });
  const appearance = ref<MinecraftAppearance | null>(null);
  const appearanceLoading = ref(false);
  const appearanceError = ref("");
  const appearanceNonce = ref(Date.now());
  const customCapes = computed(() => active.value?.customCapes ?? []);
  const activeCustomCape = computed(
    () =>
      customCapes.value.find(
        (cape) => cape.id === active.value?.activeCustomCapeId,
      ) ?? null,
  );
  const capeSource = computed(
    () => active.value?.capeHidden ? null :
      activeCustomCape.value?.dataUrl ||
      active.value?.providerCapeDataUrl ||
      appearance.value?.capes.find((cape) => cape.state === "ACTIVE")?.url ||
      null,
  );

  function avatarOf(
    a: Pick<
      StoredAccount,
      "username" | "uuid" | "type" | "skinHeadDataUrl"
    >,
  ): string {
    return avatarFor(a);
  }
  function friendAvatar(f: Friend): string {
    return `https://minotar.net/helm/${encodeURIComponent(f.uuid || f.username)}/64.png`;
  }
  function bodyOf(
    a: Pick<StoredAccount, "username" | "uuid" | "type">,
  ): string {
    const key = a.type === "microsoft" ? a.uuid : a.username;
    return `https://minotar.net/body/${encodeURIComponent(key)}/180.png?v=${appearanceNonce.value}`;
  }

  async function persist(): Promise<void> {
    await window.royale.state.saveAccounts(
      JSON.parse(JSON.stringify(accounts.value)),
      activeId.value,
    );
  }
  async function persistFriends(): Promise<void> {
    await window.royale.state.saveFriends(
      JSON.parse(JSON.stringify(friends.value)),
    );
  }

  async function hydrate(): Promise<void> {
    const s = await window.royale.state.get();
    accounts.value = s.accounts;
    activeId.value = accounts.value.some(
      (item) => item.id === s.activeAccountId,
    )
      ? s.activeAccountId
      : (accounts.value[0]?.id ?? null);
    friends.value = s.friends ?? [];
  }

  function select(id: string): void {
    if (accounts.value.some((a) => a.id === id)) {
      activeId.value = id;
      appearance.value = null;
      void loadAppearance();
      void persist();
    }
  }

  function addOffline(username: string): void {
    const name = username.trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) { accountLimitError.value = "Ник: 3–16 латинских букв, цифр или _."; return; }
    if (accounts.value.some(item => item.type === "offline" && item.username.toLowerCase() === name.toLowerCase())) { accountLimitError.value = "Этот аккаунт уже добавлен."; return; }
    try {
      requireAccountSlot();
    } catch {
      return;
    }
    const id = `offline-${Date.now()}`;
    accounts.value.push({
      id,
      username: name,
      uuid: offlineUuid(name),
      type: "offline",
      skinModel: "classic",
    });
    activeId.value = id;
    void persist();
  }

  async function addEly(input: ElyLoginInput): Promise<void> {
    elyBusy.value = true;
    elyError.value = "";
    try {
      const result = await window.royale.auth.elyLogin(input);
      const index = accounts.value.findIndex((item) => item.id === result.id);
      requireAccountSlot(index >= 0 ? result.id : undefined);
      if (index >= 0) accounts.value[index] = result;
      else accounts.value.push(result);
      activeId.value = result.id;
      await persist();
      await loadAppearance();
    } catch (error) {
      elyError.value = userFacingError(error, "Не удалось войти через Ely.by.");
      throw error;
    } finally {
      elyBusy.value = false;
    }
  }

  async function addLittleSkin(input: LittleSkinLoginInput): Promise<void> {
    littleSkinBusy.value = true;
    littleSkinError.value = "";
    try {
      const result = await window.royale.auth.littleSkinLogin(input);
      const index = accounts.value.findIndex((item) => item.id === result.id);
      requireAccountSlot(index >= 0 ? result.id : undefined);
      if (index >= 0) accounts.value[index] = result;
      else accounts.value.push(result);
      activeId.value = result.id;
      await persist();
      await loadAppearance();
    } catch (error) {
      littleSkinError.value = userFacingError(
        error,
        "Не удалось войти через LittleSkin.",
      );
      throw error;
    } finally {
      littleSkinBusy.value = false;
    }
  }

  async function setSkinModel(model: SkinModel): Promise<void> {
    if (!active.value) return;
    active.value.skinModel = model;
    await persist();
  }

  async function saveLocalSkin(
    dataUrl: string,
    model: SkinModel,
  ): Promise<void> {
    const id = active.value?.id;
    if (!id) throw new Error("Сначала выберите профиль.");
    const head = await headFromSkin(dataUrl);
    const account = accounts.value.find(item => item.id === id);
    if (!account) throw new Error("Профиль был удалён.");
    account.skinDataUrl = dataUrl;
    account.skinHeadDataUrl = head;
    account.skinModel = model;
    if (activeId.value === id) {
      appearance.value = { skinDataUrl: dataUrl, skins: appearance.value?.skins ?? [], capes: appearance.value?.capes ?? [] };
      appearanceNonce.value = Date.now();
    }
    await persist();
  }

  let appearanceRequest = 0;
  async function loadAppearance(): Promise<void> {
    const request = ++appearanceRequest;
    const selected = active.value;
    const id = selected?.id;
    appearanceError.value = "";
    if (!selected || !id) { appearance.value = null; return; }
    appearanceLoading.value = true;
    try {
      const loaded = await window.royale.appearance.get(JSON.parse(JSON.stringify(selected)));
      if (request !== appearanceRequest || activeId.value !== id) return;
      appearance.value = { ...loaded, skinDataUrl: selected.skinDataUrl || loaded.skinDataUrl };
      if (!selected.skinDataUrl && loaded.skinDataUrl) {
        const head = await headFromSkin(loaded.skinDataUrl);
        const account = accounts.value.find(item => item.id === id);
        if (account) { account.skinHeadDataUrl = head; await persist(); }
      }
    } catch (cause) {
      if (request === appearanceRequest) appearanceError.value = userFacingError(cause, "Не удалось загрузить скин.");
    } finally {
      if (request === appearanceRequest) appearanceLoading.value = false;
    }
  }

  async function uploadSkin(
    dataUrl: string,
    model = active.value?.skinModel ?? "classic",
  ): Promise<void> {
    await saveLocalSkin(dataUrl, model);
  }

  async function resetSkin(): Promise<void> {
    const current = active.value;
    if (!current) return;
    appearanceLoading.value = true;
    try {
      delete current.skinDataUrl;
      delete current.skinHeadDataUrl;
      await persist();
      await loadAppearance();
      appearanceNonce.value = Date.now();
    } finally {
      appearanceLoading.value = false;
    }
  }

  async function selectCape(capeId: string | null): Promise<void> {
    const current = active.value;
    if (!current) return;
    current.activeCustomCapeId = null;
    current.capeHidden = capeId === null;
    current.activeProviderCapeId = capeId;
    current.providerCapeDataUrl = appearance.value?.capes.find(cape => cape.id === capeId)?.url;
    if (!current.providerCapeDataUrl?.startsWith("data:image/png;base64,")) delete current.providerCapeDataUrl;
    await persist();
  }

  async function selectCustomCape(capeId: string): Promise<void> {
    const current = active.value;
    if (!current?.customCapes?.some((cape) => cape.id === capeId)) return;
    current.activeCustomCapeId = capeId;
    current.capeHidden = false;
    await persist();
  }

  async function addCustomCape(): Promise<void> {
    const current = active.value;
    if (!current) {
      appearanceError.value = "Сначала выберите профиль.";
      return;
    }
    const capes = current.customCapes ?? [];
    if (capes.length >= 5) {
      appearanceError.value = "В гардеробе может быть не больше 5 плащей.";
      return;
    }
    appearanceError.value = "";
    try {
      const dataUrl = await window.royale.appearance.pickCape();
      if (!dataUrl) return;
      const cape: CustomCape = {
        id: `cape-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: `Плащ ${capes.length + 1}`,
        dataUrl,
        createdAt: Date.now(),
      };
      current.customCapes = [...capes, cape];
      current.activeCustomCapeId = cape.id;
      current.capeHidden = false;
      await persist();
    } catch (cause) {
      appearanceError.value = userFacingError(
        cause,
        "Не удалось добавить плащ.",
      );
    }
  }

  async function editCustomCape(capeId: string): Promise<void> {
    const current = active.value;
    const capes = current?.customCapes ?? [];
    const index = capes.findIndex((cape) => cape.id === capeId);
    if (!current || index < 0) return;
    current.activeCustomCapeId = capeId;
    current.capeHidden = false;
    appearanceError.value = "";
    try {
      const dataUrl = await window.royale.appearance.pickCape();
      if (dataUrl) {
        const next = [...capes];
        next[index] = { ...next[index], dataUrl, createdAt: Date.now() };
        current.customCapes = next;
      }
      await persist();
    } catch (cause) {
      appearanceError.value = userFacingError(
        cause,
        "Не удалось заменить плащ.",
      );
    }
  }

  async function clearCustomCape(): Promise<void> {
    if (!active.value) return;
    active.value.activeCustomCapeId = null;
    await persist();
  }

  async function disableCape(): Promise<void> {
    if (!active.value) return;
    active.value.capeHidden = true;
    await persist();
  }

  async function removeCustomCape(capeId: string): Promise<void> {
    if (!active.value) return;
    active.value.customCapes = (active.value.customCapes ?? []).filter(
      (cape) => cape.id !== capeId,
    );
    if (active.value.activeCustomCapeId === capeId)
      active.value.activeCustomCapeId = null;
    await persist();
  }

  function remove(id: string): void {
    accounts.value = accounts.value.filter((a) => a.id !== id);
    if (activeId.value === id) activeId.value = accounts.value[0]?.id ?? null;
    void persist();
  }

  const refreshing = ref(false);
  async function ensureActiveSession(): Promise<StoredAccount | null> {
    const current = active.value;
    if (!current) return null;
    if (current.type === "ely") {
      refreshing.value = true;
      try {
        const refreshed = await window.royale.auth.elyRefresh(
          JSON.parse(JSON.stringify(current)),
        );
        const index = accounts.value.findIndex(
          (account) => account.id === current.id,
        );
        if (index < 0) return null;
        const latest = accounts.value[index];
        accounts.value[index] = {
          ...latest, ...refreshed,
          skinDataUrl: latest.skinDataUrl, skinHeadDataUrl: latest.skinHeadDataUrl,
          skinModel: latest.skinModel, customCapes: latest.customCapes,
          activeCustomCapeId: latest.activeCustomCapeId, capeHidden: latest.capeHidden,
          activeProviderCapeId: latest.activeProviderCapeId, providerCapeDataUrl: latest.providerCapeDataUrl,
        };
        await persist();
        return accounts.value.find(item => item.id === current.id) ?? null;
      } finally {
        refreshing.value = false;
      }
    }
    if (current.type === "littleskin") {
      refreshing.value = true;
      try {
        const refreshed = await window.royale.auth.littleSkinRefresh(
          JSON.parse(JSON.stringify(current)),
        );
        const index = accounts.value.findIndex(
          (account) => account.id === current.id,
        );
        if (index < 0) return null;
        const latest = accounts.value[index];
        accounts.value[index] = {
          ...latest, ...refreshed,
          skinDataUrl: latest.skinDataUrl, skinHeadDataUrl: latest.skinHeadDataUrl,
          skinModel: latest.skinModel, customCapes: latest.customCapes,
          activeCustomCapeId: latest.activeCustomCapeId, capeHidden: latest.capeHidden,
          activeProviderCapeId: latest.activeProviderCapeId, providerCapeDataUrl: latest.providerCapeDataUrl,
        };
        await persist();
        return accounts.value.find(item => item.id === current.id) ?? null;
      } finally {
        refreshing.value = false;
      }
    }
    return current;
  }

  // ---- friends (real, local, add-by-username) ----
  const friendBusy = ref(false);
  const friendError = ref("");

  async function addFriend(username: string): Promise<void> {
    const name = username.trim();
    if (!name) return;
    friendError.value = "";
    if (
      friends.value.some((f) => f.username.toLowerCase() === name.toLowerCase())
    ) {
      friendError.value = "Этот игрок уже в списке.";
      return;
    }
    friendBusy.value = true;
    try {
      const profile = await window.royale.friends.resolve(name);
      friends.value.push({
        id: `friend-${profile.uuid.replace(/-/g, "")}`,
        username: profile.username,
        uuid: profile.uuid,
        addedAt: Date.now(),
      });
      await persistFriends();
    } catch (e) {
      friendError.value = userFacingError(
        e,
        "Не удалось проверить профиль Minecraft.",
      );
    } finally {
      friendBusy.value = false;
    }
  }

  function removeFriend(id: string): void {
    friends.value = friends.value.filter((f) => f.id !== id);
    void persistFriends();
  }

  return {
    accounts,
    canAddAccount,
    accountLimitError,
    activeId,
    active,
    avatar,
    skinSource,
    capeSource,
    customCapes,
    activeCustomCape,
    avatarOf,
    bodyOf,
    friends,
    friendAvatar,
    friendBusy,
    friendError,
    refreshing,
    elyBusy,
    elyError,
    littleSkinBusy,
    littleSkinError,
    appearance,
    appearanceLoading,
    appearanceError,
    hydrate,
    select,
    addOffline,
    addEly,
    addLittleSkin,
    setSkinModel,
    saveLocalSkin,
    loadAppearance,
    uploadSkin,
    resetSkin,
    selectCape,
    selectCustomCape,
    addCustomCape,
    editCustomCape,
    clearCustomCape,
    disableCape,
    removeCustomCape,
    remove,
    ensureActiveSession,
    addFriend,
    removeFriend,
  };
});
