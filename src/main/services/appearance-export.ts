import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { join, resolve } from "node:path";
import type { StoredAccount } from "../../shared/types";

const MAX_PNG_BYTES = 4 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const queues = new Map<string, Promise<string>>();

/** Validate before decoding in the game, including the dimensions in the PNG header. */
export function decodeAppearancePng(dataUrl: string, kind: "skin" | "cape"): Buffer {
  if (typeof dataUrl !== "string" || dataUrl.length > MAX_PNG_BYTES * 1.4) {
    throw new Error("PNG слишком большой (максимум 4 МБ).");
  }
  const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match) throw new Error("Выберите PNG-изображение.");
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length < 33 || bytes.length > MAX_PNG_BYTES || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
    || bytes.toString("ascii", 12, 16) !== "IHDR") throw new Error("Повреждённый PNG-файл.");
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const valid = kind === "skin" ? width === 64 && (height === 64 || height === 32)
    : width >= 64 && width <= 1024 && height === width / 2 && (width & (width - 1)) === 0;
  if (!valid) throw new Error(kind === "skin" ? "Скин должен быть 64×64 или 64×32."
    : "Плащ должен быть PNG 64×32, 128×64, 256×128, 512×256 или 1024×512.");
  return bytes;
}

interface AppearanceEntry {
  uuid: string;
  offlineUuid?: string;
  model: "classic" | "slim";
  skinFile?: string;
  capeFile?: string;
  capeHidden: boolean;
}

function normalizedUuid(value: string): string | null {
  const raw = value.replace(/-/g, "");
  if (!/^[a-f\d]{32}$/i.test(raw)) return null;
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`.toLowerCase();
}

function offlineUuid(username: string): string {
  const bytes = createHash("md5").update(`OfflinePlayer:${username}`, "utf8").digest();
  bytes[6] = (bytes[6] & 0x0f) | 0x30;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return normalizedUuid(bytes.toString("hex"))!;
}

async function writeAsset(root: string, dataUrl: string, kind: "skin" | "cape"): Promise<string> {
  const bytes = decodeAppearancePng(dataUrl, kind);
  const name = `${createHash("sha256").update(bytes).digest("hex")}.png`;
  // Content-addressed names keep old manifests usable during a concurrent save.
  await fs.writeFile(join(root, name), bytes, { flag: "wx" }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  return name;
}

/** Public cosmetic fields only: credentials must never reach this manifest. */
async function exportManifest(root: string, accounts: readonly StoredAccount[]): Promise<string> {
  await fs.mkdir(root, { recursive: true });
  const entries: AppearanceEntry[] = [];
  for (const account of accounts) {
    const uuid = normalizedUuid(account.uuid);
    if (!uuid) continue;
    const cape = account.capeHidden ? undefined : account.customCapes?.find(item => item.id === account.activeCustomCapeId);
    const capeData = cape?.dataUrl || (!account.capeHidden ? account.providerCapeDataUrl : undefined);
    if (!account.skinDataUrl && !capeData && !account.capeHidden) continue;
    entries.push({
      uuid,
      ...(account.type === "offline" ? { offlineUuid: offlineUuid(account.username) } : {}),
      model: account.skinModel === "slim" ? "slim" : "classic",
      ...(account.skinDataUrl ? { skinFile: await writeAsset(root, account.skinDataUrl, "skin") } : {}),
      ...(capeData ? { capeFile: await writeAsset(root, capeData, "cape") } : {}),
      capeHidden: account.capeHidden === true,
    });
  }
  const manifestPath = join(root, "manifest.json");
  const temporary = join(root, `manifest-${randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, JSON.stringify({ version: 1, entries }), { flag: "wx" });
    await fs.rename(temporary, manifestPath);
  } finally {
    await fs.rm(temporary, { force: true });
  }
  return manifestPath;
}

/** Serializes saves so a slower older export cannot replace a newer selection. */
export function syncAppearanceManifest(rootDir: string, accounts: readonly StoredAccount[]): Promise<string> {
  const root = resolve(rootDir, "appearance");
  const snapshot = structuredClone(accounts);
  const pending = (queues.get(root) ?? Promise.resolve("")).catch(() => "")
    .then(() => exportManifest(root, snapshot));
  queues.set(root, pending);
  void pending.finally(() => { if (queues.get(root) === pending) queues.delete(root); }).catch(() => undefined);
  return pending;
}
