import assert from 'node:assert/strict';
import test from 'node:test';
import {readPreviousSetups,applyPreviousSetups,deleteGithubSetup,enrichSetupLifecycle} from '../setup-lifecycle.js';
import {persistSetupFile,gitBlobSha} from '../upload-storage.js';
import production from '../production-worker.js';
import base from '../worker.js';
const oldSha='a'.repeat(40),newSha='b'.repeat(40),name='Alpine Spa HYMO.zip',newName='Alpine Spa v2 HYMO.zip';
function planForm(action,targets){const form=new FormData();form.set('previousSetups',JSON.stringify({action,targets}));return form;}
test('old-file plan rejects other vendors, unknown vendors, duplicate files, invalid SHA and paths',()=>{
  const target={name,sha:oldSha};
  assert.equal(readPreviousSetups(planForm('replace',[target]),[newName]).action,'replace');
  for(const [targets,names] of [
    [[{name:'Spa GO.zip',sha:oldSha}],[newName]],[[target],['unknown.zip']],[[target,target],[newName]],[[{...target,sha:'bad'}],[newName]],[[{...target,name:'../Spa HYMO.zip'}],[newName]],[[target],[newName,'other HYMO.zip']]
  ])assert.ok(readPreviousSetups(planForm('replace',targets),names).error);
  assert.equal(readPreviousSetups(planForm('outdate',[target]),[name]).action,'outdate');
  assert.equal(readPreviousSetups(planForm('keep',[target]),[name]).targets[0].sha,oldSha);
});

test('explicit same-name replacement uses the selected SHA and does not overwrite a concurrent update',async()=>{
  const file=new File([new Uint8Array([80,75,3,4,42])],name),sha=await gitBlobSha(new Uint8Array(await file.arrayBuffer()));
  let writes=0;
  const params={file,name,category:'Hypercar',vehicle:'Alpine A424',branch:'main',replaceSha:oldSha};
  const result=await persistSetupFile({...params,githubRequest:async(path,options)=>{
    if(options.method==='PUT'){writes++;const body=JSON.parse(await options.body.text());assert.equal(body.sha,oldSha);return Response.json({content:{sha}});}
    return Response.json({sha:oldSha});
  }});
  assert.equal(result.uploaded,true);assert.equal(writes,1);
  const conflict=await persistSetupFile({...params,githubRequest:async()=>Response.json({sha:'c'.repeat(40)})});assert.equal(conflict.code,'FILE_CONFLICT');assert.equal(writes,1);
});

async function cleanupHarness({action='replace',replacementSha=newSha,currentOldSha=oldSha,missingNew=false},run){
  const original=globalThis.fetch,writes=[],rows=[];
  globalThis.fetch=async(url,options={})=>{
    if(options.method==='DELETE'){writes.push(JSON.parse(options.body));return Response.json({commit:{sha:'commit'}});}
    return String(url).includes(encodeURIComponent(newName))?(missingNew?Response.json({},{status:404}):Response.json({sha:replacementSha})):Response.json({sha:currentOldSha});
  };
  const env={ACCESS_DB:{prepare(sql){return{bind(...args){return{async run(){rows.push({sql,args});}};}};}}};
  try{await run({writes,rows,apply:()=>applyPreviousSetups({plan:{action,targets:[{name,sha:oldSha}]},category:'Hypercar',vehicle:'Alpine A424',replacement:{name:newName,sha:newSha},env})});}finally{globalThis.fetch=original;}
}
test('old ZIP remains intact if new bytes are missing or do not match',async()=>{
  for(const options of [{missingNew:true},{replacementSha:'c'.repeat(40)}])await cleanupHarness(options,async({apply,writes,rows})=>{assert.equal((await apply()).success,false);assert.equal(writes.length+rows.length,0);});
});
test('cleanup stops if a selected old file changed after the dialog',async()=>{
  await cleanupHarness({currentOldSha:'c'.repeat(40)},async({apply,writes})=>{const r=await apply();assert.equal(r.status,409);assert.equal(r.retryable,false);assert.equal(writes.length,0);});
});
test('outdated marker retains ZIP bytes and is tied to the exact file SHA',async()=>{
  await cleanupHarness({action:'outdate'},async({apply,writes,rows})=>{
    assert.equal((await apply()).success,true);assert.equal(writes.length,0);assert.deepEqual(rows[0].args,['Hypercar','Alpine A424',name,oldSha]);
  });
  const env={ACCESS_DB:{prepare(){return {bind(){return {all:async()=>({results:[{file_name:name,file_sha:oldSha,outdated:1}]})};}};}}};
  const old=await enrichSetupLifecycle([{name,sha:oldSha}],'Hypercar','Alpine A424',env);assert.equal(old[0].outdated,true);
  const newer=await enrichSetupLifecycle([{name,sha:newSha}],'Hypercar','Alpine A424',env);assert.equal(newer[0].outdated,false);
});
test('replacement deletes only the confirmed selected old filename after checking new ZIP',async()=>{
  await cleanupHarness({},async({apply,writes})=>{const r=await apply();assert.equal(r.success,true);assert.equal(r.retired[0].name,name);assert.equal(writes.length,1);assert.equal(writes[0].sha,oldSha);});
});

