import { spawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import { openSync, closeSync, readSync, fstatSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';

/** Java owns file handles, not launcher pipes; closing Electron cannot close Java's output. */
export function independentSpawn(logDirectory: string) {
  return (command: string, args: readonly string[] = [], options: SpawnOptions = {}): ChildProcess => {
    mkdirSync(logDirectory, { recursive: true });
    const stamp = `${Date.now()}-${randomUUID()}`;
    const paths = ['stdout', 'stderr'].map(kind => join(logDirectory, `vela-${stamp}-${kind}.log`));
    const writes = paths.map(path => openSync(path, 'a', 0o600));
    let child: ChildProcess;
    try { child = spawn(command, args, { ...options, detached: true, windowsHide: true, stdio: ['ignore', writes[0], writes[1]] }); }
    finally { writes.forEach(closeSync); }
    const reads = paths.map(path => openSync(path, 'r'));
    const streams = [new PassThrough(), new PassThrough()];
    const offsets = [0, 0];
    const decoders = [new StringDecoder('utf8'), new StringDecoder('utf8')];
    const pending = ['', ''];
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let closed = false;
    const drain = () => {
      if (closed) return;
      for (let index = 0; index < reads.length; index++) {
        // A bounded read prevents very noisy mods from blocking the UI event loop.
        let remaining = Math.min(fstatSync(reads[index]).size - offsets[index], 1024 * 1024);
        while (remaining > 0) {
          const count = readSync(reads[index], buffer, 0, Math.min(buffer.length, remaining), offsets[index]);
          if (!count) break;
          offsets[index] += count; remaining -= count;
          pending[index] += decoders[index].write(buffer.subarray(0, count));
          const newline = pending[index].lastIndexOf('\n');
          if (newline >= 0) { streams[index].write(pending[index].slice(0, newline + 1)); pending[index] = pending[index].slice(newline + 1); }
          if (pending[index].length > 64 * 1024) { streams[index].write(pending[index]); pending[index] = ''; }
        }
      }
    };
    Object.defineProperty(child, 'stdout', { value: streams[0], configurable: true });
    Object.defineProperty(child, 'stderr', { value: streams[1], configurable: true });
    const timer = setInterval(drain, 100); timer.unref();
    const finish = () => { if (closed) return; drain(); closed = true; clearInterval(timer); reads.forEach(closeSync); streams.forEach((stream,index) => stream.end(pending[index] + decoders[index].end())); };
    child.once('exit', finish); child.once('error', finish);
    child.unref();
    return child;
  };
}
