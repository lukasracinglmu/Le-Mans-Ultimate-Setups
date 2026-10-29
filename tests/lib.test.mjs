import assert from "node:assert/strict";
import test from "node:test";
import { json, safeJson, securityHeaders, withSecurityHeaders } from "../src/lib/http.js";
import { GITHUB_API, githubHeaders, githubRequest } from "../src/lib/github.js";
import { backupBranch, backupRepository, githubBranch, githubRepository } from "../src/config.js";

const SECURITY = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "cross-origin-resource-policy": "same-origin",
};

test("json sends the body with the shared security headers and no-store by default", async () => {
  const r = json({ success: true }, 201);
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json(), { success: true });
  assert.equal(r.headers.get("content-type"), "application/json; charset=UTF-8");
  assert.equal(r.headers.get("cache-control"), "no-store");
  for (const [name, value] of Object.entries(SECURITY)) assert.equal(r.headers.get(name), value);
  assert.match(r.headers.get("content-security-policy"), /frame-ancestors 'none'/);
});

test("json keeps caller headers such as Cache-Control and Retry-After", () => {
  const r = json({ success: false }, 429, {
    "Cache-Control": "private, no-store",
    "Retry-After": "5",
  });
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.equal(r.headers.get("retry-after"), "5");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
});

test("security headers cannot be weakened by caller headers", () => {
  const headers = securityHeaders({ "X-Frame-Options": "ALLOWALL", "Content-Type": "text/plain" });
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("content-type"), "text/plain");
});

test("withSecurityHeaders keeps status, body and existing headers", async () => {
  const r = withSecurityHeaders(
    new Response("asset", { status: 404, statusText: "Missing", headers: { "X-Test": "1" } }),
  );
  assert.equal(r.status, 404);
  assert.equal(r.statusText, "Missing");
  assert.equal(await r.text(), "asset");
  assert.equal(r.headers.get("x-test"), "1");
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
});

test("safeJson returns null for invalid JSON", async () => {
  assert.deepEqual(await safeJson(new Response('{"a":1}')), { a: 1 });
  assert.equal(await safeJson(new Response("not json")), null);
});

test("githubHeaders adds the token only when present and lets callers override", () => {
  assert.equal(githubHeaders(null).Authorization, undefined);
  const headers = githubHeaders("t", { Accept: "application/vnd.github.raw+json" });
  assert.equal(headers.Authorization, "Bearer t");
  assert.equal(headers.Accept, "application/vnd.github.raw+json");
  assert.equal(headers["User-Agent"], "lmu-setups-worker");
  assert.equal(headers["X-GitHub-Api-Version"], "2022-11-28");
});

test("githubRequest targets the configured repository and keeps caller options", async () => {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response("{}");
  };
  try {
    const env = { GITHUB_OWNER: "owner", GITHUB_REPO: "repo", GITHUB_TOKEN: "t" };
    const signal = AbortSignal.timeout(1000);
    await githubRequest(env, "/contents/a?ref=main", {
      method: "PUT",
      signal,
      headers: { Accept: "application/vnd.github.object+json" },
    });
    assert.equal(calls[0].url, GITHUB_API + "/repos/owner/repo/contents/a?ref=main");
    assert.equal(calls[0].options.method, "PUT");
    assert.equal(calls[0].options.signal, signal);
    assert.equal(calls[0].options.headers.Accept, "application/vnd.github.object+json");
    assert.equal(calls[0].options.headers.Authorization, "Bearer t");
    assert.throws(() => githubRequest({ GITHUB_OWNER: "owner" }, "/x"), /nicht konfiguriert/);
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = original;
  }
});

test("repository settings have no built-in fallback", () => {
  assert.equal(githubRepository({}), null);
  assert.equal(githubBranch({}), null);
  assert.equal(backupRepository({ GITHUB_OWNER: "owner" }), null);
  assert.equal(backupBranch({}), null);
  const env = { GITHUB_OWNER: "owner", GITHUB_REPO: "repo", BACKUP_GITHUB_REPO: "backups" };
  assert.equal(githubRepository(env), "owner/repo");
  assert.equal(backupRepository(env), "owner/backups");
  assert.equal(backupRepository({ ...env, BACKUP_GITHUB_OWNER: "other" }), "other/backups");
});
