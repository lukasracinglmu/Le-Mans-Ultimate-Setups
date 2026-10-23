import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {submitBugReport,BUG_REPORT_RECIPIENT} from '../bug-reports.js';

for(const failure of [null,'channel','message','network'])test('report acknowledgement: '+failure,async()=>{
 const original=globalThis.fetch,calls=[];
 let status=null;
 const env={DISCORD_BOT_TOKEN:'test',ACCESS_DB:{async batch(){},prepare(sql){return {bind(){return this;},async first(){if(sql.startsWith('SELECT last_attempt'))return status==='sent'?{status,report_id:'a'.repeat(25)}:null;return {id:7};},async run(){if(sql.includes("SET status='sent'"))status='sent';}};}}};
 globalThis.fetch=async(url,options)=>{
  calls.push({url,body:JSON.parse(options.body)});
  if(calls.length===3&&failure==='network')throw Error('offline');
  const failed=(calls.length===3&&failure==='channel')||(calls.length===4&&failure==='message');
  return Response.json({id:'333333333333333333'},{status:failed?403:200});
 };
 const request=()=>{const form=new FormData();for(const [key,value] of Object.entries({title:'Test bug',priority:'Medium',description:'Test description',reportId:'a'.repeat(25)}))form.set(key,value);return new Request('https://example.test/api/bug-reports',{method:'POST',headers:{Origin:'https://example.test'},body:form});};
 try{
  const response=await submitBugReport(request(),{id:'222222222222222222'},env);
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{success:true,ticket:'0007'});
  assert.equal(status,'sent');
  assert.equal(calls[0].body.recipient_id,BUG_REPORT_RECIPIENT);
  assert.equal(calls[2].body.recipient_id,'222222222222222222');
  if(!failure){assert.equal(calls[3].body.embeds[0].title,'Ticket 0007 erstellt');assert.match(calls[3].body.embeds[0].description,/erfolgreich erstellt und wird bearbeitet/);}
  const count=calls.length;
  assert.equal((await (await submitBugReport(request(),{id:'222222222222222222'},env)).json()).alreadySent,true);
  assert.equal(calls.length,count);
 }finally{globalThis.fetch=original;}
});

test('ticket numbers use white in every status',()=>{
 const html=readFileSync(new URL('../bug-tickets.html',import.meta.url),'utf8');
 assert.match(html,/\.nr\{color:#fff;/);
});
