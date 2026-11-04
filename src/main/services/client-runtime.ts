import { join, delimiter } from "node:path";
import { CLIENT_VERSION } from "../../shared/targets";

export const clientRuntimeDirectory = (root: string): string => join(root, ".vela-runtime");
export const clientRuntimeJar = (root: string): string => join(clientRuntimeDirectory(root), "vela-client.jar");
/** NeoForge cannot load a jar from outside its mods folder, so the launcher owns one file there. */
export const managedNeoForgeJar = (root: string): string => join(root, "mods", `vela-client-${CLIENT_VERSION}-managed.jar`);

/** Keep user-supplied extra mods while adding the managed client exactly once (Fabric only). */
export function clientRuntimeArgs(root: string, args: string[], loader: "fabric" | "neoforge" = "fabric"): string[] {
  const prefix = "-Dfabric.addMods=";
  if (loader !== "fabric") return args;
  const previous = args.filter(arg => arg.startsWith(prefix)).at(-1)?.slice(prefix.length);
  const paths = previous ? previous.split(delimiter).filter(Boolean) : [];
  const jar = clientRuntimeJar(root);
  if (!paths.includes(jar)) paths.push(jar);
  return [...args.filter(arg => !arg.startsWith(prefix)), prefix + paths.join(delimiter)];
}
