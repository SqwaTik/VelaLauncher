import { app } from "electron";
import type { LauncherUpdateInfo } from "../../shared/types";

const REPOSITORY = "SqwaTik/RoyaleLauncher";
const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`;
const USER_AGENT = "SqwaTik/RoyaleLauncher";

interface LatestRelease {
  tag_name?: string;
  html_url?: string;
  published_at?: string;
  assets?: Array<{
    name?: string;
    browser_download_url?: string;
  }>;
}

function normalizedParts(version: string): number[] {
  return version
    .replace(/^v/i, "")
    .split(/[.-]/)
    .slice(0, 4)
    .map((part) => Number.parseInt(part, 10) || 0);
}

function isNewer(latest: string, current: string): boolean {
  const left = normalizedParts(latest);
  const right = normalizedParts(current);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

export async function checkLauncherUpdate(): Promise<LauncherUpdateInfo> {
  const currentVersion = app.getVersion();
  const response = await fetch(
    `https://api.github.com/repos/${REPOSITORY}/releases/latest`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": USER_AGENT,
      },
    },
  );
  if (response.status === 404) {
    return {
      currentVersion,
      latestVersion: currentVersion,
      available: false,
      releaseUrl: RELEASES_URL,
      downloadUrl: null,
      publishedAt: null,
    };
  }
  if (!response.ok)
    throw new Error(`Сервер обновлений ответил кодом ${response.status}.`);

  const release = (await response.json()) as LatestRelease;
  const latestVersion = (release.tag_name || currentVersion).replace(/^v/i, "");
  const installer = release.assets?.find(
    (asset) =>
      /\.exe$/i.test(asset.name || "") &&
      /(setup|installer|royale)/i.test(asset.name || ""),
  );
  return {
    currentVersion,
    latestVersion,
    available: isNewer(latestVersion, currentVersion),
    releaseUrl: release.html_url || RELEASES_URL,
    downloadUrl: installer?.browser_download_url || null,
    publishedAt: release.published_at || null,
  };
}
