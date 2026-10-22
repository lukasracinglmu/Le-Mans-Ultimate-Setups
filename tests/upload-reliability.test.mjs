import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, webcrypto } from 'node:crypto';
import { encodeBase64, gitBlobSha, githubFailure, persistSetupFile, readUploadForm } from '../upload-storage.js';
import worker from '../worker.js';
import productionWorker from '../production-worker.js';

const bytes = new Uint8Array([80,75,3,4,1,2,3,4,255]);
const file = new File([bytes], 'test.zip');
const sha = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const params = { file, name:file.name, category:'Hypercar', vehicle:'Test Car', branch:'main' };

test('Git identity and base64 match Git/Node, including chunk boundaries', async () => {
  for (const length of [0,1,2,3,24575,24576,24577,49155,1024*1024]) {
    const data=Uint8Array.from({length},(_,i)=>i%256);
    assert.equal(encodeBase64(data),Buffer.from(data).toString('base64'));
    assert.equal(await gitBlobSha(data),createHash('sha1').update(`blob ${length}\0`).update(data).digest('hex'));
  }
});

test('native digest stream path uses the same Git identity', async () => {
  const original=webcrypto.DigestStream;
  webcrypto.DigestStream=class extends WritableStream {
    constructor(algorithm) {
      const hash=createHash(algorithm),chunks=[];
      super({write(chunk){chunks.push(chunk);hash.update(chunk);},close(){resolve(hash.digest().buffer.slice(0));}});
      let resolve;this.digest=new Promise(r=>resolve=r);
    }
  };
  try { assert.equal(await gitBlobSha(bytes),sha); }
  finally { if(original)webcrypto.DigestStream=original;else delete webcrypto.DigestStream; }
});

test('successful GitHub writes include intact ZIP data and verified SHA', async () => {
  let calls=0;
  const result=await persistSetupFile({...params,githubRequest:async(path,options)=>{
    calls++;
    if(calls===1)return Response.json({message:'Not Found'},{status:404});
    assert.equal(options.method,'PUT');
    const body=JSON.parse(await options.body.text());
    assert.equal(body.content,Buffer.from(bytes).toString('base64'));
    assert.equal(body.branch,'main');
    return Response.json({content:{sha}},{status:201});
  }});
  assert.equal(result.uploaded,true);assert.equal(result.alreadyExists,false);assert.equal(calls,2);
});

test('lost PUT response is recovered by the next attempt without a second write', async () => {
  let stored=false,writes=0;
  const githubRequest=async(path,options)=>{
    if(options.method==='PUT'){stored=true;writes++;throw Error('connection lost after write');}
    return stored?Response.json({sha}):Response.json({message:'Not Found'},{status:404});
  };
  const first=await persistSetupFile({...params,githubRequest});assert.equal(first.retryable,true);
  const resumed=await persistSetupFile({...params,githubRequest});assert.equal(resumed.uploaded,true);assert.equal(resumed.alreadyExists,true);assert.equal(writes,1);
});

test('a different file with the same name is never overwritten', async () => {
  let calls=0;
  const result=await persistSetupFile({...params,githubRequest:async()=>{calls++;return Response.json({sha:'different'});}});
  assert.equal(result.code,'FILE_CONFLICT');assert.equal(result.retryable,false);assert.equal(calls,1);
});

test('concurrent branch conflicts are retryable and do not report success', async () => {
  let calls=0;
  const result=await persistSetupFile({...params,githubRequest:async()=>++calls===2?Response.json({message:'conflict'},{status:409}):Response.json({message:'Not Found'},{status:404})});
  assert.equal(result.retryable,true);assert.notEqual(result.uploaded,true);
});

test('GitHub read failures cannot be mistaken for an absent file', async () => {
  for(const status of [401,403,429,500,502,503]){
    let writes=0;
    const result=await persistSetupFile({...params,githubRequest:async(path,options)=>{
      if(options.method==='PUT')writes++;
      return Response.json({message:'error'},{status});
    }});
    assert.equal(writes,0);assert.notEqual(result.uploaded,true);
    assert.equal(result.retryable,status===429||status>=500);
  }
});

