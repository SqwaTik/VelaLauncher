import { randomUUID } from "crypto";
import type { LittleSkinLoginInput, StoredAccount } from "../../shared/types";

const AUTH_ROOT = "https://littleskin.cn/api/yggdrasil/authserver";

interface YggdrasilProfile {
  id: string;
  name: string;
}
interface YggdrasilResponse {
  accessToken: string;
  clientToken: string;
  selectedProfile?: YggdrasilProfile;
  availableProfiles?: YggdrasilProfile[];
}

async function request(
  path: "authenticate" | "refresh",
  body: unknown,
): Promise<YggdrasilResponse> {
  const response = await fetch(`${AUTH_ROOT}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "VelaLauncher/0.1.6",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `LittleSkin вернул ошибку ${response.status}`;
    try {
      const value = (await response.json()) as {
        errorMessage?: string;
        error?: string;
      };
      message = value.errorMessage || value.error || message;
    } catch {
      /* non-JSON error */
    }
    throw new Error(message);
  }
  return response.json() as Promise<YggdrasilResponse>;
}

export async function loginLittleSkin(
  input: LittleSkinLoginInput,
): Promise<StoredAccount> {
  const username = input.username.trim();
  if (!username || !input.password)
    throw new Error("Введите email и пароль LittleSkin");
  const clientToken = randomUUID();
  let result = await request("authenticate", {
    agent: { name: "Minecraft", version: 1 },
    username,
    password: input.password,
    clientToken,
    requestUser: true,
  });
  const profile = result.selectedProfile ?? result.availableProfiles?.[0];
  if (!profile) throw new Error("У аккаунта LittleSkin нет игрового профиля");
  if (!result.selectedProfile) {
    result = await request("refresh", {
      accessToken: result.accessToken,
      clientToken: result.clientToken,
      selectedProfile: profile,
      requestUser: true,
    });
  }
  const selected = result.selectedProfile ?? profile;
  return {
    id: `littleskin-${selected.id}`,
    username: selected.name,
    uuid: selected.id,
    type: "littleskin",
    skinModel: "classic",
    accessToken: result.accessToken,
    clientToken: result.clientToken,
  };
}

export async function refreshLittleSkin(
  account: StoredAccount,
): Promise<StoredAccount> {
  if (!account.accessToken || !account.clientToken)
    throw new Error("Сессия LittleSkin устарела. Войдите заново.");
  const result = await request("refresh", {
    accessToken: account.accessToken,
    clientToken: account.clientToken,
    selectedProfile: {
      id: account.uuid.replace(/-/g, ""),
      name: account.username,
    },
    requestUser: true,
  });
  return {
    ...account,
    username: result.selectedProfile?.name ?? account.username,
    uuid: result.selectedProfile?.id ?? account.uuid,
    accessToken: result.accessToken,
    clientToken: result.clientToken,
  };
}
