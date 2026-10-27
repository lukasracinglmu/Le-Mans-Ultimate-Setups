import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker.js';
const env={SESSION_SECRET:'diagnostic-test-secret',DISCORD_OWNER_USER_ID:'1033453785416208564',DISCORD_CLIENT_ID:'1556978316404068452',DISCORD_GUILD_ID:'1464926567401652418',DISCORD_DATABASE_ROLE_ID:'1464926567401652420',DISCORD_UPLOAD_ROLE_ID:'1538601074074849330',DISCORD_OWNER_ROLE_ID:'1464926567401652423',DISCORD_BOT_TOKEN:'must-not-leak'};
async function request(id=env.DISCORD_OWNER_USER_ID,query=''){
 const p=Buffer.from(JSON.stringify({id,username:'Test',accessToken:'private-oauth',exp:Date.now()/1000+60})).toString('base64url');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(p))).toString('base64url');
 return new Request('https://test.invalid/api/admin/discord/role-status'+query,{headers:{Cookie:'lmu_session='+p+'.'+sig}});
}
test('diagnostic cannot be accessed by anonymous or non-owner users',async()=>{
 assert.equal((await worker.fetch(new Request('https://test.invalid/api/admin/discord/role-status'),env)).status,401);
 assert.equal((await worker.fetch(await request('222222222222222222'),env)).status,403);
});
test('diagnostic reports actual role responses without credentials',async()=>{
 const original=fetch;
 globalThis.fetch=async url=>String(url).endsWith('/users/@me')?Response.json({id:env.DISCORD_CLIENT_ID}):String(url).endsWith('/roles')?Response.json([{id:env.DISCORD_DATABASE_ROLE_ID,name:'Team'}]):Response.json({roles:[env.DISCORD_DATABASE_ROLE_ID]});
 try{const response=await worker.fetch(await request(),env);const text=await response.text();assert.ok(!text.includes(env.DISCORD_BOT_TOKEN)&&!text.includes('private-oauth'));const data=JSON.parse(text);assert.equal(data.bot.applicationMatches,true);assert.equal(data.configuredRoles.team.exists,true);assert.equal(data.member.status,200);}finally{globalThis.fetch=original;}
});
test('diagnostic distinguishes inaccessible guilds from missing user roles',async()=>{
 const original=fetch;globalThis.fetch=async()=>Response.json({code:50001,message:'Missing Access'},{status:403});
 try{const data=await(await worker.fetch(await request(),env)).json();assert.equal(data.guild.status,403);assert.equal(data.guild.code,50001);assert.equal(data.member.status,403);}finally{globalThis.fetch=original;}
});
