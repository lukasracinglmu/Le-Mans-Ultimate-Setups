import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const hotfix = await readFile(new URL("../ui-hotfix.js", import.meta.url), "utf8");

// True when the element itself or one of its ancestors starts hidden as a login-only control.
function hiddenUntilLogin(html, id) {
  const position = html.indexOf(`id="${id}"`);
  assert.ok(position >= 0, `#${id} is missing`);
  const head = html.slice(0, html.indexOf(">", position) + 1);
  return [...head.matchAll(/<(\w+)\b[^>]*\bclass="([^"]*)"[^>]*>/g)].some((match) => {
    const [opening, tag, classes] = match;
    if (!/\blogin-only-control\b/.test(classes) || !/\bhidden\b/.test(classes)) return false;
    const inside = head.slice(match.index + opening.length);
    const opened = (inside.match(new RegExp(`<${tag}\\b`, "g")) || []).length;
    const closed = (inside.match(new RegExp(`</${tag}>`, "g")) || []).length;
    return opened >= closed;
  });
}

test("login-only controls are hidden in the initial HTML", () => {
  for (const id of ["bugReportLink", "mfrFilter", "classFilter"])
    assert.ok(hiddenUntilLogin(index, id), `#${id} must start hidden until login`);
});

test("authentication controls all login-only elements", () => {
  assert.match(
    hotfix,
    /const setLoginControls=\(visible\)=>document\.querySelectorAll\('\.login-only-control'\)/,
  );
  assert.match(hotfix, /currentUser=d\.user\|\|null;\s*setLoginControls\(true\);/);
  assert.match(hotfix, /if\(!d\??\.loggedIn\)\{currentUser=null;setLoginControls\(false\);/);
  assert.doesNotMatch(hotfix, /html:not\(\[data-db-access="authorized"\]\) #mfrFilter/);
});