test('retry delays respect Retry-After, primary resets and secondary limits', () => {
  const now=100000;
  assert.equal(githubFailure(new Response('',{status:429,headers:{'Retry-After':'75'}}),{},now).retryAfterMs,75000);
  assert.equal(githubFailure(new Response('',{status:403,headers:{'X-RateLimit-Remaining':'0','X-RateLimit-Reset':'500'}}),{},now).retryAfterMs,400000);
  assert.equal(githubFailure(new Response('',{status:403}),{message:'secondary rate limit'},now).retryAfterMs,60000);
  assert.equal(githubFailure(new Response('',{status:403}),{message:'Resource not accessible'},now).retryable,false);
});

test('body limit is enforced before parsing oversized Content-Length', async () => {
  await assert.rejects(readUploadForm(new Request('https://example.test/',{method:'POST',body:'x',headers:{'Content-Length':String(27*1024*1024)}})),error=>error.status===413);
});

test('streamed multipart uploads without Content-Length are bounded too', async () => {
  const boundary='upload-size-test',chunk=new Uint8Array(1024*1024);let part=0;
  const body=new ReadableStream({pull(controller){
    if(part===0)controller.enqueue(new TextEncoder().encode('--'+boundary+'\r\nContent-Disposition: form-data; name=\"files\"; filename=\"large.zip\"\r\nContent-Type: application/zip\r\n\r\n'));
    else if(part<=27)controller.enqueue(chunk);
    else {controller.enqueue(new TextEncoder().encode('\r\n--'+boundary+'--\r\n'));controller.close();}
    part++;
  }});
  const request=new Request('https://example.test/',{method:'POST',body,duplex:'half',headers:{'Content-Type':'multipart/form-data; boundary='+boundary}});
  assert.equal(request.headers.get('Content-Length'),null);
  await assert.rejects(readUploadForm(request),error=>error.status===413);
});

test('invalid ZIP signatures are rejected before contacting GitHub', async () => {
  let calls=0;
  const result=await persistSetupFile({...params,file:new File(['PKxx'],'fake.zip'),githubRequest:async()=>{calls++;}});
  assert.equal(result.code,'INVALID_FILE');assert.equal(calls,0);
});

async function ownerCookie(secret){
  const payload=Buffer.from(JSON.stringify({id:'1033453785416208564',username:'test',exp:Math.floor(Date.now()/1000)+60})).toString('base64url');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))).toString('base64url');
  return 'lmu_session='+payload+'.'+signature;
}

test('full upload handler recovers ZIP after D1 fails without re-uploading its bytes', async () => {
  const original=globalThis.fetch;let stored=false,writes=0,d1Calls=0;
  globalThis.fetch=async(url,options)=>{
    if(options.method==='PUT'){stored=true;writes++;return Response.json({content:{sha}},{status:201});}
    return stored?Response.json({sha}):Response.json({message:'Not Found'},{status:404});
  };
  const env={SESSION_SECRET:'local-test-secret',ACCESS_DB:{prepare(){return {bind(){return {async run(){d1Calls++;if(d1Calls===1)throw Error('D1 unavailable');}};}};}}};
  const cookie=await ownerCookie(env.SESSION_SECRET);
  const request=()=>{const form=new FormData();form.set('category','Hypercar');form.set('vehicle','Test Car');form.set('files',file);form.set('version','v2');return new Request('https://example.test/api/setups/upload',{method:'POST',headers:{Cookie:cookie},body:form});};
  try{
    const failed=await productionWorker.fetch(request(),env);assert.equal(failed.status,503);assert.equal((await failed.json()).retryable,true);
    const resumed=await productionWorker.fetch(request(),env);assert.equal(resumed.status,200);const data=await resumed.json();assert.equal(data.uploaded[0].version,'v2');assert.equal(data.uploaded[0].alreadyExists,true);assert.equal(writes,1);assert.equal(d1Calls,2);
    const unauth=await worker.fetch(new Request('https://example.test/api/setups/upload',{method:'POST',body:'x'}),env);assert.equal(unauth.status,401);
  }finally{globalThis.fetch=original;}
});
