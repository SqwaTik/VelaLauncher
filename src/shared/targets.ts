/**
 * Every Minecraft version and loader Vela is built for. An instance picks one; installation, Java, the bundled Vela
 * build, Modrinth filters and the launch arguments all follow it.
 */

export type LoaderId = "fabric" | "neoforge";

export interface GameTarget {
  /** Stable key, also the Vela build name: "26.2-fabric", "1.21.4-neoforge". */
  key: string;
  minecraftVersion: string;
  loader: LoaderId;
  /** Fabric Loader or NeoForge version. */
  loaderVersion: string;
  /** Fabric API version (Fabric only; NeoForge builds answer Fabric API calls themselves). */
  fabricApi: string | null;
  /** Java feature release the game runs on; newer LTS releases are not used for 1.21.x. */
  javaMajor: number;
  /** The Vela jar shipped in the launcher's resources (`clients/<file>`). */
  clientFile: string;
  /** Mods compiled into this Vela build: a separate copy would clash, so the launcher never installs one. */
  bundledMods: readonly string[];
  /** Release line shown in the picker. */
  channel: "current" | "classic";
  /** Short note shown under the version in the picker. */
  note: string;
}

export const CLIENT_VERSION = "0.2.1";
export const FABRIC_LOADER = "0.20.1";

const fabric = (
  minecraftVersion: string,
  fabricApi: string,
  javaMajor: number,
  bundledMods: readonly string[],
  channel: GameTarget["channel"],
  note: string,
): GameTarget => ({
  key: `${minecraftVersion}-fabric`,
  minecraftVersion,
  loader: "fabric",
  loaderVersion: FABRIC_LOADER,
  fabricApi,
  javaMajor,
  clientFile: `vela-client-${minecraftVersion}-fabric.jar`,
  bundledMods,
  channel,
  note,
});

const neoforge = (
  minecraftVersion: string,
  loaderVersion: string,
  javaMajor: number,
  channel: GameTarget["channel"],
  note: string,
): GameTarget => ({
  key: `${minecraftVersion}-neoforge`,
  minecraftVersion,
  loader: "neoforge",
  loaderVersion,
  fabricApi: null,
  javaMajor,
  clientFile: `vela-client-${minecraftVersion}-neoforge.jar`,
  bundledMods: ["ias", "bobby"],
  channel,
  note,
});

const FULL = ["ias", "modmenu", "bobby"] as const;
const LITE = ["ias", "bobby"] as const;

export const TARGETS: readonly GameTarget[] = [
  fabric("26.2", "0.159.0+26.2", 25, FULL, "current", "Основная версия Vela"),
  neoforge("26.2", "26.2.0.93", 25, "current", "Основная версия Vela"),
  fabric("26.3", "0.165.2+26.3", 25, FULL, "current", "Новейший Minecraft"),
  neoforge("26.3", "26.3.0.101", 25, "current", "Новейший Minecraft"),
  fabric("1.21.11", "0.141.6+1.21.11", 21, FULL, "classic", "Последняя 1.21"),
  neoforge("1.21.11", "21.11.48", 21, "classic", "Последняя 1.21"),
  fabric("1.21.5", "0.128.2+1.21.5", 21, LITE, "classic", "Весенний выпуск 1.21"),
  neoforge("1.21.5", "21.5.101", 21, "classic", "Весенний выпуск 1.21"),
  fabric("1.21.4", "0.119.4+1.21.4", 21, LITE, "classic", "Популярная PvP-версия"),
  neoforge("1.21.4", "21.4.161", 21, "classic", "Популярная PvP-версия"),
];

export const DEFAULT_TARGET = TARGETS[0];

/** Minecraft versions in picker order (newest line first, as listed above). */
export const TARGET_VERSIONS: readonly string[] = [...new Set(TARGETS.map((target) => target.minecraftVersion))];

export const LOADERS: Record<LoaderId, { id: LoaderId; title: string; short: string }> = {
  fabric: { id: "fabric", title: "Fabric", short: "Fabric" },
  neoforge: { id: "neoforge", title: "NeoForge", short: "NeoForge" },
};

export function normalizeLoader(value: unknown): LoaderId {
  return value === "neoforge" ? "neoforge" : "fabric";
}

/** The target for a version and loader; unknown pairs fall back to the same loader on 26.2, then to 26.2 Fabric. */
export function findTarget(minecraftVersion: string | null | undefined, loader: unknown): GameTarget {
  const wanted = normalizeLoader(loader);
  return (
    TARGETS.find((target) => target.minecraftVersion === minecraftVersion && target.loader === wanted) ??
    TARGETS.find((target) => target.minecraftVersion === DEFAULT_TARGET.minecraftVersion && target.loader === wanted) ??
    DEFAULT_TARGET
  );
}

export function targetOf(instance: { minecraftVersion?: string | null; loader?: unknown } | null | undefined): GameTarget {
  return findTarget(instance?.minecraftVersion, instance?.loader);
}

export function isSupportedTarget(minecraftVersion: string | null | undefined, loader: unknown): boolean {
  const wanted = normalizeLoader(loader);
  return TARGETS.some((target) => target.minecraftVersion === minecraftVersion && target.loader === wanted);
}

/** "1.21.4 · NeoForge". */
export function targetLabel(target: GameTarget): string {
  return `${target.minecraftVersion} · ${LOADERS[target.loader].title}`;
}

/** The launcher version id of the installed loader profile. */
export function loaderVersionId(target: GameTarget): string {
  return target.loader === "fabric"
    ? `${target.minecraftVersion}-fabric-${target.loaderVersion}`
    : `neoforge-${target.loaderVersion}`;
}
