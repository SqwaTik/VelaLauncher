import { join, delimiter } from "node:path";

export const clientRuntimeDirectory = (root: string): string => join(root, ".vela-runtime");
export const clientRuntimeJar = (root: string): string => join(clientRuntimeDirectory(root), "vela-client.jar");

/** Keep user-supplied extra mods while adding the managed client exactly once. */
export function clientRuntimeArgs(root: string, args: string[]): string[] {
  const prefix = "-Dfabric.addMods=";
  const previous = args.filter(arg => arg.startsWith(prefix)).at(-1)?.slice(prefix.length);
  const paths = previous ? previous.split(delimiter).filter(Boolean) : [];
  const jar = clientRuntimeJar(root);
  if (!paths.includes(jar)) paths.push(jar);
  return [...args.filter(arg => !arg.startsWith(prefix)), prefix + paths.join(delimiter)];
}
