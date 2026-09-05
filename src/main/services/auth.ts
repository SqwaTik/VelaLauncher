import { BrowserWindow, shell } from "electron";
import { createServer, type Server } from "http";
import { createHash, randomBytes } from "crypto";
import { MicrosoftAuthenticator } from "@xmcl/user";
import { MS_CLIENT_ID, MS_OAUTH, IPC } from "../../shared/constants";
import type {
  BrowserAuthInfo,
  MsAuthStatus,
  StoredAccount,
} from "../../shared/types";
import { loadState } from "./store";

const authenticator = new MicrosoftAuthenticator({ fetch: globalThis.fetch });

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface McProfile {
  id: string;
  name: string;
}

interface ActiveFlow {
  abort: AbortController;
  server: Server;
  timeout: ReturnType<typeof setTimeout>;
  getWindow: () => BrowserWindow | null;
}

let currentFlow: ActiveFlow | null = null;

async function configuredClientId(): Promise<string> {
  const fromEnvironment = process.env.ROYALE_MS_CLIENT_ID?.trim();
  if (fromEnvironment) return fromEnvironment;
  const state = await loadState();
  return state.settings.microsoftClientId.trim() || MS_CLIENT_ID.trim();
}

function emit(
  getWindow: () => BrowserWindow | null,
  status: MsAuthStatus,
): void {
  getWindow()?.webContents.send(IPC.authMsStatus, status);
}

function dashUuid(raw: string): string {
  if (raw.includes("-")) return raw;
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20)}`;
}

function base64Url(value: Buffer): string {
  return value
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function closeFlow(flow: ActiveFlow, abort = false): void {
  clearTimeout(flow.timeout);
  if (abort) flow.abort.abort();
  if (flow.server.listening) flow.server.close();
  if (currentFlow === flow) currentFlow = null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };

    return entities[character];
  });
}

function callbackPage(success: boolean, detail: string): string {
  const color = success ? "#61d878" : "#ff6574";
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Royale Launcher</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0c0f0e;color:#f4f7f5;font:16px system-ui}.box{width:min(440px,calc(100% - 40px));padding:36px;border:1px solid #26302b;border-radius:18px;background:#151a17;text-align:center;box-shadow:0 24px 70px #0008}.dot{width:54px;height:54px;margin:0 auto 18px;border-radius:16px;display:grid;place-items:center;background:${color}22;color:${color};font-size:28px}h1{font-size:24px;margin:0 0 10px}p{color:#9aa59f;line-height:1.5;margin:0}</style><div class="box"><div class="dot">${success ? "✓" : "!"}</div><h1>${success ? "Вход выполнен" : "Не удалось войти"}</h1><p>${escapeHtml(detail)}<br>Эту вкладку можно закрыть.</p></div></html>`;
}

