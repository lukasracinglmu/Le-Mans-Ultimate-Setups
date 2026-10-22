// GitHub credentials stay in the Worker, including when the repository is private.
export async function readRepoFile(env, path) {
  const owner = env.GITHUB_OWNER || "lukasracinglmu";
  const repo = env.GITHUB_REPO || "Le-Mans-Ultimate-Setups";
  const branch = env.GITHUB_BRANCH || "main";
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const headers = {
    Accept: "application/vnd.github.raw+json",
    "User-Agent": "lmu-setups-worker",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
  try {
    return await fetch(url, { headers, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  } catch {
    return new Response("Repository momentan nicht erreichbar.", { status: 502 });
  }
}

export async function readSiteFile(request, env, path) {
  const source = await readRepoFile(env, path);
  if (source.ok) return source;
  await source.body?.cancel();
  try {
    // The asset binding canonicalizes /index.html to /. Fetch / directly to
    // avoid sending a redirect back through the same failing Worker route.
    const assetPath = path === "index.html" ? "/" : "/" + (path.endsWith(".html")?path.slice(0,-5):path);
    const fallback = await env.ASSETS.fetch(new Request(new URL(assetPath, request.url)));
    if (fallback.ok) return fallback;
    await fallback.body?.cancel();
  } catch {}
  return new Response("Website momentan nicht verfügbar. Bitte später erneut versuchen.", {
    status: 503,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "Retry-After": "30", "X-Content-Type-Options": "nosniff" }
  });
}
