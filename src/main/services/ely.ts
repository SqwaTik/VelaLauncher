import { randomUUID } from "crypto";
import type { ElyLoginInput, StoredAccount } from "../../shared/types";

const ELY_AUTH = "https://authserver.ely.by/auth";

interface ElyResponse {
  accessToken: string;
  clientToken: string;
  selectedProfile?: { id: string; name: string };
  availableProfiles?: { id: string; name: string }[];
}

async function request<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${ELY_AUTH}/${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "VelaLauncher/0.1.5",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let message = `Ely.by вернул ошибку ${response.status}`;
    try {
      const error = (await response.json()) as {
        errorMessage?: string;
        error?: string;
      };
      message = error.errorMessage || error.error || message;
    } catch {
      /* server did not return JSON */
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export async function loginEly(input: ElyLoginInput): Promise<StoredAccount> {
  const username = input.username.trim();
  if (!username || !input.password)
    throw new Error("Введите логин и пароль Ely.by");
  const result = await request<ElyResponse>("authenticate", {
    username,
    password: input.totp?.trim()
      ? `${input.password}:${input.totp.trim()}`
      : input.password,
    clientToken: randomUUID(),
    requestUser: true,
  });
  const profile = result.selectedProfile ?? result.availableProfiles?.[0];
  if (!profile) throw new Error("У аккаунта Ely.by нет игрового профиля");
  return {
    id: `ely-${profile.id}`,
    username: profile.name,
    uuid: profile.id,
    type: "ely",
    skinModel: "classic",
    accessToken: result.accessToken,
    clientToken: result.clientToken,
  };
}

export async function refreshEly(
  account: StoredAccount,
): Promise<StoredAccount> {
  if (!account.accessToken || !account.clientToken)
    throw new Error("Сессия Ely.by устарела. Войдите заново.");
  const result = await request<ElyResponse>("refresh", {
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
