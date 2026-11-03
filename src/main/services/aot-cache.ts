import { createHash } from "node:crypto";
import { existsSync, promises as fs } from "node:fs";
import { join } from "node:path";
import { clientRuntimeDirectory } from "./client-runtime";

/**
 * Java 25 ahead-of-time cache (JEP 483/514/515): the first launch records which JDK classes the game loads, links and
 * profiles, and writes them to a cache when the game exits; later launches map that cache instead of loading, verifying
 * and linking those classes again, and start with warm method profiles.
 *
 * The JVM checks the cache itself and silently runs without it when it does not fit (another JDK, another classpath),
 * so a wrong cache only costs the speed-up. The key still covers everything the JVM compares, so that a changed setup
 * records a fresh cache instead of keeping an unusable one forever.
 */
const MAX_FAILED_RECORDINGS = 3;

interface AotState {
  key: string;
  failures: number;
}

export interface AotPlan {
  args: string[];
  /** Call when the game has exited: notes whether a recording run left a cache behind. */
  finished(): Promise<void>;
}

const noPlan: AotPlan = { args: [], finished: async () => {} };

export async function prepareAotCache(options: {
  root: string;
  javaPath: string;
  javaVersion: string;
  javaMajor: number;
  classpath: string[];
  jvmArgs: string[];
}): Promise<AotPlan> {
  if (options.javaMajor < 25) return noPlan;
  // The player set up a cache (or CDS archive) of their own: theirs wins.
  if (options.jvmArgs.some((arg) => /^-XX:(AOT|SharedArchiveFile|\+AutoCreateSharedArchive|ArchiveClassesAtExit)/.test(arg)))
    return noPlan;
  const directory = join(clientRuntimeDirectory(options.root), "aot");
  const key = createHash("sha1")
    .update(
      JSON.stringify([
        options.javaPath,
        options.javaVersion,
        options.classpath,
        // Options the cache depends on (collector, compressed pointers through the heap size).
        options.jvmArgs.filter((arg) => /^-(XX:|Xm[sx])/.test(arg)),
      ]),
    )
    .digest("hex")
    .slice(0, 16);
  const cache = join(directory, `vela-${key}.aot`);
  const stateFile = join(directory, "state.json");
  try {
    await fs.mkdir(directory, { recursive: true });
    if (existsSync(cache)) return { args: [`-XX:AOTCache=${cache}`], finished: async () => {} };

    let state: AotState = { key, failures: 0 };
    try {
      const saved = JSON.parse(await fs.readFile(stateFile, "utf8")) as AotState;
      if (saved.key === key) state = saved;
    } catch {
      // No state yet.
    }
    if (state.failures >= MAX_FAILED_RECORDINGS) return noPlan;
    // Caches of an older setup are dead weight (tens of megabytes each).
    for (const name of await fs.readdir(directory))
      if (/^vela-[0-9a-f]+\.aot$/.test(name)) await fs.rm(join(directory, name), { force: true });
    return {
      args: [`-XX:AOTCacheOutput=${cache}`],
      finished: async () => {
        // A killed game (or a crash) exits before the JVM writes the cache: try again next time, but not forever.
        state.failures = existsSync(cache) ? 0 : state.failures + 1;
        await fs.writeFile(stateFile, JSON.stringify(state)).catch(() => {});
      },
    };
  } catch {
    return noPlan;
  }
}
