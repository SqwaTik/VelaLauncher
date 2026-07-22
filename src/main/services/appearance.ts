import { MojangClient } from "@xmcl/user";
import type {
  MinecraftAppearance,
  SkinModel,
  StoredAccount,
} from "../../shared/types";

const mojang = new MojangClient({ fetch: globalThis.fetch as never });

function requireMicrosoft(account: StoredAccount): string {
  if (account.type !== "microsoft" || !account.accessToken) {
    throw new Error(
      "Загрузка скинов и управление плащами доступны для Microsoft-аккаунта.",
    );
  }
  return account.accessToken;
}

async function imageDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    const contentType = response.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function decodeDataUrl(dataUrl: string): Buffer {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) throw new Error("Редактор может загрузить только PNG-скин.");
  const buffer = Buffer.from(match[1], "base64");
  if (!buffer.length || buffer.length > 4 * 1024 * 1024) {
    throw new Error("Некорректный или слишком большой PNG-файл.");
  }
  return buffer;
}

async function littleSkinAppearance(
  account: StoredAccount,
): Promise<MinecraftAppearance> {
  const uuid = account.uuid.replace(/-/g, "");
  const response = await fetch(
    `https://littleskin.cn/api/yggdrasil/sessionserver/session/minecraft/profile/${encodeURIComponent(uuid)}`,
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
  const skin = textures.textures?.SKIN;
  const cape = textures.textures?.CAPE;
  return {
    skinDataUrl: skin ? await imageDataUrl(skin.url) : null,
    skins: skin
      ? [
          {
            id: skin.url,
            state: "ACTIVE",
            url: skin.url,
            variant: skin.metadata?.model === "slim" ? "SLIM" : "CLASSIC",
          },
        ]
      : [],
    capes: cape
      ? [{ id: cape.url, state: "ACTIVE", url: cape.url, alias: "LittleSkin" }]
      : [],
  };
}

export async function getAppearance(
  account: StoredAccount,
): Promise<MinecraftAppearance> {
  if (account.type === "littleskin") return littleSkinAppearance(account);
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
    capes: profile.capes,
  };
}

export async function uploadSkin(
  account: StoredAccount,
  dataUrl: string,
  model: SkinModel,
): Promise<MinecraftAppearance> {
  const token = requireMicrosoft(account);
  await mojang.setSkin("royale-skin.png", decodeDataUrl(dataUrl), model, token);
  return getAppearance({ ...account, skinModel: model });
}

export async function resetSkin(
  account: StoredAccount,
): Promise<MinecraftAppearance> {
  const token = requireMicrosoft(account);
  await mojang.resetSkin(token);
  return getAppearance(account);
}

export async function showCape(
  account: StoredAccount,
  capeId: string,
): Promise<MinecraftAppearance> {
  const token = requireMicrosoft(account);
  await mojang.showCape(capeId, token);
  return getAppearance(account);
}

export async function hideCape(
  account: StoredAccount,
): Promise<MinecraftAppearance> {
  const token = requireMicrosoft(account);
  await mojang.hideCape(token);
  return getAppearance(account);
}

export function skinBufferFromDataUrl(dataUrl: string): Buffer {
  return decodeDataUrl(dataUrl);
}
