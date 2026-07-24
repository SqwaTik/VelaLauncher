import { promises as fs } from "fs";
import { extname, join } from "path";
import type { GameContentItem, GameContentSummary } from "../../shared/types";
import { gameDir } from "./store";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

async function countEntries(
  path: string,
  predicate?: (name: string) => boolean,
): Promise<number> {
  try {
    const entries = await fs.readdir(path, { withFileTypes: true });
    return entries.filter(
      (entry) =>
        !entry.name.startsWith(".") && (!predicate || predicate(entry.name)),
    ).length;
  } catch {
    return 0;
  }
}

export async function listScreenshots(limit = 30): Promise<string[]> {
  const root = join(await gameDir(), "screenshots");
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const images = await Promise.all(
      entries
        .filter(
          (entry) =>
            entry.isFile() &&
            IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase()),
        )
        .map(async (entry) => {
          const path = join(root, entry.name);
          return { path, modified: (await fs.stat(path)).mtimeMs };
        }),
    );
    return images
      .sort((a, b) => b.modified - a.modified)
      .slice(0, limit)
      .map((entry) => entry.path);
  } catch {
    return [];
  }
}

export async function contentSummary(): Promise<GameContentSummary> {
  const root = await gameDir();
  const [mods, resourcePacks, shaderPacks, worlds, screenshots, worldItems] =
    await Promise.all([
      countEntries(join(root, "mods"), (name) => name.endsWith(".jar")),
      countEntries(join(root, "resourcepacks")),
      countEntries(join(root, "shaderpacks")),
      countEntries(join(root, "saves")),
      countEntries(join(root, "screenshots"), (name) =>
        IMAGE_EXTENSIONS.has(extname(name).toLowerCase()),
      ),
      listWorldItems(join(root, "saves")),
    ]);
  return {
    mods,
    resourcePacks,
    shaderPacks,
    worlds,
    screenshots,
    worldItems,
  };
}

async function listWorldItems(root: string): Promise<GameContentItem[]> {
  try {
    const entries = (await fs.readdir(root, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .slice(0, 12);
    return Promise.all(
      entries.map(async (entry) => {
        const iconPath = join(root, entry.name, "icon.png");
        let iconDataUrl: string | null = null;
        try {
          const bytes = await fs.readFile(iconPath);
          if (bytes.length <= 2 * 1024 * 1024) {
            iconDataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
          }
        } catch {
          /* A world icon is optional. */
        }
        return { name: entry.name, iconDataUrl };
      }),
    );
  } catch {
    return [];
  }
}
