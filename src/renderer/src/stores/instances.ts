import { computed, ref } from "vue";
import { defineStore } from "pinia";
import type { GameInstance, InstanceSource } from "@shared/types";
import { GAME } from "@shared/constants";

export const MAX_INSTANCES = 4;

function freshInstance(
  name: string,
  source: InstanceSource,
  minecraftVersion = GAME.minecraftVersion,
): GameInstance {
  const id = `instance-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    name: name.trim() || "Новый экземпляр",
    minecraftVersion: GAME.supportedMinecraftVersions.some(
      (version) => version === minecraftVersion,
    )
      ? minecraftVersion
      : GAME.minecraftVersion,
    directory: id,
    source,
    iconDataUrl: null,
    pinned: false,
    createdAt: Date.now(),
    sharedFolders: {
      worlds: false,
      resourcePacks: false,
      shaderPacks: false,
    },
  };
}

export const useInstancesStore = defineStore("instances", () => {
  const instances = ref<GameInstance[]>([]);
  const activeId = ref("");
  const error = ref("");

  const active = computed(
    () =>
      instances.value.find((item) => item.id === activeId.value) ??
      instances.value[0] ??
      null,
  );
  const ordered = computed(() =>
    [...instances.value].sort(
      (left, right) =>
        Number(right.pinned) - Number(left.pinned) ||
        left.createdAt - right.createdAt,
    ),
  );
  const canCreate = computed(() => instances.value.length < MAX_INSTANCES);

  async function hydrate(): Promise<void> {
    const state = await window.royale.state.get();
    instances.value = state.instances;
    activeId.value = state.activeInstanceId;
  }

  async function persist(): Promise<void> {
    const state = await window.royale.state.saveInstances(
      JSON.parse(JSON.stringify(instances.value)),
      activeId.value,
    );
    instances.value = state.instances;
    activeId.value = state.activeInstanceId;
  }

  async function select(id: string): Promise<boolean> {
    if (id === activeId.value) return false;
    if (!instances.value.some((item) => item.id === id)) return false;
    activeId.value = id;
    await persist();
    window.dispatchEvent(new CustomEvent("royale:instance-changed"));
    return true;
  }

  async function create(
    name: string,
    source: InstanceSource = "created",
    minecraftVersion = GAME.minecraftVersion,
  ): Promise<GameInstance | null> {
    error.value = "";
    if (!canCreate.value) {
      error.value = "Можно создать не больше 4 экземпляров.";
      return null;
    }
    const instance = freshInstance(name, source, minecraftVersion);
    instances.value.push(instance);
    activeId.value = instance.id;
    await persist();
    window.dispatchEvent(new CustomEvent("royale:instance-changed"));
    return instance;
  }

  async function update(id: string, patch: Partial<GameInstance>): Promise<void> {
    const index = instances.value.findIndex((item) => item.id === id);
    if (index < 0) return;
    instances.value[index] = {
      ...instances.value[index],
      ...patch,
      id: instances.value[index].id,
      directory: instances.value[index].directory,
    };
    await persist();
  }

  async function togglePinned(id: string): Promise<void> {
    const instance = instances.value.find((item) => item.id === id);
    if (!instance) return;
    await update(id, { pinned: !instance.pinned });
  }

  async function pickIcon(id: string): Promise<void> {
    const path = await window.royale.app.pickImage();
    if (!path) return;
    const iconDataUrl = await window.royale.app.readImage(path);
    await update(id, { iconDataUrl });
  }

  async function reveal(id: string): Promise<void> {
    await window.royale.instances.reveal(id);
  }

  async function remove(id: string): Promise<void> {
    const instance = instances.value.find((item) => item.id === id);
    if (!instance || instance.source === "default") return;
    instances.value = instances.value.filter((item) => item.id !== id);
    if (activeId.value === id)
      activeId.value = instances.value[0]?.id ?? "";
    await persist();
    window.dispatchEvent(new CustomEvent("royale:instance-changed"));
  }

  async function duplicate(id: string): Promise<GameInstance | null> {
    error.value = "";
    if (!canCreate.value) {
      error.value = "Можно создать не больше 4 экземпляров.";
      return null;
    }
    try {
      const state = await window.royale.instances.duplicate(id);
      instances.value = state.instances;
      activeId.value = state.activeInstanceId;
      window.dispatchEvent(new CustomEvent("royale:instance-changed"));
      return active.value;
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : "Не удалось создать копию.";
      return null;
    }
  }

  return {
    instances,
    activeId,
    active,
    ordered,
    canCreate,
    error,
    hydrate,
    select,
    create,
    update,
    togglePinned,
    pickIcon,
    reveal,
    remove,
    duplicate,
  };
});
