import assert from 'node:assert/strict';
import test from 'node:test';
import { readRepoFile, readSiteFile } from '../repo-read.js';
import production from '../production-worker.js';
import runtime from '../runtime-worker.js';
import worker from '../worker.js';

const envBase = { GITHUB_TOKEN:'server-only-secret', GITHUB_BRANCH:'release/test', SESSION_SECRET:'local-test-secret', DISCORD_OWNER_USER_ID:'1033453785416208564' };
const home = '<!doctype html><html><head></head><body><h1>LMU Setups</h1></body></html>';
const request = path => new Request('https://example.test'+path);
async function withFetch(mock, run) {
  const original=globalThis.fetch; globalThis.fetch=mock;
  try { await run(); } finally { globalThis.fetch=original; }
}
async function session(id=envBase.DISCORD_OWNER_USER_ID) {
  const payload=Buffer.from(JSON.stringify({id,username:'Test',exp:Math.floor(Date.now()/1000)+60})).toString('base64url');
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(envBase.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload))).toString('base64url');
  return 'lmu_session='+payload+'.'+sig;
}

test('private homepage uses authenticated raw Contents API without exposing credentials', async()=>{
  await withFetch(async(url,opts)=>{
    assert.equal(String(url),'https://api.github.com/repos/lukasracinglmu/Le-Mans-Ultimate-Setups/contents/index.html?ref=release%2Ftest');
    assert.equal(opts.headers.Authorization,'Bearer '+envBase.GITHUB_TOKEN);
    assert.equal(opts.headers.Accept,'application/vnd.github.raw+json');
    assert.equal(opts.redirect,'error');
    return new Response(home);
  },async()=>{
    const response=await runtime.fetch(request('/'),envBase,{});
    assert.equal(response.status,200); assert.equal(response.headers.get('location'),null);
    assert.match(response.headers.get('content-type'),/text\/html/);
    const html=await response.text(); assert.match(html,/LMU Setups/);assert.ok(!html.includes(envBase.GITHUB_TOKEN));
  });
});

for(const failure of ['private-404','network-error']) {
  test('GitHub '+failure+' falls back to canonical asset root with enhancements',async()=>{
    const paths=[];
    const env={...envBase,ASSETS:{async fetch(req){paths.push(new URL(req.url).pathname);return new URL(req.url).pathname==='/index.html'?Response.redirect('https://example.test/',307):new Response(home);}}};
    await withFetch(async()=>{if(failure==='network-error')throw Error('offline');return new Response('',{status:404});},async()=>{
      const r=await production.fetch(request('/'),env,{});
      assert.equal(r.status,200);assert.equal(r.headers.get('location'),null);
      assert.match(await r.text(),/manufacturerPrev/);
      assert.deepEqual(paths,['/']);
      const base=await worker.fetch(request('/'),env,{}); assert.equal(base.status,200);
      assert.deepEqual(paths,['/','/']);
    });
  });
}

test('failed or redirecting asset fallback returns 503 without Location',async()=>{
  await withFetch(async()=>new Response('',{status:404}),async()=>{
    for(const fallback of [()=>Response.redirect('https://example.test/',307),()=>new Response('',{status:404}),()=>{throw Error('offline');}]){
      const r=await runtime.fetch(request('/'),{...envBase,ASSETS:{fetch:fallback}},{});
      assert.equal(r.status,503);assert.equal(r.headers.get('location'),null);assert.equal(r.headers.get('cache-control'),'no-store');
    }
  });
});

test('catalog denies anonymous and unprivileged users before any GitHub or asset read',async()=>{
  let reads=0;
  await withFetch(async()=>{reads++;throw Error('unexpected');},async()=>{
    const env={...envBase,ASSETS:{fetch(){reads++;throw Error('unexpected');}}};
    assert.equal((await runtime.fetch(request('/setups.json'),env,{})).status,401);
    const req=new Request('https://example.test/setups.json',{headers:{Cookie:await session('222222222222222222')}});
    assert.equal((await runtime.fetch(req,env,{})).status,403);
    assert.equal(reads,0);
  });
});

test('authorized catalog reads private GitHub and retains protected asset fallback',async()=>{
  for(const available of [true,false]){
    let assets=0;
    await withFetch(async(url,opts)=>{
      assert.match(String(url),/\/contents\/setups.json\?ref=/);assert.equal(opts.headers.Authorization,'Bearer '+envBase.GITHUB_TOKEN);
      return available?Response.json({categories:[]}):new Response('',{status:404});
    },async()=>{
      const env={...envBase,ASSETS:{fetch(req){assets++;assert.equal(new URL(req.url).pathname,'/setups.json');return Response.json({categories:[]});}}};
      const req=new Request('https://example.test/setups.json',{headers:{Cookie:await session()}});
      const r=await runtime.fetch(req,env,{});assert.equal(r.status,200);assert.deepEqual(await r.json(),{categories:[]});assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(assets,available?0:1);
    });
  }
});

test('manufacturer image reads private content and supplies image MIME type',async()=>{
  await withFetch(async(url,opts)=>{
    assert.match(String(url),/\/contents\/assets\/manufacturers\/bealien.webp/);assert.equal(opts.headers.Authorization,'Bearer '+envBase.GITHUB_TOKEN);return new Response(new Uint8Array([1,2,3]));
  },async()=>{
    const r=await production.fetch(request('/assets/manufacturers/bealien.webp'),envBase,{});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'image/webp');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),new Uint8Array([1,2,3]));
  });
});

test('private ZIP download streams authenticated content after permission validation',async()=>{
  let calls=0;
  await withFetch(async(url,opts)=>{
    calls++;assert.match(String(url),/\/contents\/setups\/Hypercar\/Test%20Car\/test.zip/);assert.equal(opts.headers.Authorization,'Bearer '+envBase.GITHUB_TOKEN);
    return new Response(new ReadableStream({start(controller){controller.enqueue(new Uint8Array([80,75,3,4]));controller.close();}}));
  },async()=>{
    const path='/api/setups/download?category=Hypercar&vehicle=Test%20Car&name=test.zip';
    assert.equal((await runtime.fetch(request(path),envBase,{})).status,401);assert.equal(calls,0);
    const req=new Request('https://example.test'+path,{headers:{Cookie:await session()}});
    const r=await runtime.fetch(req,envBase,{});assert.equal(r.status,200);assert.equal(r.headers.get('content-type'),'application/zip');assert.match(r.headers.get('content-disposition'),/test.zip/);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.deepEqual(new Uint8Array(await r.arrayBuffer()),new Uint8Array([80,75,3,4]));assert.equal(calls,1);
  });
});

test('private file path segments and branch are encoded independently',async()=>{
  await withFetch(async(url)=>{assert.ok(String(url).includes('/contents/setups/A%20B/a%23b.zip?ref=release%2Ftest'));return new Response('ok');},async()=>{assert.equal((await readRepoFile(envBase,'setups/A B/a#b.zip')).status,200);});
});
