import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  StoredAccount,
  AccountType,
  SkinModel,
  Friend,
  MsAuthStatus,
  MinecraftAppearance,
  ElyLoginInput,
  LittleSkinLoginInput,
} from "@shared/types";

export type { AccountType, SkinModel };
export type Account = StoredAccount;

/** Offline UUID: FNV-hash-based, stable per-name (vanilla-style offline identity). */
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
  a: Pick<StoredAccount, "username" | "uuid" | "type">,
): string {
  const key = a.type === "microsoft" ? a.uuid : a.username;
  return `https://minotar.net/helm/${encodeURIComponent(key)}/128.png`;
}

export type MsLoginState =
  "idle" | "starting" | "waiting" | "success" | "error";

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

  // ---- Microsoft browser OAuth UI state ----
  const msState = ref<MsLoginState>("idle");
  const msError = ref("");
  const elyBusy = ref(false);
  const elyError = ref("");
  const littleSkinBusy = ref(false);
  const littleSkinError = ref("");
  let msUnsub: (() => void) | null = null;

  const active = computed(
    () => accounts.value.find((a) => a.id === activeId.value) ?? null,
  );
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

  function avatarOf(
    a: Pick<StoredAccount, "username" | "uuid" | "type">,
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
    activeId.value = s.activeAccountId ?? s.accounts[0]?.id ?? null;
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
    if (!name) return;
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

  // ---- real Microsoft login (system browser + authorization code + PKCE) ----
  function beginMicrosoftLogin(): void {
    msError.value = "";
    msState.value = "starting";

    msUnsub?.();
    msUnsub = window.royale.auth.onStatus((s: MsAuthStatus) => {
      if (s.state === "waiting") {
        msState.value = "waiting";
      } else if (s.state === "success" && s.account) {
        const acc = s.account;
        // replace existing MS account with same id, else push
        const idx = accounts.value.findIndex((a) => a.id === acc.id);
        if (idx >= 0) accounts.value[idx] = acc;
        else accounts.value.push(acc);
        activeId.value = acc.id;
        msState.value = "success";
        void persist();
        void loadAppearance();
        msUnsub?.();
        msUnsub = null;
        setTimeout(() => (msState.value = "idle"), 1200);
      } else if (s.state === "cancelled") {
        msState.value = "idle";
      } else if (s.state === "error") {
        msState.value = "error";
        msError.value = s.message || "Ошибка входа Microsoft.";
        msUnsub?.();
        msUnsub = null;
      }
    });

    window.royale.auth
      .msStart()
      .then(() => {
        msState.value = "waiting";
      })
      .catch((e: unknown) => {
        msState.value = "error";
        msError.value = userFacingError(e, "Не удалось начать вход Microsoft.");
        msUnsub?.();
        msUnsub = null;
      });
  }

  function cancelMicrosoftLogin(): void {
    void window.royale.auth.msCancel();
    msUnsub?.();
    msUnsub = null;
    msState.value = "idle";
  }

  async function setSkinModel(model: SkinModel): Promise<void> {
    if (!active.value) return;
    active.value.skinModel = model;
    await persist();
    if (active.value.type === "microsoft" && appearance.value?.skinDataUrl) {
      await uploadSkin(appearance.value.skinDataUrl, model);
    }
  }

  async function saveLocalSkin(
    dataUrl: string,
    model: SkinModel,
  ): Promise<void> {
    if (!active.value) throw new Error("Сначала выберите профиль.");
    active.value.skinDataUrl = dataUrl;
    active.value.skinModel = model;
    appearance.value = { skinDataUrl: dataUrl, skins: [], capes: [] };
    appearanceNonce.value = Date.now();
    await persist();
  }

  async function loadAppearance(): Promise<void> {
    appearanceError.value = "";
    let current = active.value;
    if (!current) {
      appearance.value = null;
      return;
    }
    appearanceLoading.value = true;
    try {
      if (current.type === "offline") {
        appearance.value = {
          skinDataUrl: current.skinDataUrl ?? null,
          skins: [],
          capes: [],
        };
        return;
      }
      current = await ensureActiveSession();
      if (!current) return;
      appearance.value = await window.royale.appearance.get(
        JSON.parse(JSON.stringify(current)),
      );
    } catch (cause) {
      appearanceError.value = userFacingError(
        cause,
        "Не удалось загрузить скин.",
      );
    } finally {
      appearanceLoading.value = false;
    }
  }

  async function uploadSkin(
    dataUrl: string,
    model = active.value?.skinModel ?? "classic",
  ): Promise<void> {
    appearanceError.value = "";
    appearanceLoading.value = true;
    try {
      const current = await ensureActiveSession();
      if (!current) throw new Error("Сначала выберите аккаунт.");
      appearance.value = await window.royale.appearance.uploadSkin(
        JSON.parse(JSON.stringify(current)),
        dataUrl,
        model,
      );
      current.skinModel = model;
      const index = accounts.value.findIndex((item) => item.id === current!.id);
      if (index >= 0) accounts.value[index].skinModel = model;
      appearanceNonce.value = Date.now();
      await persist();
    } catch (cause) {
      appearanceError.value = userFacingError(
        cause,
        "Не удалось применить скин.",
      );
      throw cause;
    } finally {
      appearanceLoading.value = false;
    }
  }

  async function resetSkin(): Promise<void> {
    const current = await ensureActiveSession();
    if (!current) return;
    appearanceLoading.value = true;
    try {
      appearance.value = await window.royale.appearance.resetSkin(
        JSON.parse(JSON.stringify(current)),
      );
      appearanceNonce.value = Date.now();
    } finally {
      appearanceLoading.value = false;
    }
  }

  async function selectCape(capeId: string | null): Promise<void> {
    const current = await ensureActiveSession();
    if (!current) return;
    appearanceLoading.value = true;
    try {
      appearance.value = capeId
        ? await window.royale.appearance.showCape(
            JSON.parse(JSON.stringify(current)),
            capeId,
          )
        : await window.royale.appearance.hideCape(
            JSON.parse(JSON.stringify(current)),
          );
    } finally {
      appearanceLoading.value = false;
    }
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
        if (index >= 0) accounts.value[index] = refreshed;
        await persist();
        return refreshed;
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
        if (index >= 0) accounts.value[index] = refreshed;
        await persist();
        return refreshed;
      } finally {
        refreshing.value = false;
      }
    }
    if (current.type !== "microsoft") return current;
    if (current.accessToken && (current.expiresAt ?? 0) > Date.now() + 60_000)
      return current;

    refreshing.value = true;
    try {
      const refreshed = await window.royale.auth.msRefresh(
        JSON.parse(JSON.stringify(current)),
      );
      const index = accounts.value.findIndex((a) => a.id === current.id);
      if (index >= 0) accounts.value[index] = refreshed;
      await persist();
      return refreshed;
    } finally {
      refreshing.value = false;
    }
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
    activeId,
    active,
    avatar,
    skinSource,
    avatarOf,
    bodyOf,
    friends,
    friendAvatar,
    friendBusy,
    friendError,
    refreshing,
    msState,
    msError,
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
    beginMicrosoftLogin,
    cancelMicrosoftLogin,
    setSkinModel,
    saveLocalSkin,
    loadAppearance,
    uploadSkin,
    resetSkin,
    selectCape,
    remove,
    ensureActiveSession,
    addFriend,
    removeFriend,
  };
});
