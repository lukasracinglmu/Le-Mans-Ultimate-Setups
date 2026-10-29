import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  isBackupSlot,
  createScheduledBackup,
  validateBackupConfiguration,
  backupCompletionApi,
  backupOverview,
  verifyBackupIdentity,
} from "../src/automatic-backup.js";
import { fullAdminApi } from "../src/full-admin.js";
import { repositoryEnv } from "./helpers/repository-env.mjs";

function database() {
  const db = new DatabaseSync(":memory:");
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return statement(sql, args);
        },
        ...statement(sql, []),
      };
    },
  };
  function statement(sql, args) {
    return {
      async run() {
        return { meta: { changes: Number(db.prepare(sql).run(...args).changes) } };
      },
      async first() {
        return db.prepare(sql).get(...args) || null;
      },
      async all() {
        return { results: db.prepare(sql).all(...args) };
      },
    };
  }
}
const source = "a".repeat(40),
  sourceTree = "b".repeat(40),
  snapshot = "c".repeat(40),
  root = "d".repeat(40);
const env = () => ({
  ...repositoryEnv,
  ACCESS_DB: database(),
  GITHUB_TOKEN: "source-test",
  BACKUP_GITHUB_TOKEN: "destination-test",
  DISCORD_BOT_TOKEN: "bot-test",
  DISCORD_OWNER_USER_ID: "1033453785416208564",
  SITE_URL: "https://example.test",
});
let pair, jwk;
async function signed(job, claims = {}) {
  if (!pair) {
    pair = await crypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    jwk = {
      ...(await crypto.subtle.exportKey("jwk", pair.publicKey)),
      kid: "backup-tests",
      alg: "RS256",
      use: "sig",
    };
  }
  const now = Math.floor(Date.now() / 1000);
  const head = Buffer.from(JSON.stringify({ alg: "RS256", kid: jwk.kid })).toString("base64url");
  const body = Buffer.from(
    JSON.stringify({
      iss: "https://token.actions.githubusercontent.com",
      aud: "https://example.test",
      repository: "lukasracinglmu/Le-Mans-Ultimate-Setups",
      ref: "refs/heads/main",
      workflow_ref:
        "lukasracinglmu/Le-Mans-Ultimate-Setups/.github/workflows/daily-repository-backup.yml@refs/heads/main",
      event_name: "repository_dispatch",
      exp: now + 600,
      nbf: now - 5,
      run_id: "12345",
      ...claims,
    }),
  ).toString("base64url");
  const signature = Buffer.from(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      pair.privateKey,
      new TextEncoder().encode(head + "." + body),
    ),
  ).toString("base64url");
  return new Request("https://example.test/api/internal/backups/complete", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + head + "." + body + "." + signature,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ job_id: job, success: true }),
  });
}
async function mocked(run, { complete = false, mdOnly = false } = {}) {
  const original = fetch,
    requests = [];
  let payload;
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    requests.push({ url: String(url), ...options });
    if (path.endsWith("/.well-known/jwks")) return Response.json({ keys: [jwk] });
    if (path.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: source } });
    if (path.endsWith("/dispatches")) {
      payload = JSON.parse(options.body).client_payload;
      return new Response(null, { status: 204 });
    }
    if (complete) {
      if (path.includes("/git/ref/tags/"))
        return Response.json({ object: { type: "commit", sha: snapshot } });
      if (path.endsWith("/git/commits/" + source))
        return Response.json({ tree: { sha: sourceTree } });
      if (path.endsWith("/git/commits/" + snapshot)) return Response.json({ tree: { sha: root } });
      if (path.endsWith("/git/trees/" + root))
        return Response.json({
          tree: mdOnly
            ? [{ path: "README.md", type: "blob", sha: "e".repeat(40) }]
            : [{ path: "repository", type: "tree", sha: sourceTree }],
        });
      if (path.endsWith("/.backup.json"))
        return Response.json({
          content: Buffer.from(
            JSON.stringify({
              job_id: payload.job_id,
              source_sha: source,
              source_tree: sourceTree,
              file_count: 2,
              size_bytes: 123,
            }),
          ).toString("base64"),
        });
      if (path.endsWith("/git/trees/" + sourceTree))
        return Response.json({
          tree: [
            { type: "blob", size: 100 },
            { type: "blob", size: 23 },
          ],
          truncated: false,
        });
      if (path.endsWith("/users/@me/channels")) return Response.json({ id: "private-owner-dm" });
      if (path.endsWith("/channels/private-owner-dm/messages")) return Response.json({ id: "dm" });
    }
    throw Error("Unexpected mock request " + url);
  };
  try {
    return await run(requests, () => payload);
  } finally {
    globalThis.fetch = original;
  }
}

