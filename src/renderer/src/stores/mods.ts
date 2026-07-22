import { defineStore } from "pinia";
import { ref } from "vue";
import type { ModProject, InstalledMod } from "@shared/types";

/** Modrinth browse + install state, all backed by the main-process service. */
export const useModsStore = defineStore("mods", () => {
  const results = ref<ModProject[]>([]);
  const totalHits = ref(0);
  const offset = ref(0);
  const loading = ref(false);
  const error = ref("");
  const notice = ref("");

  const installed = ref<InstalledMod[]>([]);
  const detailsCache = ref<Record<string, ModProject>>({});
  /** filename -> 0..1 download progress while installing */
  const installProgress = ref<Record<string, number>>({});
  /** set of projectIds currently being installed */
  const busy = ref<Set<string>>(new Set());

  let unsub: (() => void) | null = null;
  function subscribe(): void {
    unsub?.();
    unsub = window.royale.mods.onProgress((p) => {
      if (p.done) {
        delete installProgress.value[p.filename];
        installProgress.value = { ...installProgress.value };
      } else {
        installProgress.value = {
          ...installProgress.value,
          [p.filename]: p.progress,
        };
      }
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
      const next = append ? offset.value + 30 : 0;
      const res = await window.royale.mods.search(query, category, sort, next);
      results.value = append ? [...results.value, ...res.hits] : res.hits;
      totalHits.value = res.total_hits;
      offset.value = res.offset;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
    } finally {
      loading.value = false;
    }
  }

  async function loadInstalled(): Promise<void> {
    installed.value = await window.royale.mods.installedList();
  }

  async function loadProject(projectId: string): Promise<ModProject> {
    const cached = detailsCache.value[projectId];
    if (cached) return cached;
    const project = await window.royale.mods.project(projectId);
    detailsCache.value = { ...detailsCache.value, [projectId]: project };
    return project;
  }

  function normalized(value: string): string {
    return value.toLocaleLowerCase().replace(/[^a-z0-9а-яё]+/g, "");
  }

  function isInstalled(project: ModProject): boolean {
    const slug = normalized(project.slug);
    const title = normalized(project.title);
    return installed.value.some((mod) => {
      if (mod.projectId === project.project_id) return true;
      if (mod.projectId) return false;
      const filename = normalized(mod.filename);
      return (
        (slug.length >= 4 && filename.includes(slug)) ||
        (title.length >= 4 && filename.includes(title))
      );
    });
  }

  async function installLatest(project: ModProject): Promise<void> {
    if (busy.value.has(project.project_id) || isInstalled(project)) return;
    busy.value = new Set(busy.value).add(project.project_id);
    error.value = "";
    notice.value = "";
    try {
      await window.royale.mods.installProject(
        project.project_id,
        project.title,
      );
      await loadInstalled();
      // The card state updates immediately after refresh; a second success
      // banner only repeats the same information and shifts the catalogue.
      notice.value = "";
    } catch (e) {
      error.value = (e instanceof Error ? e.message : String(e))
        .replace(/^Error invoking remote method '[^']+':\s*/i, "")
        .replace(/^Error:\s*/i, "");
    } finally {
      const s = new Set(busy.value);
      s.delete(project.project_id);
      busy.value = s;
    }
  }

  async function toggle(mod: InstalledMod): Promise<void> {
    await window.royale.mods.toggle(mod.filename, !mod.enabled);
    await loadInstalled();
  }

  async function toggleMany(
    items: InstalledMod[],
    enabled: boolean,
  ): Promise<void> {
    await Promise.all(
      items.map((item) => window.royale.mods.toggle(item.filename, enabled)),
    );
    await loadInstalled();
  }

  async function remove(mod: InstalledMod): Promise<void> {
    await window.royale.mods.remove(mod.filename);
    await loadInstalled();
  }

  async function removeMany(items: InstalledMod[]): Promise<void> {
    await Promise.all(
      items.map((item) => window.royale.mods.remove(item.filename)),
    );
    await loadInstalled();
  }

  return {
    results,
    totalHits,
    offset,
    loading,
    error,
    notice,
    installed,
    detailsCache,
    installProgress,
    busy,
    subscribe,
    search,
    loadInstalled,
    loadProject,
    isInstalled,
    installLatest,
    toggle,
    toggleMany,
    remove,
    removeMany,
  };
});
