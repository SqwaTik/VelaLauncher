import { promises as fs } from 'fs';
import { join } from 'path';

/** Minecraft 26.2 validates Vulkan requirements and falls back to OpenGL itself. */
export function initializeGraphicsPreference(options: string): string {
  if (/^preferredGraphicsBackend:"(?:opengl|vulkan)"\s*$/m.test(options)) return options;
  const line = 'preferredGraphicsBackend:"vulkan"';
  if (/^preferredGraphicsBackend:.*$/m.test(options)) return options.replace(/^preferredGraphicsBackend:.*$/m, line);
  return options + (options && !options.endsWith('\n') ? '\n' : '') + line + '\n';
}

export async function initializeGraphicsOnce(directory: string): Promise<void> {
  const marker = join(directory, '.vela-graphics-initialized');
  try { await fs.access(marker); return; } catch { /* first launch */ }
  const file = join(directory, 'options.txt');
  let previous = '';
  try { previous = await fs.readFile(file, 'utf8'); } catch (error: any) { if (error.code !== 'ENOENT') throw error; }
  const next = initializeGraphicsPreference(previous);
  if (next !== previous) {
    if (previous) await fs.writeFile(join(directory, 'options.before-vela-graphics.txt'), previous, { flag: 'wx' }).catch((error: any) => { if (error.code !== 'EEXIST') throw error; });
    const pending = join(directory, 'options.vela-graphics.tmp');
    await fs.writeFile(pending, next, 'utf8');
    await fs.rename(pending, file);
  }
  await fs.writeFile(marker, 'Minecraft validates Vulkan; OpenGL fallback enabled. User preference is preserved.\n', 'utf8');
}