test("Zeitplan trifft Mitternacht und Mittag Berlin auch über Sommerzeitwechsel", () => {
  for (const time of [
    "2026-10-29T23:00:00Z",
    "2026-10-29T11:00:00Z",
    "2026-07-01T22:00:00Z",
    "2026-07-01T10:00:00Z",
  ])
    assert.equal(isBackupSlot(new Date(time)), true, time);
  for (const time of ["2026-10-29T12:00:00Z", "2026-10-29T11:01:00Z", "2026-07-01T11:00:00Z"])
    assert.equal(isBackupSlot(new Date(time)), false, time);
});
test("Automatische Sicherung wird nur einmal eingereiht; Annahme ist kein falscher Erfolg", async () => {
  await mocked(async (requests) => {
    const e = env(),
      now = new Date("2026-10-29T11:00:00Z");
    const first = await createScheduledBackup(e, now),
      second = await createScheduledBackup(e, now);
    assert.equal(first.status, "pending");
    assert.equal(first.tag, "backup-2026-29-10/12-00-00");
    assert.equal(first.id, second.id);
    assert.equal(requests.filter((r) => r.url.endsWith("/dispatches")).length, 1);
    assert.equal(
      requests.some((r) => r.url.includes("discord.com")),
      false,
    );
  });
});
test("Unpassende Stunden erzeugen weder Sicherung noch GitHub-Anfrage", async () => {
  await mocked(async (requests) => {
    assert.equal(
      (await createScheduledBackup(env(), new Date("2026-10-29T12:00:00Z"))).skipped,
      true,
    );
    assert.equal(requests.length, 0);
  });
});
test("Validierung benötigt signierten Workflow und sendet keine DM", async () => {
  await mocked(async (requests) => {
    const e = env(),
      job = await validateBackupConfiguration(e);
    const invalid = await backupCompletionApi(
      new Request("https://example.test/api/internal/backups/complete", {
        method: "POST",
        body: "{}",
      }),
      e,
    );
    assert.equal(invalid.status, 401);
    const request = await signed(job.id),
      result = await backupCompletionApi(request, e);
    assert.equal((await result.json()).status, "validated");
    assert.equal(
      requests.some((r) => r.url.includes("discord.com")),
      false,
    );
    assert.equal((await backupOverview(e)).backups.length, 0);
    for (const claims of [
      { repository: "other/repo" },
      { ref: "refs/heads/dev" },
      { event_name: "pull_request" },
      { aud: "https://evil.test" },
      { exp: 1 },
    ])
      assert.equal(await verifyBackupIdentity(await signed(job.id, claims), e), null);
  });
});
test("Vollständiger Baum wird geprüft, erst dann Owner-DM; wiederholter Callback spammt nicht", async () => {
  await mocked(
    async (requests) => {
      const e = env(),
        job = await createScheduledBackup(e, new Date("2026-10-29T11:00:00Z"));
      const result = await backupCompletionApi(await signed(job.id), e);
      assert.equal(result.status, 200);
      assert.equal((await result.json()).status, "completed");
      await backupCompletionApi(await signed(job.id), e);
      const channels = requests.filter((r) => r.url.endsWith("/users/@me/channels"));
      assert.equal(channels.length, 1);
      assert.equal(JSON.parse(channels[0].body).recipient_id, "1033453785416208564");
      const overview = await backupOverview(e),
        row = overview.backups[0];
      assert.equal(row.verified, true);
      assert.equal(row.fileCount, 2);
      assert.equal(row.size, 123);
      assert.ok(
        row.viewUrl.includes(
          "LMU-Database-Backups/tree/main/backups/2026-10-29/12-00-00/repository",
        ),
      );
      assert.equal(Date.parse(row.deleteAt) - Date.parse(row.createdAt), 14 * 86400000);
    },
    { complete: true },
  );
});
test("MD-Index allein wird ausdrücklich abgelehnt und erzeugt keine Erfolgsmeldung", async () => {
  await mocked(
    async (requests) => {
      const e = env(),
        job = await createScheduledBackup(e, new Date("2026-10-29T11:00:00Z"));
      assert.equal((await backupCompletionApi(await signed(job.id), e)).status, 409);
      const row = (await backupOverview(e)).backups[0];
      assert.equal(row.status, "failed");
      assert.equal(row.verified, false);
      assert.equal(
        requests.some((r) => r.url.includes("discord.com")),
        false,
      );
    },
    { complete: true, mdOnly: true },
  );
});
test("Full Admin, Server-Owner-Rolle und normale Nutzer erhalten keine Backup-Freigabe", async () => {
  for (const user of [
    { id: "222222222222222222", fullAdmin: true },
    { id: "222222222222222222", isOwner: true },
    { id: "222222222222222222" },
  ]) {
    const worker = { fetch: async () => Response.json({ loggedIn: true, user }) };
    for (const [method, path] of [
      ["GET", "/api/admin/backups"],
      ["POST", "/api/admin/backup"],
    ]) {
      const result = await fullAdminApi(
        new Request("https://example.test" + path, { method }),
        env(),
        {},
        worker,
      );
      assert.equal(result.status, 403);
    }
  }
  const worker = {
    fetch: async () => Response.json({ loggedIn: true, user: { id: "1033453785416208564" } }),
  };
  assert.equal(
    (await fullAdminApi(new Request("https://example.test/api/admin/backups"), env(), {}, worker))
      .status,
    200,
  );
});