test('delete recovers from branch conflict without losing its expected file SHA',async()=>{
  let writes=0,reads=0;
  const result=await deleteGithubSetup({category:'Hypercar',vehicle:'Alpine',name,expectedSha:oldSha,branch:'main',githubRequest:async(path,options)=>{
    if(options.method==='DELETE'){writes++;assert.equal(JSON.parse(options.body).sha,oldSha);return writes===1?Response.json({},{status:409}):Response.json({});}
    reads++;return Response.json({sha:oldSha});
  }});
  assert.equal(result.success,true);assert.equal(writes,2);assert.equal(reads,2);
});
test('delete recovers a lost response and an already absent file idempotently',async()=>{
  let exists=true,writes=0;
  const githubRequest=async(path,options)=>{if(options.method==='DELETE'){exists=false;writes++;throw Error('response lost');}return exists?Response.json({sha:oldSha}):Response.json({},{status:404});};
  const params={category:'Hypercar',vehicle:'Alpine',name,expectedSha:oldSha,branch:'main',githubRequest};
  assert.equal((await deleteGithubSetup(params)).success,true);assert.equal((await deleteGithubSetup(params)).alreadyDeleted,true);assert.equal(writes,1);
});
test('delete refuses a changed selected file without any DELETE',async()=>{
  const result=await deleteGithubSetup({category:'Hypercar',vehicle:'Alpine',name,expectedSha:oldSha,branch:'main',githubRequest:async(path,options)=>{assert.notEqual(options.method,'DELETE');return Response.json({sha:newSha});}});
  assert.equal(result.status,409);assert.equal(result.retryable,false);
});

test('Setup Request derives class from catalog and mentions exactly the configured role and requester',async()=>{
  const originalBase=base.fetch,originalFetch=globalThis.fetch,sends=[];
  base.fetch=async()=>Response.json({loggedIn:true,user:{id:'1033453785416208564',username:'Lukas'}});
  globalThis.fetch=async(url,options={})=>{
    if(String(url).includes('api.github.com'))return Response.json({Hypercar:[{name:'Alpine A424'}],LMGT3:[{name:'BMW M4 LMGT3'}]});
    sends.push(JSON.parse(options.body));return Response.json({id:'message'});
  };
  try{
    const req=(vehicle)=>new Request('https://example.test/api/request',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({vehicle,carClass:'wrong',track:'Spa <@&999999999999999999>',message:'@everyone'})});
    const env={DISCORD_SETUP_REQUEST_ROLE_ID:'1538601074074849330',DISCORD_BOT_TOKEN:'test',DISCORD_CHANNEL_ID:'1557002876906377258'};
    assert.equal((await production.fetch(req('BMW M4 LMGT3'),env)).status,200);
    assert.match(sends[0].content,/\*\*Klasse:\*\* LMGT3/);assert.match(sends[0].content,/<@&1538601074074849330>/);
    assert.deepEqual(sends[0].allowed_mentions,{parse:[],roles:['1538601074074849330'],users:['1033453785416208564']});
    assert.equal((await production.fetch(req('BMW'),env)).status,400);assert.equal(sends.length,1);
  }finally{base.fetch=originalBase;globalThis.fetch=originalFetch;}
});

test('failed ZIP upload never applies its selected cleanup plan',async()=>{
  const originalBase=base.fetch,originalFetch=globalThis.fetch;let reads=0;
  base.fetch=async()=>Response.json({success:false,error:'storage unavailable'},{status:503});
  globalThis.fetch=async()=>{reads++;throw Error('must not clean up');};
  try{
    const form=planForm('replace',[{name,sha:oldSha}]);form.set('files',new File(['PK\x03\x04'],newName));form.set('category','Hypercar');form.set('vehicle','Alpine A424');form.set('version','v2');
    const response=await production.fetch(new Request('https://example.test/api/setups/upload',{method:'POST',body:form}),{ACCESS_DB:{prepare(){return{bind(){return{first:async()=>({version:'v1'})};}};}}});
    assert.equal(response.status,503);assert.equal(reads,0);
  }finally{base.fetch=originalBase;globalThis.fetch=originalFetch;}
});
test('cleanup retry after a deleted old ZIP is idempotent and leaves replacement intact',async()=>{
  const original=globalThis.fetch;let deleted=false,writes=0;
  globalThis.fetch=async(url,options={})=>{
    if(options.method==='DELETE'){deleted=true;writes++;return Response.json({});}
    if(String(url).includes(encodeURIComponent(newName)))return Response.json({sha:newSha});
    return deleted?Response.json({},{status:404}):Response.json({sha:oldSha});
  };
  try{
    const params={plan:{action:'replace',targets:[{name,sha:oldSha}]},category:'Hypercar',vehicle:'Alpine A424',replacement:{name:newName,sha:newSha},env:{}};
    assert.equal((await applyPreviousSetups(params)).success,true);assert.equal((await applyPreviousSetups(params)).success,true);assert.equal(writes,1);
  }finally{globalThis.fetch=original;}
});
