import type { MinecraftProfile } from "../../shared/types";
import { fetchWithRetry } from "./network";

const USERNAME_RE = /^[A-Za-z0-9_]{3,16}$/;

function dashUuid(raw: string): string {
  if (raw.includes("-")) return raw;
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

/** Resolve a real Java Edition username in the main process (renderer-safe, no CORS). */
export async function resolveMinecraftProfile(
  username: string,
): Promise<MinecraftProfile> {
  const name = username.trim();
  if (!USERNAME_RE.test(name)) {
    throw new Error(
      "Ник должен содержать 3–16 латинских букв, цифр или символов подчёркивания.",
    );
  }

  const response = await fetchWithRetry(
    `https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`,
    {
      headers: {
        Accept: "application/json",
        "User-Agent": "VelaLauncher/0.1.6",
      },
    },
  );

  if (response.status === 404 || response.status === 204) {
    throw new Error(`Игрок «${name}» не найден.`);
  }
  if (!response.ok) {
    throw new Error(
      `Сервис профилей Minecraft временно недоступен (${response.status}).`,
    );
  }

  const profile = (await response.json()) as { id?: string; name?: string };
  if (!profile.id || !profile.name)
    throw new Error("Сервис профилей вернул неполные данные.");

  return { username: profile.name, uuid: dashUuid(profile.id) };
}
