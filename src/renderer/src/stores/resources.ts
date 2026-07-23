import { defineStore } from "pinia";
import { ref } from "vue";
import type {
  InstalledMod,
  InstalledResourcePack,
  ModProject,
} from "@shared/types";

function cleanError(error: unknown): string {
  return (error instanceof Error ? error.message : String(error))
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();
}

export const useResourcesStore = defineStore("resources", () => {
  const results = ref<ModProject[]>([]);
  const installed = ref<InstalledResourcePack[]>([]);
  const totalHits = ref(0);
  const offset = ref(0);
  const loading = ref(false);
  const error = ref("");
  const notice = ref("");
  const busy = ref<Set<string>>(new Set());
  const progress = ref<Record<string, number>>({});
  const detailsCache = ref<Record<string, ModProject>>({});
  const installProgress = progress;
  let unsubscribe: (() => void) | null = null;

  function subscribe(): void {
    unsubscribe?.();
    unsubscribe = window.royale.resources.onProgress((event) => {
      if (event.done) delete progress.value[event.filename];
      else progress.value[event.filename] = event.progress;
      progress.value = { ...progress.value };
      if (event.error) error.value = event.error;
    });
  }

  async function search(
    query: string,
    category: string,
    sort: string,
    append = false,
  ): Promise<void> {
    loading.value = true;
    error.value = "";
    try {
      const nextOffset = append ? offset.value + 30 : 0;
      const response = await window.royale.resources.search(
        query,
        category,
        sort,
        nextOffset,
      );
      results.value = append
        ? [...results.value, ...response.hits]
        : response.hits;
      totalHits.value = response.total_hits;
      offset.value = response.offset;
    } catch (reason) {
      error.value = cleanError(reason);
    } finally {
      loading.value = false;
    }
  }

  async function loadInstalled(): Promise<void> {
    installed.value = await window.royale.resources.installedList();
  }

  function isInstalled(project: ModProject): boolean {
    return installed.value.some(
      (pack) => pack.projectId === project.project_id,
    );
  }

  async function loadProject(projectId: string): Promise<ModProject> {
    const cached = detailsCache.value[projectId];
    if (cached) return cached;
    const project = await window.royale.resources.project(projectId);
    detailsCache.value = { ...detailsCache.value, [projectId]: project };
    return project;
  }

  async function install(project: ModProject): Promise<void> {
    if (busy.value.has(project.project_id) || isInstalled(project)) return;
    busy.value = new Set(busy.value).add(project.project_id);
    error.value = "";
    try {
      await window.royale.resources.installProject(project.project_id);
      await loadInstalled();
    } catch (reason) {
      error.value = cleanError(reason);
    } finally {
      const next = new Set(busy.value);
      next.delete(project.project_id);
      busy.value = next;
    }
  }

  async function remove(pack: InstalledMod): Promise<void> {
    await window.royale.resources.remove(pack.filename);
    await loadInstalled();
  }

  async function removeMany(items: InstalledMod[]): Promise<void> {
    await Promise.all(
      items.map((item) => window.royale.resources.remove(item.filename)),
    );
    await loadInstalled();
  }

  async function toggle(): Promise<void> {
    // Resource packs are enabled from Minecraft's resource-pack screen.
  }

  async function toggleMany(): Promise<void> {
    // Kept for the shared catalogue UI; no file mutation is needed.
  }

  return {
    results,
    installed,
    totalHits,
    loading,
    error,
    notice,
    busy,
    progress,
    installProgress,
    detailsCache,
    subscribe,
    search,
    loadInstalled,
    isInstalled,
    loadProject,
    install,
    installLatest: install,
    remove,
    removeMany,
    toggle,
    toggleMany,
  };
});
