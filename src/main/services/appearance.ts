import { MojangClient } from "@xmcl/user";
import type {
  MinecraftAppearance,
  SkinModel,
  StoredAccount,
} from "../../shared/types";
import { decodeAppearancePng } from "./appearance-export";

const mojang = new MojangClient({ fetch: globalThis.fetch as never });

async function imageDataUrl(url: string, kind: "skin" | "cape" = "skin"): Promise<string | null> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (parsed.protocol === "http:") parsed.protocol = "https:";
    const response = await fetch(parsed, { signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return null;
    if (Number(response.headers.get("content-length")) > 4 * 1024 * 1024) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    const result = `data:image/png;base64,${bytes.toString("base64")}`;
    decodeAppearancePng(result, kind);
    return result;
  } catch {
    return null;
  }
}

function decodeDataUrl(dataUrl: string): Buffer {
  return decodeAppearancePng(dataUrl, "skin");
}

type ProviderTextures = {
  SKIN?: { url: string; metadata?: { model?: string } };
  CAPE?: { url: string };
};

async function fromTextures(textures: ProviderTextures, provider: string): Promise<MinecraftAppearance> {
  const skin = textures.SKIN;
  const cape = textures.CAPE;
  const [skinDataUrl, capeDataUrl] = await Promise.all([
    skin ? imageDataUrl(skin.url) : null,
    cape ? imageDataUrl(cape.url, "cape") : null,
  ]);
  return {
    skinDataUrl,
    skins: skin ? [{ id: skin.url, state: "ACTIVE", url: skin.url,
      variant: skin.metadata?.model === "slim" ? "SLIM" : "CLASSIC" }] : [],
    capes: cape && capeDataUrl ? [{ id: cape.url, state: "ACTIVE", url: capeDataUrl, alias: provider }] : [],
  };
}

async function littleSkinAppearance(
  account: StoredAccount,
): Promise<MinecraftAppearance> {
  const uuid = account.uuid.replace(/-/g, "");
  const response = await fetch(
    `https://littleskin.cn/api/yggdrasil/sessionserver/session/minecraft/profile/${encodeURIComponent(uuid)}`,
    { signal: AbortSignal.timeout(12_000) },
  );
  if (!response.ok)
    throw new Error(`LittleSkin не вернул профиль (${response.status})`);
  const profile = (await response.json()) as {
    properties?: { name: string; value: string }[];
  };
  const encoded = profile.properties?.find(
    (property) => property.name === "textures",
  )?.value;
  if (!encoded) return { skinDataUrl: null, skins: [], capes: [] };
  const textures = JSON.parse(
    Buffer.from(encoded, "base64").toString("utf8"),
  ) as {
    textures?: {
      SKIN?: { url: string; metadata?: { model?: string } };
      CAPE?: { url: string };
    };
  };
  return fromTextures(textures.textures ?? {}, "LittleSkin");
}

export async function getAppearance(
  account: StoredAccount,
): Promise<MinecraftAppearance> {
  if (account.type === "littleskin") return littleSkinAppearance(account);
  if (account.type === "ely") {
    const response = await fetch(`https://skinsystem.ely.by/textures/${encodeURIComponent(account.username)}`, {
      signal: AbortSignal.timeout(12_000),
    });
    if (response.status === 204 || response.status === 404) return { skinDataUrl: null, skins: [], capes: [] };
    if (!response.ok) throw new Error(`Ely.by не вернул внешний вид (${response.status})`);
    return fromTextures(await response.json() as ProviderTextures, "Ely.by");
  }
  if (account.type !== "microsoft" || !account.accessToken) {
    const key = encodeURIComponent(account.username);
    return {
      skinDataUrl: await imageDataUrl(`https://minotar.net/skin/${key}`),
      skins: [],
      capes: [],
    };
  }

  const profile = await mojang.getProfile(account.accessToken);
  const active =
    profile.skins.find((skin) => skin.state === "ACTIVE") ?? profile.skins[0];
  return {
    skinDataUrl: active ? await imageDataUrl(active.url) : null,
    skins: profile.skins,
    capes: (await Promise.all(profile.capes.map(async cape => ({ ...cape, url: await imageDataUrl(cape.url, "cape") })))).filter((cape): cape is typeof profile.capes[number] => Boolean(cape.url)),
  };
}

export async function uploadSkin(
  account: StoredAccount,
  dataUrl: string,
  model: SkinModel,
): Promise<MinecraftAppearance> {
  decodeDataUrl(dataUrl);
  return { skinDataUrl: dataUrl, skins: [{ id: "local", url: dataUrl, state: "ACTIVE", variant: model === "slim" ? "SLIM" : "CLASSIC" }], capes: [] };
}

export async function resetSkin(
  account: StoredAccount,
): Promise<MinecraftAppearance> {
  return getAppearance(account);
}

export async function showCape(
  account: StoredAccount,
  capeId: string,
): Promise<MinecraftAppearance> {
  const result = await getAppearance(account);
  return { ...result, capes: result.capes.map(cape => ({ ...cape, state: cape.id === capeId ? "ACTIVE" : "INACTIVE" })) };
}

export async function hideCape(
  account: StoredAccount,
): Promise<MinecraftAppearance> {
  const result = await getAppearance(account);
  return { ...result, capes: result.capes.map(cape => ({ ...cape, state: "INACTIVE" })) };
}

export function skinBufferFromDataUrl(dataUrl: string): Buffer {
  return decodeDataUrl(dataUrl);
}
