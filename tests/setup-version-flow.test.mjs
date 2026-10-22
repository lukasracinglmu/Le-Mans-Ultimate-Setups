import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {compareSetupVersions,cleanSetupFileName} from '../setup-version.js';
import {persistSetupFile,gitBlobSha} from '../upload-storage.js';
import production from '../production-worker.js';
const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
const client=vm.runInNewContext(source.slice(source.indexOf('function displaySetupFileName('),source.indexOf('function esc('))+source.slice(source.indexOf('function compareUploadVersions('),source.indexOf('async function uploadFileIdentity('))+';({compareUploadVersions,uploadSetupFamily})');

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
test('same-name preserve stores a deterministic separate ZIP and retries do not write twice',async()=>{
  const file=new File([new Uint8Array([80,75,3,4,44])],'Spa HYMO.zip'),sha=await gitBlobSha(new Uint8Array(await file.arrayBuffer()));
  const files=new Map([['Spa HYMO.zip','a'.repeat(40)]]);let puts=0;
  const params={file,name:file.name,version:'v2',preserveSha:'a'.repeat(40),category:'Hypercar',vehicle:'Alpine',branch:'main',githubRequest:async(path,options)=>{
    const name=decodeURIComponent(path.split('?')[0].split('/').at(-1));
    if(options.method==='PUT'){puts++;assert.notEqual(name,file.name);files.set(name,sha);return Response.json({content:{sha}});}
    return files.has(name)?Response.json({sha:files.get(name)}):Response.json({},{status:404});
  }};
  const first=await persistSetupFile(params),second=await persistSetupFile(params);
  assert.equal(first.uploaded,true);assert.equal(second.alreadyExists,true);assert.equal(first.name,second.name);assert.equal(first.name,'Spa HYMO (Version v2).zip');assert.ok(!first.name.includes(sha.slice(0,12)));assert.equal(files.get(file.name),'a'.repeat(40));assert.equal(puts,1);
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

test('explicit existing-file choices work for identical bytes and equal or missing versions',async()=>{
  const original=globalThis.fetch,fileName='Spa HYMO.zip',file=new File([new Uint8Array([80,75,3,4,44])],fileName),sha=await gitBlobSha(new Uint8Array(await file.arrayBuffer()));
  try{
    for(const [action,version] of [['outdate','v1'],['outdate',''],['delete','v1'],['delete',''],['replace','v1']]){
      const files=new Map([[fileName,sha]]),versions=new Map([[fileName,'v1']]),marks=[];let puts=0,deletes=0;
      const env={SESSION_SECRET:'test-secret',DISCORD_OWNER_USER_ID:'1033453785416208564',ACCESS_DB:{prepare(sql){return{bind(...values){return{first:async()=>({version:versions.get(values[2])}),run:async()=>{if(sql.includes('INSERT INTO setup_versions'))versions.set(values[2],values[3]);if(sql.includes('INSERT INTO setup_lifecycle'))marks.push(values);}};}};}}};
      const payload=Buffer.from(JSON.stringify({id:env.DISCORD_OWNER_USER_ID,username:'Test',exp:Math.floor(Date.now()/1000)+60})).toString('base64url');
      const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
      const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))).toString('base64url');
      globalThis.fetch=async(url,options={})=>{
        const name=decodeURIComponent(new URL(url).pathname.split('/').at(-1));
        if(options.method==='DELETE'){deletes++;assert.equal(name,fileName);assert.equal(files.size,2,'new ZIP exists before old deletion');files.delete(name);return Response.json({});}
        if(options.method==='PUT'){puts++;assert.notEqual(name,fileName);files.set(name,sha);return Response.json({content:{sha}});}
        return files.has(name)?Response.json({sha:files.get(name)}):Response.json({},{status:404});
      };
      const request=()=>{const form=new FormData();form.set('category','Hypercar');form.set('vehicle','Alpine');form.set('version',version);form.set('files',file);form.set('previousSetups',JSON.stringify({action,targets:[{name:fileName,sha}]}));return new Request('https://example.test/api/setups/upload',{method:'POST',headers:{Cookie:'lmu_session='+payload+'.'+signature},body:form});};
      const response=await production.fetch(request(),env);assert.equal(response.status,200,action+' '+version);const data=await response.json();
      if(action==='replace'){assert.equal(data.uploaded[0].name,fileName);assert.equal(puts,0);assert.equal(deletes,0);}
      else{assert.notEqual(data.uploaded[0].name,fileName);assert.equal(puts,1);assert.equal(files.has(fileName),action==='outdate');assert.equal(deletes,action==='delete'?1:0);assert.equal(marks.length,action==='outdate'?1:0);if(marks.length)assert.deepEqual(marks[0],['Hypercar','Alpine',fileName,sha]);}
      const retry=await production.fetch(request(),env);assert.equal(retry.status,200);assert.equal(puts,action==='replace'?0:1,'retry never writes another ZIP');
    }
  }finally{globalThis.fetch=original;}
});

test('legacy and new storage suffixes do not leak into displayed or downloaded names',()=>{
  for(const stored of ['Alpine Fuji Go [1.4 GO 6955f746bc6d].zip','Alpine Fuji Go [1.4 Go 6955 F746 BC6D].zip','Alpine Fuji Go (Version 1.4).zip','Alpine Fuji Go (Version 1.4, 2).zip']){
    assert.equal(cleanSetupFileName(stored),'Alpine Fuji Go.zip');
  }
  for(const unchanged of ['Alpine Fuji Go.zip','Alpine Fuji GO [Wet].zip','Alpine Fuji (Endurance).zip'])assert.equal(cleanSetupFileName(unchanged),unchanged);
});

test('readable storage names resolve equal-version content conflicts without overwriting or duplicates on retry',async()=>{
  const file=new File([new Uint8Array([80,75,3,4,44])],'Spa HYMO.zip'),sha=await gitBlobSha(new Uint8Array(await file.arrayBuffer()));
  const files=new Map([[file.name,'a'.repeat(40)],['Spa HYMO (Version v2).zip','c'.repeat(40)]]);let puts=0;
  const params={file,name:file.name,version:'v2',preserveSha:'a'.repeat(40),category:'Hypercar',vehicle:'Alpine',branch:'main',githubRequest:async(path,options)=>{
    const name=decodeURIComponent(path.split('?')[0].split('/').at(-1));
    if(options.method==='PUT'){puts++;assert.equal(name,'Spa HYMO (Version v2, 2).zip');files.set(name,sha);return Response.json({content:{sha}});}
    return files.has(name)?Response.json({sha:files.get(name)}):Response.json({},{status:404});
  }};
  const first=await persistSetupFile(params),retry=await persistSetupFile(params);assert.equal(first.uploaded,true);assert.equal(retry.alreadyExists,true);assert.equal(first.name,retry.name);assert.equal(puts,1);assert.equal(files.get('Spa HYMO (Version v2).zip'),'c'.repeat(40));
});
