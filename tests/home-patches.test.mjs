import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { INLINE_PATCHES_MARKER } from "../src/lib/home-page.js";
import runtime from "../src/runtime-worker.js";
import { repositoryEnv } from "./helpers/repository-env.mjs";

const index = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
const marked = index.replace("<head>", "<head>" + INLINE_PATCHES_MARKER);

async function serveHome(html) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url) =>
    String(url).includes("/contents/public/index.html")
      ? new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } })
      : new Response("", { status: 404 });
  try {
    const env = {
      ...repositoryEnv,
      GITHUB_TOKEN: "test",
      SESSION_SECRET: "test",
      ASSETS: { fetch: async () => new Response("", { status: 404 }) },
    };
    const response = await runtime.fetch(new Request("https://example.test/"), env, {
      waitUntil() {},
    });
    const headers = Object.fromEntries(
      [...response.headers].filter(([name]) => name !== "content-length"),
    );
    return { status: response.status, headers, body: await response.text() };
  } finally {
    globalThis.fetch = original;
  }
}

test("the home page is still patched at runtime without the marker", async () => {
  assert.ok(index.includes("<head>"), "index.html needs a <head> tag for the marker");
  assert.ok(!index.includes(INLINE_PATCHES_MARKER));
  const served = await serveHome(index);
  assert.equal(served.status, 200);
  assert.notEqual(served.body, index);
  assert.ok(served.body.includes('id="manufacturerImage"'), "enhanceHome patch missing");
  assert.ok(served.body.includes("loadAdminAccessList"), "admin UI patch missing");
});

test("a home page with the marker is served unchanged with the same headers", async () => {
  const patched = await serveHome(index);
  const unchanged = await serveHome(marked);
  assert.equal(unchanged.status, 200);
  assert.equal(unchanged.body, marked);
  assert.deepEqual(unchanged.headers, patched.headers);
});