/** Open the system browser and receive the native-app OAuth callback on localhost. */
export async function startMicrosoftLogin(
  getWindow: () => BrowserWindow | null,
): Promise<BrowserAuthInfo> {
  const clientId = await configuredClientId();
  if (!clientId) {
    throw new Error(
      "Вход Microsoft не настроен. Укажите Azure Application (Client) ID в настройках.",
    );
  }

  if (currentFlow) {
    emit(currentFlow.getWindow, { state: "cancelled" });
    closeFlow(currentFlow, true);
  }

  const abort = new AbortController();
  const verifier = base64Url(randomBytes(64));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  const expectedState = base64Url(randomBytes(24));
  let handled = false;
  let redirectUri = "";

  const server = createServer((req, res) => {
    if (handled || !req.url) {
      res.writeHead(409, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("OAuth callback already handled");
      return;
    }
    handled = true;

    const callback = new URL(req.url, redirectUri);
    const error =
      callback.searchParams.get("error_description") ||
      callback.searchParams.get("error");
    const code = callback.searchParams.get("code");
    const returnedState = callback.searchParams.get("state");

    if (error || !code || returnedState !== expectedState) {
      const message = error || "Microsoft вернул некорректный ответ.";
      res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
      res.end(callbackPage(false, message));
      emit(getWindow, { state: "error", message });
      if (currentFlow) closeFlow(currentFlow);
      return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(
      callbackPage(true, "Royale Launcher завершает подключение аккаунта."),
    );
    emit(getWindow, {
      state: "waiting",
      message: "Проверяем профиль Minecraft…",
    });

    const flow = currentFlow;
    if (flow?.server.listening) flow.server.close();
    void exchangeAuthorizationCode(
      code,
      clientId,
      redirectUri,
      verifier,
      abort.signal,
    )
      .then((token) => completeXboxChain(token, abort.signal))
      .then((account) => emit(getWindow, { state: "success", account }))
      .catch((cause: unknown) => {
        if (abort.signal.aborted) return;
        emit(getWindow, {
          state: "error",
          message: cause instanceof Error ? cause.message : String(cause),
        });
      })
      .finally(() => {
        if (flow) closeFlow(flow);
      });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Не удалось открыть локальный OAuth callback.");
  }
  redirectUri = `http://localhost:${address.port}`;

  const authorize = new URL(MS_OAUTH.authorize);
  authorize.search = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MS_OAUTH.scope,
    state: expectedState,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();

  const timeout = setTimeout(() => {
    if (!currentFlow || currentFlow.abort !== abort) return;
    emit(getWindow, {
      state: "error",
      message: "Время входа истекло. Попробуйте снова.",
    });
    closeFlow(currentFlow, true);
  }, 5 * 60_000);

  currentFlow = { abort, server, timeout, getWindow };
  emit(getWindow, {
    state: "waiting",
    message: "Завершите вход в открывшемся браузере…",
  });

  try {
    await shell.openExternal(authorize.toString());
  } catch (cause) {
    closeFlow(currentFlow, true);
    throw cause;
  }

  return { redirectUri, expiresIn: 300 };
}

export function cancelMicrosoftLogin(): void {
  if (!currentFlow) return;
  emit(currentFlow.getWindow, { state: "cancelled" });
  closeFlow(currentFlow, true);
}

async function exchangeAuthorizationCode(
  code: string,
  clientId: string,
  redirectUri: string,
  verifier: string,
  signal: AbortSignal,
): Promise<TokenResponse> {
  const response = await fetch(MS_OAUTH.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      scope: MS_OAUTH.scope,
    }),
    signal,
  });
  const token = (await response.json()) as TokenResponse;
  if (!response.ok || token.error || !token.access_token) {
    throw new Error(
      token.error_description ||
        token.error ||
        `Microsoft OAuth: ${response.status}`,
    );
  }
  return token;
}

/** MS OAuth token -> Xbox -> XSTS -> Minecraft token -> profile. */
async function completeXboxChain(
  token: TokenResponse,
  signal: AbortSignal,
): Promise<StoredAccount> {
  const { minecraftXstsResponse } = await authenticator.acquireXBoxToken(
    token.access_token!,
    signal,
  );
  const mc = await authenticator.loginMinecraftWithXBox(
    minecraftXstsResponse.DisplayClaims.xui[0].uhs,
    minecraftXstsResponse.Token,
    signal,
  );

  const profileResponse = await fetch(
    "https://api.minecraftservices.com/minecraft/profile",
    {
      headers: { Authorization: `Bearer ${mc.access_token}` },
      signal,
    },
  );
  if (!profileResponse.ok) {
    throw new Error(
      "Microsoft-вход выполнен, но у аккаунта не найдена лицензия Minecraft: Java Edition.",
    );
  }
  const profile = (await profileResponse.json()) as McProfile;

  return {
    id: `ms-${profile.id}`,
    username: profile.name,
    uuid: dashUuid(profile.id),
    type: "microsoft",
    skinModel: "classic",
    accessToken: mc.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Date.now() + (mc.expires_in ?? 86400) * 1000,
  };
}

export async function refreshMicrosoft(
  account: StoredAccount,
): Promise<StoredAccount> {
  if (!account.refreshToken)
    throw new Error("Нет refresh-токена. Войдите в Microsoft заново.");
  const clientId = await configuredClientId();
  if (!clientId)
    throw new Error("Укажите Azure Application (Client) ID в настройках.");

  const response = await fetch(MS_OAUTH.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: clientId,
      refresh_token: account.refreshToken,
      scope: MS_OAUTH.scope,
    }),
  });
  const token = (await response.json()) as TokenResponse;
  if (!response.ok || token.error || !token.access_token) {
    throw new Error(
      token.error_description || "Не удалось обновить сессию Microsoft.",
    );
  }
  const refreshed = await completeXboxChain(
    token,
    new AbortController().signal,
  );
  return {
    ...refreshed,
    id: account.id,
    skinModel: account.skinModel,
    refreshToken: refreshed.refreshToken || account.refreshToken,
  };
}
