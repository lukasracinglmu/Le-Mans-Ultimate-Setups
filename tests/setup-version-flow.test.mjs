import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {compareSetupVersions,validatePreviousSetupVersions} from '../setup-version.js';
import {persistSetupFile,gitBlobSha} from '../upload-storage.js';
import production from '../production-worker.js';
const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
const client=vm.runInNewContext(source.slice(source.indexOf('function compareUploadVersions('),source.indexOf('async function uploadFileIdentity('))+';({compareUploadVersions,uploadSetupFamily})');

test('client and server compare numeric versions consistently and leave unknown formats undecided',()=>{
  for(const [a,b,expected] of [['v2','1',1],['1.10','1.9',1],['1','1.0',0],['v2.0.1','v2',1],['v1','2',-1],['','1',null],['beta','1',null],['2026.10','2026.9',1],['1.2-rc','1.2',null]]){
    assert.equal(compareSetupVersions(a,b),expected);assert.equal(client.compareUploadVersions(a,b),expected);
  }
});
test('matching retains track, layout, vendor, wet/dry, series and EVO while ignoring explicit version suffixes',()=>{
  const key=client.uploadSetupFamily('Alpine Spa v2 HYMO.zip','v2');
  assert.equal(key,client.uploadSetupFamily('Alpine Spa v1 HYMO.zip','v1'));
  assert.equal(key,client.uploadSetupFamily('Alpine Spa HYMO [v2 HYMO aabbccddeeff].zip','v2'));
  for(const name of ['Alpine Monza v1 HYMO.zip','Alpine Spa Short v1 HYMO.zip','Alpine Spa Wet v1 HYMO.zip','Alpine Spa EVO v1 HYMO.zip','Alpine Spa v1 GO.zip'])assert.notEqual(key,client.uploadSetupFamily(name,'v1'));
});
test('server rejects cleanup when the current old version is equal, newer or uncomparable',async()=>{
  const plan={action:'outdate',targets:[{name:'Spa HYMO.zip',sha:'a'.repeat(40)}]};
  for(const old of ['v2','v3','',null,'beta']){
    const env={ACCESS_DB:{prepare(){return{bind(){return{first:async()=>({version:old})};}};}}};
    const r=await validatePreviousSetupVersions(plan,'Hypercar','Alpine','v2',env);assert.equal(r.success,false);assert.equal(r.retryable,false);
  }
  const env={ACCESS_DB:{prepare(){return{bind(){return{first:async()=>({version:'v1'})};}};}}};
  assert.equal((await validatePreviousSetupVersions(plan,'Hypercar','Alpine','v2',env)).success,true);
});

test('same-name preserve stores a deterministic separate ZIP and retries do not write twice',async()=>{
  const file=new File([new Uint8Array([80,75,3,4,44])],'Spa HYMO.zip'),sha=await gitBlobSha(new Uint8Array(await file.arrayBuffer()));
  const files=new Map([['Spa HYMO.zip','a'.repeat(40)]]);let puts=0;
  const params={file,name:file.name,version:'v2',preserveSha:'a'.repeat(40),category:'Hypercar',vehicle:'Alpine',branch:'main',githubRequest:async(path,options)=>{
    const name=decodeURIComponent(path.split('?')[0].split('/').at(-1));
    if(options.method==='PUT'){puts++;assert.notEqual(name,file.name);files.set(name,sha);return Response.json({content:{sha}});}
    return files.has(name)?Response.json({sha:files.get(name)}):Response.json({},{status:404});
  }};
  const first=await persistSetupFile(params),second=await persistSetupFile(params);
  assert.equal(first.uploaded,true);assert.equal(second.alreadyExists,true);assert.equal(first.name,second.name);assert.match(first.name,/v2 HYMO/);assert.equal(files.get(file.name),'a'.repeat(40));assert.equal(puts,1);
});

