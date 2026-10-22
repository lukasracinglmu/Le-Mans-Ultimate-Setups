import { cleanSetupFileName } from "./setup-version.js";
// Upload storage is retried by the browser; every attempt first checks Git identity.
const MAX_BODY_BYTES = 26 * 1024 * 1024;

export async function readUploadForm(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) {
    throw Object.assign(new Error('Request zu groß.'), { status: 413 });
  }
  let size = 0;
  const limited = request.body?.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      size += chunk.byteLength;
      if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request zu groß.'), { status: 413 });
      controller.enqueue(chunk);
    }
  }));
  try {
    return await new Response(limited, { headers: { 'Content-Type': request.headers.get('Content-Type') || '' } }).formData();
  } catch (error) {
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('Request zu groß.'), { status: 413 });
    throw error;
  }
}

export async function gitBlobSha(bytes) {
  const header = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
  let digest;
  if (typeof crypto.DigestStream === 'function') {
    const stream = new crypto.DigestStream('SHA-1');
    const writer = stream.getWriter();
    await writer.write(header);
    await writer.write(bytes);
    await writer.close();
    digest = await stream.digest;
  } else {
    const input = new Uint8Array(header.length + bytes.length);
    input.set(header);input.set(bytes, header.length);
    digest = await crypto.subtle.digest('SHA-1', input);
  }
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function base64Parts(bytes) {
  if (typeof bytes.toBase64 === 'function') return [bytes.toBase64()];
  const parts = [];
  // A multiple of three keeps every non-final base64 chunk unpadded.
  for (let i = 0; i < bytes.length; i += 24576) {
    parts.push(btoa(String.fromCharCode(...bytes.subarray(i, i + 24576))));
  }
  return parts;
}

export function encodeBase64(bytes) { return base64Parts(bytes).join(''); }

export function githubFailure(response, data = {}, now = Date.now()) {
  const retryHeader = response.headers.get('Retry-After');
  const reset = Number(response.headers.get('X-RateLimit-Reset')) * 1000;
  const message = String(data.message || '');
  const rateLimited = response.status === 429 || (response.status === 403 && (
    retryHeader !== null || response.headers.get('X-RateLimit-Remaining') === '0' || /rate limit|abuse/i.test(message)
  ));
  if (rateLimited) {
    const requested = retryHeader === null ? 0 : (/^\d+(\.\d+)?$/.test(retryHeader) ? Number(retryHeader) * 1000 : Date.parse(retryHeader) - now);
    const primaryReset = response.headers.get('X-RateLimit-Remaining') === '0' ? reset - now : 0;
    return { error: 'GitHub-Limit erreicht. Der Upload wird nach einer Pause erneut versucht.', code: 'GITHUB_RATE_LIMIT', retryable: true,
      retryAfterMs: Math.max(1000, Number.isFinite(requested) && requested > 0 ? requested : 60000, Number.isFinite(primaryReset) ? primaryReset : 0) };
  }
  if (response.status >= 500 || response.status === 408 || response.status === 409) {
    return { error: 'GitHub vorübergehend nicht verfügbar oder gleichzeitige Änderung.', code: 'GITHUB_TEMPORARY', retryable: true };
  }
  return { error: 'GitHub lehnt den Upload ab (HTTP ' + response.status + ').', code: 'GITHUB_REJECTED', retryable: false };
}

const conflict = () => ({ error: 'Unter diesem Namen liegt bereits eine andere Datei. Bitte die ZIP umbenennen.', code: 'FILE_CONFLICT', retryable: false });
async function jsonOrEmpty(response) { try { return await response.json(); } catch { return {}; } }

export async function persistSetupFile({ file, name, category, vehicle, branch, githubRequest, replaceSha, preserveSha, version, expectedFileSha, forcePreserve }) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b ||
    !((bytes[2] === 3 && bytes[3] === 4) || (bytes[2] === 5 && bytes[3] === 6) || (bytes[2] === 7 && bytes[3] === 8))) {
    return { error: 'Ungültige ZIP-Datei.', code: 'INVALID_FILE', retryable: false };
  }
  const sha = await gitBlobSha(bytes);
  if(expectedFileSha&&sha!==expectedFileSha)return {error:"ZIP-Inhalt stimmt nicht mit der erkannten Doppelung überein.",code:"INVALID_DUPLICATE",retryable:false};
  const originalName=name;
  let preservedStem="",preservedLabel="";
  if(preserveSha){
    preservedLabel=String(version||'ohne Angabe').replace(/[^a-zA-Z0-9._ -]+/g,'-').replace(/\.{2,}/g,'-').slice(0,40)||'ohne Angabe';
    preservedStem=cleanSetupFileName(name).replace(/\.zip$/i,'');
    const suffix=` (Version ${preservedLabel}).zip`;
    name=preservedStem.slice(0,180-suffix.length)+suffix;
  }
  const path = ()=>'/contents/setups/' + [category, vehicle, name].map(encodeURIComponent).join('/');
  const check = async () => {
    const response = await githubRequest(path() + '?ref=' + encodeURIComponent(branch), {
      headers: { Accept: 'application/vnd.github.object+json', 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30000)
    });
    const data = await jsonOrEmpty(response);
    if (response.ok) {
      if (typeof data.sha !== 'string') return { error: 'Ungültige GitHub-Antwort.', retryable: true };
      if (data.sha === sha) return { uploaded: true, alreadyExists: true, sha, name };
      if (replaceSha && data.sha === replaceSha) return null;
      return preserveSha?{nextName:true}:conflict();
    }
    return response.status === 404 ? null : githubFailure(response, data);
  };
  try {
    if(preserveSha){
      const originalPath='/contents/setups/'+[category,vehicle,originalName].map(encodeURIComponent).join('/')+'?ref='+encodeURIComponent(branch);
      const original=await githubRequest(originalPath,{headers:{Accept:'application/vnd.github.object+json','Cache-Control':'no-cache'},signal:AbortSignal.timeout(30000)});
      const meta=await jsonOrEmpty(original);
      if(!forcePreserve&&original.ok&&meta.sha===sha)return {uploaded:true,alreadyExists:true,sha,name:originalName};
      if(original.ok&&meta.sha!==preserveSha)return conflict();
      if(!original.ok&&original.status!==404)return githubFailure(original,meta);
    }
    let existing;
    for(let number=1;number<=100;number++){
      if(preserveSha&&number>1){const suffix=` (Version ${preservedLabel}, ${number}).zip`;name=preservedStem.slice(0,180-suffix.length)+suffix;}
      existing=await check();
      if(!existing?.nextName)break;
    }
    if(existing?.nextName)return {error:'Zu viele gleichnamige Versionen. Bitte die ZIP umbenennen.',code:'FILE_CONFLICT',retryable:false};
    if (existing) return existing;
    const prefix = JSON.stringify({ message: `${replaceSha ? "Replace" : "Add"} setup: ${vehicle} - ${name}`, branch, ...(replaceSha ? {sha:replaceSha} : {}) }).slice(0, -1) + ',"content":"';
    // Keep the large base64 value out of JSON.stringify and avoid rebuilding FormData.
    const body = new Blob([prefix, ...base64Parts(bytes), '"}'], { type: 'application/json' });
    const response = await githubRequest(path(), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, signal: AbortSignal.timeout(60000) });
    const data = await jsonOrEmpty(response);
    if (response.ok && data.content?.sha === sha) return { uploaded: true, sha, alreadyExists: false, name };
    if (response.ok || response.status === 409 || response.status === 422) {
      const verified = await check();
      if(verified?.nextName)return {error:'Dateiname wurde gleichzeitig belegt. Erneuter Versuch folgt.',retryable:true};
      if (verified) return verified;
      if (response.ok || response.status === 409 || /sha|already exists|does not match/i.test(String(data.message))) {
        return { error: 'GitHub-Speicherung noch nicht bestätigt. Erneuter Versuch folgt.', retryable: true };
      }
    }
    return githubFailure(response, data);
  } catch {
    // A lost PUT response is deliberately inconclusive. The next attempt checks SHA first.
    return { error: 'Verbindung zu GitHub unterbrochen. Speicherstand wird beim nächsten Versuch geprüft.', code: 'GITHUB_NETWORK', retryable: true };
  }
}
