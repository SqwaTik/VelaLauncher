import { build } from 'esbuild';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import assert from 'node:assert/strict';

const root=await mkdtemp(join(tmpdir(),'vela-process-survival-'));
const bundle=resolve('.verification/independent-process.mjs');
await build({entryPoints:['src/main/services/independent-process.ts'],outfile:bundle,bundle:true,platform:'node',format:'esm'});
const marker=join(root,'survived.txt');
const childCode=`console.log('before-parent-exit');setTimeout(()=>{console.log('after-parent-exit');require('node:fs').writeFileSync(${JSON.stringify(marker)},'survived');},1200);`;
const parentFile=join(root,'parent.mjs');
await writeFile(parentFile,`import {independentSpawn} from ${JSON.stringify(pathToFileURL(bundle).href)};const child=independentSpawn(${JSON.stringify(root)})(process.execPath,['-e',${JSON.stringify(childCode)}]);console.log(child.pid);`);
const parent=spawn(process.execPath,[parentFile],{stdio:['ignore','pipe','pipe'],windowsHide:true});
let output='',error='';parent.stdout.on('data',c=>output+=c);parent.stderr.on('data',c=>error+=c);
const deadline=setTimeout(()=>parent.kill(),5000);
const [exit]=await once(parent,'exit');clearTimeout(deadline);
assert.equal(exit,0,error);assert.match(output.trim(),/^\d+$/);
let value='';for(let attempt=0;attempt<40&&!value;attempt++){value=await readFile(marker,'utf8').catch(()=> '');if(!value)await new Promise(r=>setTimeout(r,100));}
assert.equal(value,'survived','Child must continue after launcher parent exits');
const {readdir}=await import('node:fs/promises');const files=await readdir(root);
const log=files.find(f=>f.endsWith('-stdout.log'));
const text=await readFile(join(root,log),'utf8');assert.match(text,/before-parent-exit/);assert.match(text,/after-parent-exit/);
console.log('PASS detached child survives parent exit and keeps writing both phases to its own log. Minecraft was not started.');
