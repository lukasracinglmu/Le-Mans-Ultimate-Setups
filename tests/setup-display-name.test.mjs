import assert from 'node:assert/strict';
import test from 'node:test';
import {readDisplayName,enrichDisplayNames} from '../setup-display-name.js';
import accessWorker from '../access-worker.js';
const sha='a'.repeat(40),userId='1033453785416208564';
test('display name validates text and accepts an empty reset',()=>{
 assert.deepEqual(readDisplayName(' Fuji GO Rennen '),{displayName:'Fuji GO Rennen'});assert.deepEqual(readDisplayName('  '),{displayName:''});
 for(const value of [null,42,'x'.repeat(161),'a\nb','x\0y'])assert.ok(readDisplayName(value).error);
});
test('display names attach to exact file SHA and stale metadata cannot rename new bytes',async()=>{
 const env={ACCESS_DB:{prepare(){return{bind(){return{all:async()=>({results:[{file_name:'Fuji GO.zip',file_sha:sha,display_name:'Fuji Quali'}]})};}};}}};
 const result=await enrichDisplayNames([{name:'Fuji GO.zip',sha},{name:'Fuji GO.zip',sha:'b'.repeat(40)}],'Hypercar','Alpine',env);assert.equal(result[0].displayName,'Fuji Quali');assert.equal(result[1].displayName,null);
});
async function cookie(){const payload=Buffer.from(JSON.stringify({id:userId,username:'Lukas',exp:Math.floor(Date.now()/1000)+60})).toString('base64url');const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('test-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);return 'lmu_session='+payload+'.'+Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))).toString('base64url');}
async function harness(run){const original=globalThis.fetch,calls=[],writes=[],background=[];
 const env={SESSION_SECRET:'test-secret',DISCORD_OWNER_USER_ID:userId,ACCESS_DB:{prepare(sql){return{bind(...values){return{sql,values,first:async()=>sql.includes('setup_display_names')?{display_name:'Alt',file_sha:sha}:{version:'v1'},run:async()=>{writes.push({sql,values});}};}};},async batch(statements){writes.push(...statements.map(({sql,values})=>({sql,values})));return [];}}};
 globalThis.fetch=async(url,options={})=>{calls.push({url:String(url),options});assert.ok(String(url).includes('/contents/setups/'));assert.notEqual(options.method,'PUT');assert.notEqual(options.method,'DELETE');return Response.json({sha});};
 const req=async(body,loggedIn=true)=>new Request('https://example.test/api/setups/version',{method:'POST',headers:{'Content-Type':'application/json',...(loggedIn?{Cookie:await cookie()}:{})},body:JSON.stringify({category:'Hypercar',vehicle:'Alpine',name:'Fuji GO.zip',...body})});
 const ctx={waitUntil(p){background.push(p);}};
 try{await run({env,req,ctx,calls,writes});await Promise.all(background);}finally{globalThis.fetch=original;}
}
test('editor saves display name and version as metadata while preserving the actual filename',async()=>{
 await harness(async({env,req,ctx,calls,writes})=>{const r=await accessWorker.fetch(await req({version:'v2',displayName:'Fuji Quali'}),env,ctx);assert.equal(r.status,200);const data=await r.json();assert.equal(data.name,'Fuji GO.zip');assert.equal(data.displayName,'Fuji Quali');assert.equal(data.version,'v2');assert.ok(calls.every(c=>!c.options.method||c.options.method==='GET'));assert.equal(writes.length,2);const alias=writes.find(w=>w.sql.includes('INSERT INTO setup_display_names'));assert.deepEqual(alias.values,['Hypercar','Alpine','Fuji GO.zip',sha,'Fuji Quali']);});
});
test('name-only edit and reset work without requiring a version',async()=>{
 for(const displayName of ['Fuji Rennen',''])await harness(async({env,req,ctx,writes})=>{const r=await accessWorker.fetch(await req({displayName}),env,ctx);assert.equal(r.status,200);assert.equal((await r.json()).displayName,displayName||null);assert.equal(writes.length,1);assert.ok(writes[0].sql.includes('setup_display_names'));});
});
test('unauthorized or invalid edits cannot change metadata',async()=>{
 await harness(async({env,req,ctx,writes})=>{assert.equal((await accessWorker.fetch(await req({displayName:'Fuji'},false),env,ctx)).status,401);assert.equal((await accessWorker.fetch(await req({displayName:'x'.repeat(161)}),env,ctx)).status,400);assert.equal(writes.length,0);});
});
