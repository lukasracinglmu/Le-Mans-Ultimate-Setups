import assert from "node:assert/strict";
import test from "node:test";
import { ownerUserId, setupRequestRoleId, setupSupplyRoleId } from "../src/config.js";
import runtime from "../src/runtime-worker.js";
import {
  canConfirmSetupRequest,
  SETUP_CONFIRMATION_WHITELIST,
} from "../discord-presence/request-manufacturers.js";

const owner = "1033453785416208564";
const roles = {
  DISCORD_GUILD_ID: "1464926567401652418",
  DISCORD_DATABASE_ROLE_ID: "1464926567401652420",
  DISCORD_UPLOAD_ROLE_ID: "1538601074074849330",
  DISCORD_OWNER_ROLE_ID: "1464926567401652423",
};

test("missing or blank values are null instead of a built-in ID", () => {
  for (const env of [{}, { DISCORD_OWNER_USER_ID: "" }, { DISCORD_OWNER_USER_ID: "   " }])
    assert.equal(ownerUserId(env), null);
  assert.equal(ownerUserId({ DISCORD_OWNER_USER_ID: ` ${owner} ` }), owner);
  assert.equal(setupRequestRoleId({}), null);
  assert.equal(setupSupplyRoleId({}), null);
});

test("role variables are read in their documented order", () => {
  assert.equal(
    setupRequestRoleId({ DISCORD_SETUP_REQUEST_ROLE_ID: "1", DISCORD_UPLOAD_ROLE_ID: "2" }),
    "1",
  );
  assert.equal(setupRequestRoleId({ DISCORD_UPLOAD_ROLE_ID: "2" }), "2");
  assert.equal(setupSupplyRoleId({ DISCORD_UPLOAD_ROLE_ID: "2", DISCORD_ROLE_ID: "3" }), "2");
  assert.equal(setupSupplyRoleId({ DISCORD_ROLE_ID: "3" }), "3");
});

async function sessionCookie(userId, secret) {
  const configuration = [
    roles.DISCORD_GUILD_ID,
    roles.DISCORD_DATABASE_ROLE_ID,
    roles.DISCORD_UPLOAD_ROLE_ID,
    roles.DISCORD_OWNER_ROLE_ID,
  ].join(":");
  const payload = Buffer.from(
    JSON.stringify({
      id: userId,
      username: "Owner",
      accessToken: "test-oauth",
      exp: Math.floor(Date.now() / 1000) + 3600,
      memberSnapshot: {
        userId,
        configuration,
        roles: [roles.DISCORD_DATABASE_ROLE_ID],
        checkedAt: Date.now(),
      },
    }),
  ).toString("base64url");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = Buffer.from(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)),
  ).toString("base64url");
  return "lmu_session=" + payload + "." + signature;
}

async function me(env) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response("", { status: 404 });
  try {
    const request = new Request("https://example.test/api/me", {
      headers: { Cookie: await sessionCookie(owner, env.SESSION_SECRET) },
    });
    return (await (await runtime.fetch(request, env, { waitUntil() {} })).json()).user;
  } finally {
    globalThis.fetch = original;
  }
}

test("owner rights require DISCORD_OWNER_USER_ID instead of a built-in ID", async () => {
  const base = { ...roles, SESSION_SECRET: "config-test-secret" };
  const configured = await me({ ...base, DISCORD_OWNER_USER_ID: owner });
  assert.equal(configured.isOwner, true);
  assert.equal(configured.fullAdmin, true);
  const unconfigured = await me(base);
  assert.equal(unconfigured.isOwner, false);
  assert.equal(unconfigured.fullAdmin, false);
  assert.equal(unconfigured.canViewBackups, false);
});

test("without a supply role only whitelisted users may confirm setup requests", () => {
  const roleId = setupSupplyRoleId({});
  assert.equal(
    canConfirmSetupRequest("222222222222222222", [roles.DISCORD_UPLOAD_ROLE_ID], roleId),
    false,
  );
  assert.equal(canConfirmSetupRequest(SETUP_CONFIRMATION_WHITELIST[0], [], roleId), true);
});
