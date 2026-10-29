import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
const text = readFileSync(new URL("../src/ui-hotfix.js", import.meta.url), "utf8");
const moduleContext = vm.createContext({});
vm.runInContext(
  text.replace(/^import .*;\s*/gm, "").replace("export default {", "const worker = {") +
    ";globalThis.script=HOTFIX_JS;",
  moduleContext,
);
const script = moduleContext.script;
const access = script.slice(
  script.indexOf("  const accessBox="),
  script.indexOf("  const syncCarFilter="),
);
const auth = script.slice(script.indexOf("  const authorize="), script.indexOf("  const init="));
async function run(data, { ok = true, invalid = false, network = false } = {}) {
  const nodes = new Map();
  let loads = 0,
    routes = 0,
    requests = 0;
  const node = () => ({
    innerHTML: "",
    classList: { add() {}, remove() {}, toggle() {} },
    style: {},
    addEventListener() {},
    remove() {
      nodes.delete("databaseAccessState");
    },
  });
  for (const id of ["loginButton", "account", "accountName", "accountAvatar", "retryRoleCheck"])
    nodes.set(id, node());
  const root = { dataset: {} },
    main = {
      prepend(el) {
        nodes.set(el.id, el);
      },
    };
  const c = vm.createContext({
    document: {
      documentElement: root,
      getElementById: (id) => nodes.get(id) || null,
      querySelector: () => main,
      querySelectorAll: () => [],
      createElement: node,
    },
    fetch: async () => {
      requests++;
      if (network) throw Error("offline");
      return {
        ok,
        json: async () => {
          if (invalid) throw Error("bad json");
          return data;
        },
      };
    },
    setTimeout: (fn) => {
      fn();
      return 0;
    },
    Promise,
    loadData: async () => {
      loads++;
    },
    openSetupFromQuery: async () => {
      routes++;
    },
    syncCarFilter() {},
    initVersionEditor() {},
    refreshVehicleCounts() {},
  });
  vm.runInContext("let currentUser=null;" + access + auth + ";globalThis.authorize=authorize;", c);
  await c.authorize();
  return {
    mode: root.dataset.dbAccess,
    html: nodes.get("databaseAccessState")?.innerHTML || "",
    loads,
    routes,
    requests,
  };
}
test("temporary Discord errors do not pretend the user has missing roles", async () => {
  const s = await run({
    loggedIn: true,
    databaseAccess: false,
    rolesAvailable: false,
    reauthorize: false,
    user: {},
  });
  assert.equal(s.mode, "unavailable");
  assert.match(s.html, /Erneut prüfen/);
  assert.doesNotMatch(s.html, /erforderliche Discord-Rolle/);
});
test("expired or missing membership authorization gets an actionable login link", async () => {
  const s = await run({
    loggedIn: true,
    databaseAccess: false,
    rolesAvailable: false,
    reauthorize: true,
    user: {},
  });
  assert.equal(s.mode, "reauthorize");
  assert.match(s.html, /href="\/auth\/discord"/);
});
test("actual role denial stays distinct from an unavailable service", async () => {
  const s = await run({ loggedIn: true, databaseAccess: false, rolesAvailable: true, user: {} });
  assert.equal(s.mode, "forbidden");
  assert.equal(s.requests, 1);
});
test("authorized Team accounts load the catalog and preserve route restoration", async () => {
  const s = await run({
    loggedIn: true,
    databaseAccess: true,
    rolesAvailable: true,
    user: { username: "Team", canUpload: false },
  });
  assert.equal(s.mode, "authorized");
  assert.equal(s.loads, 1);
  assert.equal(s.routes, 1);
});
test("anonymous user still sees normal Discord login", async () => {
  const s = await run({ loggedIn: false, databaseAccess: false });
  assert.equal(s.mode, "login");
});
test("invalid or failed API responses do not silently log the user out", async () => {
  for (const opts of [{ ok: false }, { invalid: true }, { network: true }]) {
    const s = await run({}, opts);
    assert.equal(s.mode, "unavailable");
  }
});
test("rate limited checks stop immediate retry storms", async () => {
  const s = await run({
    loggedIn: true,
    databaseAccess: false,
    rolesAvailable: false,
    roleCheckError: "RATE_LIMITED",
    retryAfterMs: 60000,
    user: {},
  });
  assert.equal(s.mode, "unavailable");
  assert.equal(s.requests, 1);
});
