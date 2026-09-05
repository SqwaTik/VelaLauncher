import { build } from "esbuild";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { EventEmitter } from "node:events";
const root = await mkdtemp(join(tmpdir(), "vela-verification-"));
const state = { root, repo: resolve("."), events: [], children: [], failNext: false };
globalThis.__velaVerify = state;
const mocks = {
 electron: `const t=globalThis.__velaVerify;export const app={isPackaged:false,getAppPath:()=>t.repo,getPath:(kind)=>kind==="userData"?t.root+"/config":t.root};
 export const BrowserWindow={getAllWindows:()=>[{webContents:{send:(channel,status)=>t.events.push({channel,...status})},isVisible:()=>true,hide(){},show(){},focus(){}}]};
 export const shell={};`,
 core: `import { EventEmitter } from "node:events";import { join } from "node:path";
 const t=globalThis.__velaVerify;
 export const MinecraftFolder={from:(root)=>({getVersionJson:()=>join(root,"profile.json"),getVersionJar:()=>join(root,"game.jar")})};
 export const Version={parse:async()=>({minecraftVersion:"26.2",libraries:[]})};
 export const LaunchPrecheck={checkVersion:async()=>{},checkLibraries:async()=>{}};
 export async function launch(options){if(t.failNext){t.failNext=false;throw new Error("simulated launch failure");}const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.watcher=new EventEmitter();child.pid=100+t.children.length;child.killed=false;child.kill=()=>{child.killed=true;return true;};child.options=options;t.children.push(child);return child;}
 export const createMinecraftProcessWatcher=child=>child.watcher;`,
 installer: `export class DownloadTask{};const task=()=>({startAndWait:async()=>{}});export const installTask=task,installVersionTask=task,installResolvedLibrariesTask=task,installResolvedAssetsTask=task,installAssetsTask=task;export const getVersionList=async()=>({versions:[]});`,
 task: `export class CancelledError extends Error{};export class Task{};`,
 java: `export const detectJava=async()=>({path:"java25.exe",valid:true,majorVersion:25,version:"25.0.1"});export const installRequiredJava=detectJava;`,
 mods: `export const installProject=async()=>{};export const repairInstalledMods=async()=>{};export const isJarStructurallyValid=async()=>true;`,
 bundle: `export const installBundledClient=async()=>{};export const bundledClientUpdate=async()=>({});`,
 discord: `export const setDiscordActivity=async()=>{};`,
};
const compiled = resolve(".verification/runtime-tests.mjs");
await mkdir(resolve(".verification"), { recursive: true });
await build({
 entryPoints:["src/test/runtime.test.ts"],outfile:compiled,bundle:true,platform:"node",format:"esm",packages:"external",
 plugins:[{name:"isolated-runtime",setup(b){
  b.onResolve({filter:/^(electron|@xmcl\/core|@xmcl\/installer|@xmcl\/task)$/},args=>({path:args.path==="electron"?"electron":args.path.endsWith("core")?"core":args.path.endsWith("installer")?"installer":"task",namespace:"mock"}));
  b.onResolve({filter:/^\.\/(java|modrinth|bundled-client|discord)$/},args=>{
   if(!args.importer.endsWith("game.ts"))return;
   return {path:({"./java":"java","./modrinth":"mods","./bundled-client":"bundle","./discord":"discord"})[args.path],namespace:"mock"};
  });
  b.onLoad({filter:/.*/,namespace:"mock"},args=>({contents:mocks[args.path],loader:"js"}));
 }}]
});
await import(pathToFileURL(compiled).href);
console.log("Verification fixtures: "+root);
