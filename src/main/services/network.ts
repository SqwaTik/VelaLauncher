import { Agent, interceptors, type Dispatcher } from "undici";

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const RETRYABLE_CODES = [
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "ENETDOWN",
  "ENETUNREACH",
  "EHOSTDOWN",
  "EHOSTUNREACH",
  "EPIPE",
  "ETIMEDOUT",
  "ECONNABORTED",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
];

/**
 * Shared dispatcher for every large launcher download. The stock downloader
 * gives a new connection only ten seconds, which is too strict for a busy CDN
 * or a slow DNS/IPv6 route. Requests are retried and byte ranges resume from
 * the last received offset whenever the server supports them.
 */
export const resilientDownloadDispatcher: Dispatcher = new Agent({
  connections: 8,
  connect: { timeout: 30_000 },
  headersTimeout: 90_000,
  bodyTimeout: 90_000,
  keepAliveTimeout: 10_000,
  keepAliveMaxTimeout: 60_000,
  autoSelectFamily: true,
  autoSelectFamilyAttemptTimeout: 300,
}).compose(
  interceptors.retry({
    maxRetries: 6,
    minTimeout: 800,
    maxTimeout: 12_000,
    timeoutFactor: 1.8,
    retryAfter: true,
    methods: ["GET", "HEAD", "OPTIONS"],
    statusCodes: [...RETRYABLE_STATUS],
    errorCodes: RETRYABLE_CODES,
  }),
  interceptors.redirect({ maxRedirections: 8 }),
);

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function errorCode(error: unknown): string {
  if (!error || typeof error !== "object") return "";
  if ("code" in error && typeof error.code === "string") return error.code;
  if ("cause" in error) return errorCode(error.cause);
  return "";
}

export function isTransientNetworkError(error: unknown): boolean {
  const code = errorCode(error);
  if (RETRYABLE_CODES.includes(code)) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /fetch failed|network|socket|timed?\s*out|timeout|aborted|connection|dns/i.test(
    message,
  );
}

/**
 * Reliable fetch for small manifests and for the initial response of streamed
 * downloads. The 45-second limit applies only while waiting for HTTP headers;
 * after they arrive, the dispatcher uses an idle-body timeout instead of a
 * total download deadline.
 */
export async function fetchWithRetry(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1] = {},
  attempts = 5,
): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const forwardAbort = (): void => controller.abort(init?.signal?.reason);
    init?.signal?.addEventListener("abort", forwardAbort, { once: true });
    const timeout = setTimeout(
      () => controller.abort(new Error("HTTP headers timeout")),
      45_000,
    );
    try {
      const response = await fetch(input, {
        ...init,
        signal: controller.signal,
        dispatcher: resilientDownloadDispatcher,
      } as RequestInit & { dispatcher: Dispatcher });
      // Do not put an absolute time limit on the response body: a valid Java
      // archive or launcher update can take much longer than 45 seconds.
      clearTimeout(timeout);
      init?.signal?.removeEventListener("abort", forwardAbort);
      if (!RETRYABLE_STATUS.has(response.status) || attempt === attempts)
        return response;
      await response.body?.cancel().catch(() => undefined);
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      clearTimeout(timeout);
      init?.signal?.removeEventListener("abort", forwardAbort);
      lastError = error;
      if (init?.signal?.aborted || !isTransientNetworkError(error)) throw error;
      if (attempt === attempts) break;
    }

    await wait(Math.min(6_000, 650 * 1.8 ** (attempt - 1)));
  }

  throw new Error(
    "Сервер загрузки временно не отвечает. Запустите загрузку ещё раз — уже готовые файлы сохранятся.",
    { cause: lastError },
  );
}

export const resilientFetch = fetchWithRetry as typeof fetch;
