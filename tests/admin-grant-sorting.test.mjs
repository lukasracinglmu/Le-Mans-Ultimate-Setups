import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../admin.html", import.meta.url), "utf8");
const helpers = html.slice(
  html.indexOf("function grantTime("),
  html.indexOf("const backupButton="),
);
const formatter = html.match(/const formatGrantDate=.*?;/)[0];
const renderer = html.slice(
  html.indexOf("function renderGrantList("),
  html.indexOf("async function change("),
);
const dates = vm.runInNewContext(helpers + ";({grantTime,latestGrantTime,compareGrantUsers})");

test("Freigabedatum behandelt SQLite, ISO und Zeitzonen gleich und verwirft fehlende Daten", () => {
  const expected = Date.parse("2026-10-27T12:00:00Z");
  assert.equal(dates.grantTime("2026-10-27 12:00:00"), expected);
  assert.equal(dates.grantTime("2026-10-27T12:00:00"), expected);
  assert.equal(dates.grantTime("2026-10-27T14:00:00+02:00"), expected);
  for (const value of [null, "", "kein Datum"]) assert.equal(dates.grantTime(value), null);
});

test("Sortierdatum ist die neueste aller Rechtefreigaben statt einer festen Rechte-Priorität", () => {
  const user = {
    databaseGrantedAt: "2026-10-20 12:00:00",
    uploadGrantedAt: "2026-10-27 12:00:00",
    adminPanelGrantedAt: "ungültig",
    fullAdminGrantedAt: "2026-10-25 12:00:00",
  };
  assert.equal(
    dates.latestGrantTime(user, { created_at: "2026-10-26 12:00:00" }),
    Date.parse("2026-10-27T12:00:00Z"),
  );
  assert.equal(dates.latestGrantTime({}, undefined), null);
});

class Element {
  children = [];
  dataset = {};
  textContent = "";
  className = "";
  set innerHTML(value) {
    this.html = value;
    this.children = [];
  }
  get innerHTML() {
    return this.html || "";
  }
  append(...children) {
    this.children.push(...children);
  }
  appendChild(child) {
    this.children.push(child);
    return child;
  }
}
function page(users, fullRows = []) {
  const list = new Element();
  const context = vm.createContext({
    document: { createElement: () => new Element() },
    list,
    grantUsers: users,
    grantFullRows: fullRows,
    permissionFilter: { value: "all" },
    grantSort: { value: "newest" },
    me: { isOwner: true },
  });
  vm.runInContext(helpers + formatter + renderer, context);
  const render = (order, permission = "all") => {
    context.grantSort.value = order;
    context.permissionFilter.value = permission;
    vm.runInContext("renderGrantList()", context);
    return list.children;
  };
  return { render, list };
}
const makeUser = (id, date, extra = {}) => ({
  userId: id,
  username: id,
  databaseAccess: true,
  databaseGrantedAt: date,
  ...extra,
});
const users = [
  makeUser("771358435416473600", "2026-10-25 12:00:00", { uploadAccess: true }),
  makeUser("640948738445279261", "2026-10-20 12:00:00", {
    adminPanelAccess: true,
    adminPanelGrantedAt: "2026-10-27 12:00:00",
  }),
  makeUser("198399938739175424", null),
];
const rowId = (card) => card.children[0].children[1].textContent.match(/Discord-ID: (\d+)/)[1];

test("Gerenderte Liste sortiert global in beide Richtungen; unbekannte Daten bleiben unten", () => {
  const { render } = page(users);
  assert.deepEqual(render("newest").map(rowId), [
    "640948738445279261",
    "771358435416473600",
    "198399938739175424",
  ]);
  assert.deepEqual(render("oldest").map(rowId), [
    "771358435416473600",
    "640948738445279261",
    "198399938739175424",
  ]);
  assert.equal(render("newest")[0].dataset.grantedAt, "2026-10-27T12:00:00.000Z");
});

test("Rechtefilter und Reihenfolge kombinieren sich ohne weitere Abfragen oder verlorene Tags", () => {
  const { render, list } = page([
    ...users,
    makeUser("711862720567312455", "2026-10-22 12:00:00", {
      fullAdminAccess: true,
      fullAdminGrantedAt: "2026-10-26 12:00:00",
    }),
  ]);
  assert.deepEqual(render("oldest", "upload").map(rowId), ["771358435416473600"]);
  const full = render("newest", "full");
  assert.deepEqual(full.map(rowId), ["711862720567312455"]);
  const badges = full[0].children[0].children[0].children[1].children;
  assert.equal(badges[0].className, "badge full-admin-badge");
  assert.equal(badges[1].className, "badge database-badge");
  assert.equal(
    render("newest", "panel")[0].children[0].children[0].children[1].children[0].className,
    "badge admin-badge",
  );
  assert.deepEqual(render("oldest", "database").map(rowId), [
    "771358435416473600",
    "711862720567312455",
    "640948738445279261",
    "198399938739175424",
  ]);
  assert.equal(list.children.length, 4);
});
