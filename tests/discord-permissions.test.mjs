import assert from 'node:assert/strict';
import test from 'node:test';
import { rolePermissions, resolvePermissions } from '../discord-permissions.js';
import accessWorker from '../access-worker.js';
import worker from '../worker.js';

const envBase={DISCORD_GUILD_ID:'1464926567401652418',DISCORD_DATABASE_ROLE_ID:'1464926567401652420',DISCORD_UPLOAD_ROLE_ID:'1538601074074849330',DISCORD_OWNER_ROLE_ID:'1464926567401652423',DISCORD_OWNER_USER_ID:'1033453785416208564',DISCORD_SETUP_REQUEST_ROLE_ID:'111111111111111111',DISCORD_BOT_TOKEN:'test-bot',GITHUB_TOKEN:'test-github',SESSION_SECRET:'local-test-secret'};
const userId='222222222222222222',targetId='333333333333333333';

for(const [name,roles,grants,read,write,admin] of [
  ['Team',[envBase.DISCORD_DATABASE_ROLE_ID],{},true,false,false],
  ['Setup Supply',[envBase.DISCORD_UPLOAD_ROLE_ID],{},true,true,false],
  ['Owner role',[envBase.DISCORD_OWNER_ROLE_ID],{},true,false,true],
  ['Owner and Supply',[envBase.DISCORD_OWNER_ROLE_ID,envBase.DISCORD_UPLOAD_ROLE_ID],{},true,true,true],
  ['Request ping',[envBase.DISCORD_SETUP_REQUEST_ROLE_ID],{},false,false,false],
  ['No role',[],{},false,false,false],
  ['External database grant',[],{database:true},true,false,false],
  ['External upload grant',[],{upload:true},true,true,false]
]){
  test(name+' has precisely the configured capabilities',()=>{
    const p=rolePermissions(userId,roles,envBase,grants);
    assert.equal(p.databaseAccess,read);assert.equal(p.canUpload,write);assert.equal(p.canManageDatabaseAccess,admin);assert.equal(p.canManageUploadAccess,false);
  });
}
test('personal owner retains all capabilities without a Discord role',()=>{
  const p=rolePermissions(envBase.DISCORD_OWNER_USER_ID,[],envBase);
  assert.ok(p.databaseAccess&&p.canUpload&&p.canManageDatabaseAccess&&p.canManageUploadAccess);
});