test('same-name outdate uploads new bytes separately and marks exactly the original SHA',async()=>{
  const original=globalThis.fetch,fileName='Spa HYMO.zip',oldSha='a'.repeat(40),file=new File([new Uint8Array([80,75,3,4,44])],fileName),newSha=await gitBlobSha(new Uint8Array(await file.arrayBuffer()));
  const files=new Map([[fileName,oldSha]]),versions=new Map([[fileName,'v1']]),marks=[];
  const env={SESSION_SECRET:'test-secret',DISCORD_OWNER_USER_ID:'1033453785416208564',ACCESS_DB:{prepare(sql){return{bind(...values){return{first:async()=>({version:versions.get(values[2])}),run:async()=>{if(sql.includes('INSERT INTO setup_versions'))versions.set(values[2],values[3]);if(sql.includes('INSERT INTO setup_lifecycle'))marks.push(values);}};}};}}};
  const payload=Buffer.from(JSON.stringify({id:env.DISCORD_OWNER_USER_ID,username:'Test',exp:Math.floor(Date.now()/1000)+60})).toString('base64url');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))).toString('base64url');
  globalThis.fetch=async(url,options={})=>{
    const name=decodeURIComponent(new URL(url).pathname.split('/').at(-1));
    assert.notEqual(options.method,'DELETE');
    if(options.method==='PUT'){assert.notEqual(name,fileName);files.set(name,newSha);return Response.json({content:{sha:newSha}});}
    return files.has(name)?Response.json({sha:files.get(name)}):Response.json({},{status:404});
  };
  try{
    const form=new FormData();form.set('category','Hypercar');form.set('vehicle','Alpine');form.set('version','v2');form.set('files',file);form.set('previousSetups',JSON.stringify({action:'outdate',targets:[{name:fileName,sha:oldSha}]}));
    const response=await production.fetch(new Request('https://example.test/api/setups/upload',{method:'POST',headers:{Cookie:'lmu_session='+payload+'.'+signature},body:form}),env);
    assert.equal(response.status,200);const data=await response.json();assert.equal(data.success,true);assert.equal(data.uploaded[0].originalName,fileName);assert.notEqual(data.uploaded[0].name,fileName);assert.equal(versions.get(fileName),'v1');assert.equal(versions.get(data.uploaded[0].name),'v2');assert.equal(files.get(fileName),oldSha);assert.equal(marks.length,1);assert.deepEqual(marks[0],['Hypercar','Alpine',fileName,oldSha]);
  }finally{globalThis.fetch=original;}
});

test('duplicate hint must match the real bytes and cannot create a false success',async()=>{
  const file=new File([new Uint8Array([80,75,3,4,44])],'Spa HYMO.zip');let calls=0;
  const result=await persistSetupFile({file,name:file.name,expectedFileSha:'a'.repeat(40),category:'Hypercar',vehicle:'Alpine',branch:'main',githubRequest:async()=>{calls++;return Response.json({});}});
  assert.equal(result.code,'INVALID_DUPLICATE');assert.equal(calls,0);
});

test('same-name replacement retry accepts equal version only after verifying already stored new bytes',async()=>{
  const {default:base}=await import('../worker.js'),originalBase=base.fetch,originalFetch=globalThis.fetch;
  const file=new File([new Uint8Array([80,75,3,4,44])],'Spa HYMO.zip'),sha=await gitBlobSha(new Uint8Array(await file.arrayBuffer()));
  let forwarded=0;
  base.fetch=async()=>{forwarded++;return Response.json({success:true,uploaded:[{name:file.name,originalName:file.name,sha,alreadyExists:true}]});};
  try{
    for(const [sameBytes,oldVersion] of [[true,"v2"],[false,"v2"],[true,"v3"]]){
      forwarded=0;globalThis.fetch=async()=>Response.json({sha:sameBytes?sha:'a'.repeat(40)});
      const env={ACCESS_DB:{prepare(){return{bind(){return{first:async()=>({version:oldVersion}),run:async()=>{}};}};}}};
      const form=new FormData();form.set('category','Hypercar');form.set('vehicle','Alpine');form.set('version','v2');form.set('files',file);form.set('previousSetups',JSON.stringify({action:'replace',targets:[{name:file.name,sha:'a'.repeat(40)}]}));
      const r=await production.fetch(new Request('https://example.test/api/setups/upload',{method:'POST',body:form}),env);
      assert.equal(r.status,sameBytes&&oldVersion==="v2"?200:409);assert.equal(forwarded,sameBytes&&oldVersion==="v2"?1:0);
    }
  }finally{base.fetch=originalBase;globalThis.fetch=originalFetch;}
});

test('verified duplicate does not lower the stored version',async()=>{
  const {default:base}=await import('../worker.js'),originalBase=base.fetch;
  base.fetch=async()=>Response.json({success:true,uploaded:[{name:'Spa HYMO.zip',originalName:'Spa v1 HYMO.zip',sha:'a'.repeat(40),alreadyExists:true}]});
  let writes=0;
  try{
    const form=new FormData();form.set('category','Hypercar');form.set('vehicle','Alpine');form.set('version','v1');form.set('files',new File(['PK\x03\x04'],'Spa v1 HYMO.zip'));form.set('previousSetups',JSON.stringify({action:'keep',targets:[],duplicateOf:{name:'Spa HYMO.zip',sha:'a'.repeat(40)}}));
    const env={ACCESS_DB:{prepare(){return{bind(){return{run:async()=>{writes++;}};}};}}};
    const r=await production.fetch(new Request('https://example.test/api/setups/upload',{method:'POST',body:form}),env);assert.equal(r.status,200);assert.equal(writes,0);
  }finally{base.fetch=originalBase;}
});
