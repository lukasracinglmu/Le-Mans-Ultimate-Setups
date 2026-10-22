import assert from 'node:assert/strict';
import test from 'node:test';
import {submitBugReport,BUG_REPORT_RECIPIENT,reportImage} from '../bug-reports.js';
import runtime from '../runtime-worker.js';
const user={id:'222222222222222222',username:'Reporter'},reportId='a'.repeat(25),channelId='333333333333333333',messageId='444444444444444444';
function database(){let row=null;return {get row(){return row;},prepare(sql){return{bind(...values){return{
 async first(){if(sql.startsWith('SELECT'))return row?{...row}:null;if(sql.startsWith('INSERT')){const [userId,now,id,cutoff,retryCutoff]=values;if(row&&!(row.last_attempt_at<=cutoff||(row.report_id===id&&row.status==='failed'&&row.last_attempt_at<=retryCutoff)))return null;row={user_id:userId,last_attempt_at:now,report_id:id,status:'sending'};return {user_id:userId};}throw Error('Unexpected first');},
 async run(){if(sql.includes("status = 'sent'"))row.status='sent';else if(sql.includes("status = 'failed'"))row.status='failed';return {success:true};}
};}};}};}
function request({description='Beim Hochladen wird die Liste nicht aktualisiert.',id=reportId,image,origin='https://example.test',headers={}}={}){const form=new FormData();form.set('description',description);form.set('reportId',id);if(image)form.set('image',image);return new Request('https://example.test/api/bug-reports',{method:'POST',headers:{Origin:origin,...headers},body:form});}
async function harness(run,{dmStatus=200,messageStatus=200,missingId=false}={}){
 const original=globalThis.fetch,calls=[],env={DISCORD_BOT_TOKEN:'server-only-bot-secret',ACCESS_DB:database()};
 globalThis.fetch=async(url,options)=>{calls.push({url:String(url),options});assert.ok(String(url).startsWith('https://discord.com/api/v10/'));assert.equal(options.headers.Authorization,'Bot '+env.DISCORD_BOT_TOKEN);if(String(url).endsWith('/users/@me/channels')){assert.equal(JSON.parse(options.body).recipient_id,BUG_REPORT_RECIPIENT);return Response.json({id:channelId},{status:dmStatus});}return Response.json(missingId?{}:{id:messageId},{status:messageStatus});};
 try{await run({calls,env});}finally{globalThis.fetch=original;}
}
test('bug report is sent to the fixed owner DM with reporter identity and no allowed mentions',async()=>{
 await harness(async({calls,env})=>{const description='Die Suche hängt. @everyone <@&1538601074074849330>';const r=await submitBugReport(request({description}),user,env);assert.equal(r.status,200);assert.equal((await r.json()).success,true);assert.equal(calls.length,2);assert.equal(calls[1].url,'https://discord.com/api/v10/channels/'+channelId+'/messages');const payload=JSON.parse(calls[1].options.body);assert.equal(payload.embeds[0].description,description);assert.match(payload.embeds[0].fields[0].value,new RegExp(user.id));assert.deepEqual(payload.allowed_mentions,{parse:[]});assert.equal(payload.enforce_nonce,true);assert.equal(payload.nonce.length,25);assert.equal(env.ACCESS_DB.row.status,'sent');});
});
test('duplicate submission is confirmed without sending a second DM',async()=>{
 await harness(async({calls,env})=>{assert.equal((await submitBugReport(request(),user,env)).status,200);const retry=await submitBugReport(request(),user,env);assert.equal((await retry.json()).alreadySent,true);assert.equal(calls.length,2);});
});
test('PNG attachment is forwarded as multipart with a fixed safe filename',async()=>{
 const image=new File([new Uint8Array([137,80,78,71,13,10,26,10,0,1])],'private-original-name.png',{type:'image/png'});
 await harness(async({calls,env})=>{assert.equal((await submitBugReport(request({image}),user,env)).status,200);const form=calls[1].options.body;assert.ok(form instanceof FormData);assert.equal(form.get('files[0]').name,'bug-report.png');const payload=JSON.parse(form.get('payload_json'));assert.equal(payload.embeds[0].image.url,'attachment://bug-report.png');assert.ok(!form.get('payload_json').includes('private-original-name'));});
});
test('other-origin requests and logged-out users cannot send reports',async()=>{
 await harness(async({calls,env})=>{assert.equal((await submitBugReport(request({origin:'https://evil.test'}),user,env)).status,403);assert.equal((await submitBugReport(request(),null,env)).status,401);assert.equal((await runtime.fetch(request(),env,{})).status,401);assert.equal(calls.length,0);});
});
test('invalid descriptions, IDs, spoofed images and oversized bodies are rejected before Discord',async()=>{
 await harness(async({calls,env})=>{
  for(const options of [{description:'short'},{description:'x'.repeat(3501)},{id:'invalid'},{image:new File(['<svg/>'],'x.svg',{type:'image/svg+xml'})},{image:new File([new Uint8Array([137,80,78,71,13,10,26,10])],'x.jpg',{type:'image/jpeg'})}])assert.equal((await submitBugReport(request(options),user,env)).status,400);
  assert.equal((await submitBugReport(request({headers:{'Content-Length':String(6*1024*1024)}}),user,env)).status,413);assert.equal(calls.length,0);
 });
});
test('separate reports from the same user respect cooldown',async()=>{
 await harness(async({calls,env})=>{assert.equal((await submitBugReport(request(),user,env)).status,200);const next=await submitBugReport(request({id:'b'.repeat(25)}),user,env);assert.equal(next.status,429);assert.equal(next.headers.get('Retry-After'),'60');assert.equal(calls.length,2);});
});
for(const options of [{dmStatus:403},{messageStatus:403},{missingId:true}])test('Discord failure does not produce a false delivery confirmation '+JSON.stringify(options),async()=>{
 await harness(async({env})=>{const r=await submitBugReport(request(),user,env);assert.equal(r.status,502);assert.equal((await r.json()).success,false);assert.equal(env.ACCESS_DB.row.status,'failed');},options);
});
test('supported images have canonical MIME types, while empty optional attachment is ignored',async()=>{
 assert.equal(await reportImage(null),null);assert.equal(await reportImage(new File([],'empty.png')),null);
 const jpg=await reportImage(new File([new Uint8Array([255,216,255,1])],'a.jpg',{type:'image/jpeg'}));assert.equal(jpg.name,'bug-report.jpg');
 const webp=await reportImage(new File(['RIFF0000WEBP'],'a.webp',{type:'image/webp'}));assert.equal(webp.name,'bug-report.webp');
});

test('report page uses canonical asset fallback without a redirect loop during GitHub outage',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>new Response('',{status:404});
 try{const paths=[];const response=await runtime.fetch(new Request('https://example.test/bug-report'),{ASSETS:{fetch(req){paths.push(new URL(req.url).pathname);return new Response('<!doctype html><h1>Bug melden</h1>');}}},{});assert.equal(response.status,200);assert.equal(response.headers.get('Location'),null);assert.match(response.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);assert.deepEqual(paths,['/bug-report']);}finally{globalThis.fetch=original;}
});
test('Discord rate limit is surfaced with Retry-After instead of a false success',async()=>{
 await harness(async({env})=>{const r=await submitBugReport(request(),user,env);assert.equal(r.status,429);assert.equal(r.headers.get('Retry-After'),'60');assert.equal((await r.json()).success,false);},{messageStatus:429});
});