async function cookie(id){
  const payload=Buffer.from(JSON.stringify({id,username:'Test User',exp:Math.floor(Date.now()/1000)+60})).toString('base64url');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(envBase.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))).toString('base64url');
  return 'lmu_session='+payload+'.'+signature;
}
async function harness(roles,run,{id=userId,grants={},discordStatus=200}={}){
  const original=globalThis.fetch,github=[],writes=[],background=[];
  const env={...envBase,ACCESS_DB:{prepare(sql){return {bind(...params){return {
    async first(){return ((sql.includes('FROM upload_access')&&grants.upload)||(sql.includes('FROM database_access')&&grants.database))?{user_id:params[0]}:null;},
    async all(){return {results:[]};},async run(){writes.push({sql,params});return {success:true};}
  };},async all(){return {results:[]};}};}}};
  globalThis.fetch=async(url,options={})=>{
    if(String(url).startsWith('https://discord.com/api/v10/guilds/')){
      assert.ok(String(url).startsWith('https://discord.com/api/v10/guilds/'+env.DISCORD_GUILD_ID+'/members/'));
      return Response.json({roles,user:{username:'Test User'}},{status:discordStatus});
    }
    if(String(url).startsWith('https://api.github.com/')){
      github.push({url,options});return Response.json({sha:'existing',name:'test.zip'});
    }
    throw Error('Unexpected external request: '+url);
  };
  const request=async(path,method='GET',body)=>new Request('https://example.test'+path,{method,headers:{Cookie:await cookie(id),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const ctx={waitUntil(promise){background.push(promise);}};
  try{await run({env,github,writes,request,ctx});await Promise.all(background);}
  finally{globalThis.fetch=original;}
}

test('both worker layers expose the same Team/Supply/Owner capabilities',async()=>{
  for(const roles of [[envBase.DISCORD_DATABASE_ROLE_ID],[envBase.DISCORD_UPLOAD_ROLE_ID],[envBase.DISCORD_OWNER_ROLE_ID]]){
    await harness(roles,async({env,request,ctx})=>{
      const a=await (await accessWorker.fetch(await request('/api/me'),env,ctx)).json();
      const b=await (await worker.fetch(await request('/api/me'),env,ctx)).json();
      assert.equal(a.databaseAccess,b.databaseAccess);assert.equal(a.user.canUpload,b.user.canUpload);assert.equal(a.user.canManageDatabaseAccess,b.user.canManageDatabaseAccess);
      assert.equal(a.user.canUpload,roles.includes(envBase.DISCORD_UPLOAD_ROLE_ID));
    });
  }
});

test('Owner role can grant external database access but cannot grant upload access',async()=>{
  await harness([envBase.DISCORD_OWNER_ROLE_ID],async({env,request,ctx,writes})=>{
    assert.equal((await accessWorker.fetch(await request('/api/admin/database-access','POST',{userId:targetId}),env,ctx)).status,200);
    assert.ok(writes.some(w=>w.sql.includes('INSERT INTO database_access')&&w.params[0]===targetId&&w.params[1]===userId));
    const count=writes.length;
    assert.equal((await accessWorker.fetch(await request('/api/admin/upload-access','POST',{userId:targetId}),env,ctx)).status,403);
    assert.equal(writes.length,count);
  });
});

test('Team and Setup Supply cannot manage external access',async()=>{
  for(const role of [envBase.DISCORD_DATABASE_ROLE_ID,envBase.DISCORD_UPLOAD_ROLE_ID]){
    await harness([role],async({env,request,ctx,writes})=>{
      assert.equal((await accessWorker.fetch(await request('/api/admin/database-access','POST',{userId:targetId}),env,ctx)).status,403);
      assert.equal(writes.length,0);
    });
  }
});

test('Setup Supply can delete through both guards using the correct GitHub path',async()=>{
  await harness([envBase.DISCORD_UPLOAD_ROLE_ID],async({env,request,ctx,github})=>{
    const r=await accessWorker.fetch(await request('/api/setups/delete','POST',{category:'Hypercar',vehicle:'Test Car',name:'test.zip'}),env,ctx);
    assert.equal(r.status,200);
    const deletion=github.find(r=>r.options.method==='DELETE');
    assert.equal(deletion.url,'https://api.github.com/repos/lukasracinglmu/Le-Mans-Ultimate-Setups/contents/setups/Hypercar/Test%20Car/test.zip');
  });
});

test('Team, Request ping and Owner role alone cannot change or delete setups',async()=>{
  for(const role of [envBase.DISCORD_DATABASE_ROLE_ID,envBase.DISCORD_SETUP_REQUEST_ROLE_ID,envBase.DISCORD_OWNER_ROLE_ID]){
    await harness([role],async({env,request,ctx,github,writes})=>{
      for(const path of ['/api/setups/delete','/api/setups/version','/api/setups/upload']){
        assert.equal((await accessWorker.fetch(await request(path,'POST',{category:'Hypercar',vehicle:'Test Car',name:'test.zip',version:'v2'}),env,ctx)).status,403);
      }
      assert.equal(github.length,0);assert.equal(writes.length,0);
    });
  }
});

test('external database grants allow reading only, without a Discord server role',async()=>{
  await harness([],async({env,request,ctx})=>{
    const me=await (await accessWorker.fetch(await request('/api/me'),env,ctx)).json();assert.equal(me.databaseAccess,true);assert.equal(me.user.canUpload,false);
    assert.equal((await accessWorker.fetch(await request('/api/setups?category=Hypercar&vehicle=Test%20Car'),env,ctx)).status,200);
  },{grants:{database:true}});
});

test('Discord outages fail closed with a temporary status instead of granting access',async()=>{
  await harness([],async({env,request,ctx})=>{
    assert.equal((await accessWorker.fetch(await request('/api/setups/delete','POST',{name:'test.zip'}),env,ctx)).status,503);
    const p=await resolvePermissions(userId,env);assert.equal(p.canUpload,false);assert.equal(p.canManageDatabaseAccess,false);assert.equal(p.rolesAvailable,false);
  },{discordStatus:503});
});

test('Setup Supply can change setup versions without the Team or ping role',async()=>{
  await harness([envBase.DISCORD_UPLOAD_ROLE_ID],async({env,request,ctx,writes})=>{
    const r=await accessWorker.fetch(await request('/api/setups/version','POST',{category:'Hypercar',vehicle:'Test Car',name:'test.zip',version:'v3'}),env,ctx);
    assert.equal(r.status,200);assert.equal((await r.json()).version,'v3');
    assert.ok(writes.some(w=>w.sql.includes('INSERT INTO setup_versions')&&w.params[3]==='v3'));
  });
});

test('personal owner can still grant individual upload access',async()=>{
  await harness([],async({env,request,ctx,writes})=>{
    assert.equal((await accessWorker.fetch(await request('/api/admin/upload-access','POST',{userId:targetId}),env,ctx)).status,200);
    assert.ok(writes.some(w=>w.sql.includes('INSERT INTO upload_access')&&w.params[0]===targetId));
  },{id:envBase.DISCORD_OWNER_USER_ID});
});
