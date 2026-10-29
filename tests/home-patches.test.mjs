import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import runtime from "../src/runtime-worker.js";
import { repositoryEnv } from "./helpers/repository-env.mjs";

const index = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

// Headers of GET / in production before the runtime patches moved into index.html.
const HOME_HEADERS = {
  "cache-control": "private, no-store",
  "content-type": "text/html; charset=utf-8",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
};

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
      [...response.headers].filter(([name]) => name !== "content-length").sort(),
    );
    return { status: response.status, headers, body: await response.text() };
  } finally {
    globalThis.fetch = original;
  }
}

test("the home page is served exactly as stored in index.html", async () => {
  const served = await serveHome(index);
  assert.equal(served.status, 200);
  assert.equal(served.body, index);
  assert.deepEqual(served.headers, HOME_HEADERS);
});

test("index.html contains the former runtime patches itself", () => {
  assert.ok(index.includes('id="manufacturerImage"'), "manufacturer carousel missing");
  assert.ok(index.includes("const setLoginControls="), "login controls script missing");
  assert.ok(index.includes("loadAdminAccessList"), "admin access list script missing");
});
