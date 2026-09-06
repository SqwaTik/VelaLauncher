import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { parseJavaVersion } from "../main/services/java";
import { loadState, saveSettings, saveAccounts, migrateLegacyStorage, recordPlaytime } from "../main/services/store";
import { decodeAppearancePng, syncAppearanceManifest } from "../main/services/appearance-export";
import { bundledClientUpdate, installBundledClient } from "../main/services/bundled-client";
import { launchGame, cancelLaunch, gameOperationBusy } from "../main/services/game";
import { isTransientNetworkError } from "../main/services/network";

const t=(globalThis as any).__velaVerify;
let checks=0;
async function check(name:string, fn:()=>unknown){await fn();checks++;console.log("PASS "+name);}
await check("Java 25 and Java 21 are distinguished",()=>{
 assert.equal(parseJavaVersion('openjdk version "25.0.1"')?.major,25);
 assert.equal(parseJavaVersion('java version "21.0.8"')?.major,21);
 assert.equal(parseJavaVersion('java version "1.8.0_471"')?.major,8);
 assert.equal(parseJavaVersion("garbage"),null);
});
await check("download timeouts and broken sockets are retryable",()=>{
 assert.equal(isTransientNetworkError(Object.assign(new Error("connect timeout"),{code:"UND_ERR_CONNECT_TIMEOUT"})),true);
 assert.equal(isTransientNetworkError(new Error("socket disconnected")),true);
 assert.equal(isTransientNetworkError(new Error("invalid archive format")),false);
});
await check("PNG rejects malformed and oversized dimensions",()=>{
 assert.throws(()=>decodeAppearancePng("data:text/plain;base64,AAAA","skin"));
 const header=Buffer.alloc(33);Buffer.from([137,80,78,71,13,10,26,10]).copy(header);header.write("IHDR",12);header.writeUInt32BE(90000,16);header.writeUInt32BE(32,20);
 assert.throws(()=>decodeAppearancePng("data:image/png;base64,"+header.toString("base64"),"cape"));
});
await check("fresh storage uses .vela and 26.2",async()=>{
 const state=await loadState();assert.equal(state.settings.storagePath,join(t.root,".vela"));assert.equal(state.instances[0].minecraftVersion,"26.2");
 await saveSettings({...state.settings,showLog:false,quickLaunch:true});
});
await check("legacy migration preserves both source and an existing target",async()=>{
 const legacy=join(t.root,"legacy"),target=join(t.root,"target");
 await fs.mkdir(legacy);await fs.mkdir(target);await fs.writeFile(join(legacy,"world.txt"),"old-world");await fs.writeFile(join(target,"new.txt"),"existing");
 assert.equal(await migrateLegacyStorage(legacy,legacy,target),target);
 assert.equal(await fs.readFile(join(target,"world.txt"),"utf8"),"old-world");
 assert.equal(await fs.readFile(join(legacy,"world.txt"),"utf8"),"old-world");
 const backup=(await fs.readdir(t.root)).find(name=>name.startsWith("target-before-migration-"))!;
 assert.equal(await fs.readFile(join(t.root,backup,"new.txt"),"utf8"),"existing");
 assert.equal(await migrateLegacyStorage(join(t.root,"custom"),legacy,target),join(t.root,"custom"));
});
const account={id:"offline-one",username:"TestUser",uuid:"00112233-4455-6677-8899-aabbccddeeff",type:"offline" as const,skinModel:"classic" as const,accessToken:"sensitive-test-token",refreshToken:"sensitive-refresh",capeHidden:true};
await check("cosmetic manifest never contains credentials and supports every provider",async()=>{
 const root=join(t.root,"appearance-test");await syncAppearanceManifest(root,[account,{...account,id:"ely",type:"ely"},{...account,id:"little",type:"littleskin"},{...account,id:"ms",type:"microsoft"}]);
 const text=await fs.readFile(join(root,"appearance","manifest.json"),"utf8");
 assert(!text.includes("sensitive"));assert(!text.includes("Token"));assert.equal(JSON.parse(text).entries.length,4);
 await saveAccounts([account],account.id);
 const state=await loadState();assert((await fs.readFile(join(state.settings.storagePath,"appearance","manifest.json"),"utf8")).includes("capeHidden"));
});
await check("bundle installs Vela 0.1.1 and IAS 26.2 and repairs modified bytes",async()=>{
 const root=join(t.root,"bundle");
 await installBundledClient(root);
 assert.equal((await bundledClientUpdate(root)).available,false);
 const jars=await fs.readdir(join(root,"mods"));
 assert(jars.some(name=>name.includes("vela-client-0.1.1")));assert(jars.includes("IAS-9.0.7+26.2-fabric.jar"));
 const vela=jars.find(name=>name.startsWith("vela-client"))!;
 await fs.writeFile(join(root,"mods",vela),"broken");
 assert.equal((await bundledClientUpdate(root)).available,true);
 await installBundledClient(root);assert.equal((await bundledClientUpdate(root)).available,false);
 assert((await fs.readdir(join(root,"mod-backups"))).length>0);
});
const state=await loadState();await fs.mkdir(state.settings.storagePath,{recursive:true});
await fs.writeFile(join(state.settings.storagePath,"profile.json"),JSON.stringify({velaProfileVersion:1,inheritsFrom:"26.2"}));
await fs.writeFile(join(state.settings.storagePath,"game.jar"),"test fixture");
await check("second process starts, first exit does not hide the second",async()=>{
 await launchGame(account);assert(gameOperationBusy());assert.equal(t.children.length,1);
 await assert.rejects(()=>launchGame(account),/уже выполняется/);
 const first=t.children[0];first.watcher.emit("minecraft-window-ready");assert(!gameOperationBusy());
 await launchGame(account);const second=t.children[1];second.watcher.emit("minecraft-window-ready");
 assert.equal(t.events.at(-1).runningCount,2);assert.equal(first.killed,false);
 first.watcher.emit("minecraft-exit",{code:0});
 assert.equal(t.events.at(-1).runningCount,1);assert.equal(second.killed,false);
 second.watcher.emit("minecraft-exit",{code:0});assert.equal(t.events.at(-1).runningCount,0);
});
await check("cancel stops only the pending launch and ignores late ready events",async()=>{
 await launchGame(account);const running=t.children.at(-1);running.watcher.emit("minecraft-window-ready");
 await launchGame(account);const pending=t.children.at(-1);assert.equal(await cancelLaunch(),true);
 assert(pending.killed);assert(!running.killed);pending.watcher.emit("minecraft-window-ready");
 assert.equal(t.events.at(-1).runningCount,1);assert.equal(t.events.at(-1).preparing,false);
 running.watcher.emit("minecraft-exit",{code:0});
});
await check("a failed extra launch leaves the existing process alive",async()=>{
 await launchGame(account);const running=t.children.at(-1);running.watcher.emit("minecraft-window-ready");
 t.failNext=true;await launchGame(account);
 assert(!running.killed);assert.equal(t.events.at(-1).runningCount,1);assert(!gameOperationBusy());
 running.watcher.emit("minecraft-exit",{code:0});
});
await check("simultaneous playtime increments are accumulated",async()=>{
 const before=(await loadState()).stats.playtimeMinutes;await Promise.all([recordPlaytime(3),recordPlaytime(7)]);assert.equal((await loadState()).stats.playtimeMinutes,before+10);
});
console.log(checks+" runtime regression checks passed; Minecraft was not started.");
