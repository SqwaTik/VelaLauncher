import { Client } from "discord-rpc";
import { DISCORD_APP_ID } from "../../shared/constants";
import { loadState } from "./store";

let client: Client | null = null;
let ready = false;
let connecting = false;
let desiredActivity: { details: string; state?: string; startedAt?: number } = {
  details: "В главном меню",
};

async function publish(): Promise<void> {
  if (!client || !ready) return;
  const state = await loadState();
  if (!state.settings.discordRpc) {
    await client.clearActivity().catch(() => undefined);
    return;
  }
  await client
    .setActivity({
      details: desiredActivity.details,
      state: desiredActivity.state,
      startTimestamp: desiredActivity.startedAt
        ? new Date(desiredActivity.startedAt)
        : undefined,
      instance: false,
      buttons: [
        {
          label: "Vela",
          url: "https://github.com/SqwaTik/VelaLauncher",
        },
      ],
    })
    .catch(() => undefined);
}

export async function initDiscord(): Promise<void> {
  if (client || connecting) return;
  const state = await loadState();
  if (!state.settings.discordRpc) return;
  connecting = true;
  const rpc = new Client({ transport: "ipc" });
  client = rpc;
  rpc.on("ready", () => {
    ready = true;
    connecting = false;
    void publish();
  });
  rpc.on("disconnected", () => {
    ready = false;
    connecting = false;
    client = null;
  });
  try {
    await rpc.login({ clientId: DISCORD_APP_ID });
  } catch {
    connecting = false;
    ready = false;
    client = null;
  }
}

export async function setDiscordActivity(activity: {
  details: string;
  state?: string;
  startedAt?: number;
}): Promise<void> {
  desiredActivity = activity;
  if (!client) await initDiscord();
  await publish();
}

export async function syncDiscordSetting(): Promise<void> {
  const state = await loadState();
  if (state.settings.discordRpc) {
    await initDiscord();
    await publish();
  } else if (client && ready) {
    await client.clearActivity().catch(() => undefined);
  }
}

export async function destroyDiscord(): Promise<void> {
  if (client) await client.destroy().catch(() => undefined);
  client = null;
  ready = false;
  connecting = false;
}
