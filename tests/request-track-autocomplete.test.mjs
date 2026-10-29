import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import {
  REQUEST_TRACKS,
  searchRequestTracks,
  resolveRequestTrack,
  matchingRequestSetups,
} from "../discord-presence/request-tracks.js";
import production from "../src/production-worker.js";
import {
  DEFAULT_SETUP_SUPPLY_ROLE_ID,
  REQUEST_MANUFACTURERS,
  SETUP_CONFIRMATION_WHITELIST,
  resolveRequestManufacturer,
  setupRequestPayload,
  isAnyRequestManufacturer,
} from "../discord-presence/request-manufacturers.js";
import base from "../src/worker.js";

test("Bestätigte 33 Einträge ohne die drei ausdrücklich entfernten Layouts", () => {
  assert.equal(REQUEST_TRACKS.length, 33);
  assert.equal(new Set(REQUEST_TRACKS.map((t) => t.name)).size, 33);
  for (const omitted of ["Portimao ELMS", "Spa Endurance", "Le Mans Mulsanne No Chicanes"])
    assert.equal(resolveRequestTrack(omitted), null);
  assert.equal(searchRequestTracks("", 100).length, 25);
  assert.ok(REQUEST_TRACKS.every((t) => t.name.length <= 100));
});

test("Kurzformen, Akzente, Layouts und Teiltreffer funktionieren in beiden Oberflächen", () => {
  for (const [query, name] of [
    ["portimao", "Algarve / Portimão"],
    ["Spa", "Spa-Francorchamps"],
    ["COTA", "Circuit of the Americas / COTA"],
    ["Le Mans", "Le Mans / Circuit de la Sarthe"],
    ["Paul Ricard 1av2-short", "Paul Ricard – 1A V2 Short"],
  ])
    assert.equal(resolveRequestTrack(query)?.name, name);
  assert.deepEqual(
    searchRequestTracks("silver").map((t) => t.name),
    ["Silverstone – GP / WEC", "Silverstone – National", "Silverstone – International"],
  );
  assert.equal(searchRequestTracks("sp", 8)[0].name, "Spa-Francorchamps");
  assert.deepEqual(searchRequestTracks("does not exist"), []);
  assert.equal(searchRequestTracks("BAH").length, 4);
});

test("Vorhanden-Prüfung erkennt Kurzformen, aber verwechselt keine Layouts", () => {
  const files = [
    "Toyota Spa HYMO.zip",
    "bA2_Bundle_M4_BAR.zip",
    "Toyota Bahrain GO.zip",
    "Toyota Bahrain Outer GO.zip",
    "Toyota Paul Ricard 1A_V2_short HYMO.zip",
    "Toyota Silverstone National GO.zip",
    "Toyota Silverstone HYMO.zip",
  ].map((name) => ({ name }));
  assert.deepEqual(
    matchingRequestSetups(files, "Spa-Francorchamps").map((f) => f.name),
    ["Toyota Spa HYMO.zip"],
  );
  assert.deepEqual(
    matchingRequestSetups(files, "Barcelona").map((f) => f.name),
    ["bA2_Bundle_M4_BAR.zip"],
  );
  assert.deepEqual(
    matchingRequestSetups(files, "Bahrain – Grand Prix").map((f) => f.name),
    ["Toyota Bahrain GO.zip"],
  );
  assert.deepEqual(
    matchingRequestSetups(files, "Bahrain – Outer").map((f) => f.name),
    ["Toyota Bahrain Outer GO.zip"],
  );
  assert.equal(matchingRequestSetups(files, "Bahrain – Endurance").length, 0);
  assert.equal(matchingRequestSetups(files, "Paul Ricard – 1A").length, 0);
  assert.equal(matchingRequestSetups(files, "Paul Ricard – 1A V2").length, 0);
  assert.equal(matchingRequestSetups(files, "Paul Ricard – 1A V2 Short").length, 1);
  assert.deepEqual(
    matchingRequestSetups(files, "Silverstone").map((f) => f.name),
    ["Toyota Silverstone HYMO.zip"],
  );
});

test("Paul Ricard Default ist separat von allen vier benannten Layouts", () => {
  const names = [
    "Paul Ricard - Default",
    "Paul Ricard – 1A",
    "Paul Ricard – 1A V2",
    "Paul Ricard – 1A V2 Short",
    "Paul Ricard – 3A",
  ];
  assert.deepEqual(
    searchRequestTracks("Paul Ricard").map((track) => track.name),
    names,
  );
  assert.equal(resolveRequestTrack("Paul Ricard")?.layout, "default");
  assert.equal(resolveRequestTrack("Circuit Paul Ricard")?.name, "Paul Ricard - Default");
  assert.equal(resolveRequestTrack("Paul Ricard Default")?.name, "Paul Ricard - Default");
  assert.equal(resolveRequestTrack("Paul Ricard 1A")?.layout, "1a");
  const files = [
    "BMW V8 Paul Ricard HYMO.zip",
    "BMW V8 Paul Ricard 1A HYMO.zip",
    "BMW V8 Paul Ricard 1A_V2 HYMO.zip",
    "BMW V8 Paul Ricard 1A_V2_short HYMO.zip",
    "BMW V8 Paul Ricard 3A HYMO.zip",
  ].map((name) => ({ name }));
  names.forEach((name, index) =>
    assert.deepEqual(
      matchingRequestSetups(files, name).map((file) => file.name),
      [files[index].name],
    ),
  );
});

test("Website sendet kanonischen Namen und weist unbekannte Strecken vor Discord ab", async () => {
  const oldBase = base.fetch,
    oldFetch = globalThis.fetch,
    sends = [];
  base.fetch = async () =>
    Response.json({
      loggedIn: true,
      databaseAccess: true,
      user: { id: "1033453785416208564", username: "Lukas" },
    });
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes("api.github.com"))
      return Response.json({ Hypercar: [{ name: "Toyota GR010" }] });
    sends.push(JSON.parse(options.body));
    return Response.json({ id: "test" });
  };
  const env = { DISCORD_BOT_TOKEN: "fake", DISCORD_CHANNEL_ID: "1511795330176520193" };
  const request = (track) =>
    new Request("https://example.test/api/request", {
      method: "POST",
      body: JSON.stringify({ vehicle: "Toyota GR010", track, manufacturer: "HYMO" }),
    });
  try {
    const ok = await production.fetch(request("Spa"), env);
    assert.equal(ok.status, 200);
    assert.equal(
      sends[0].embeds[0].fields.find((field) => field.name === "Strecke").value,
      "Spa-Francorchamps",
    );
    assert.equal((await production.fetch(request("Nürburgring"), env)).status, 400);
    assert.equal(sends.length, 1);
    base.fetch = async () => Response.json({ loggedIn: false });
    assert.equal((await production.fetch(request("Spa"), env)).status, 401);
    assert.equal(sends.length, 1);
  } finally {
    base.fetch = oldBase;
    globalThis.fetch = oldFetch;
  }
});

test("Streckenliste kommt direkt aus dem Worker ohne einen GitHub-Abruf", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    throw Error("unexpected network request");
  };
  try {
    const response = await production.fetch(
      new Request("https://example.test/api/request/tracks"),
      {},
    );
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^application\/json/);
    const body = await response.json();
    assert.equal(body.tracks.length, 33);
    assert.equal(body.tracks.at(-1).name, "Spa-Francorchamps");
  } finally {
    globalThis.fetch = original;
  }
});

test("Browser findet Kurzformen und Layouts aus dem gelieferten Katalog", () => {
  const html = readFileSync(new URL("../public/request.html", import.meta.url), "utf8");
  const source = html
    .slice(html.search(/let REQUEST_TRACKS\s*=\s*\[\]/), html.search(/const form\s*=/))
    .replace(/let REQUEST_TRACKS\s*=\s*\[\]/, "const REQUEST_TRACKS=tracks");
  const search = vm.runInNewContext(source + ";({searchRequestTracks,resolveRequestTrack})", {
    tracks: REQUEST_TRACKS,
  });
  assert.equal(search.resolveRequestTrack("portimao").name, "Algarve / Portimão");
  assert.equal(search.searchRequestTracks("spa")[0].name, "Spa-Francorchamps");
  assert.equal(search.searchRequestTracks("silver").length, 3);
  assert.equal(
    search.searchRequestTracks("Paul Ricard 1av2-short")[0].name,
    "Paul Ricard – 1A V2 Short",
  );
  assert.equal(search.resolveRequestTrack("Portimao ELMS"), null);
  assert.equal(search.resolveRequestTrack("Paul Ricard")?.name, "Paul Ricard - Default");
  assert.equal(search.searchRequestTracks("Paul Ricard").length, 5);
});

class Builder {
  data = {};
  constructor(value) {
    if (value) this.data = { ...value };
  }
  setName(v) {
    this.data.name = v;
    return this;
  }
  setDescription(v) {
    this.data.description = v;
    return this;
  }
  setAutocomplete(v) {
    this.data.autocomplete = v;
    return this;
  }
  setRequired(v) {
    this.data.required = v;
    return this;
  }
  setMaxLength(v) {
    this.data.max_length = v;
    return this;
  }
  addChoices(...values) {
    this.data.choices = values;
    return this;
  }
  addStringOption(fn) {
    (this.data.options ??= []).push(fn(new Builder()).data);
    return this;
  }
  toJSON() {
    return this.data;
  }
  setColor(v) {
    this.data.color = v;
    return this;
  }
  setTitle(v) {
    this.data.title = v;
    return this;
  }
  addFields(...fields) {
    (this.data.fields ??= []).push(...fields);
    return this;
  }
  setTimestamp() {
    return this;
  }
  addComponents(...components) {
    (this.data.components ??= []).push(...components);
    return this;
  }
  setLabel(v) {
    this.data.label = v;
    return this;
  }
  setStyle(v) {
    this.data.style = v;
    return this;
  }
  setURL(v) {
    this.data.url = v;
    return this;
  }
  setCustomId(v) {
    this.data.custom_id = v;
    return this;
  }
}
async function bot() {
  let client, command;
  const sends = [],
    events = new Map();
  class Client {
    user = { setPresence() {}, tag: "test" };
    channels = {
      fetch: async () => ({
        isTextBased: () => true,
        send: async (message) => sends.push(message),
      }),
    };
    constructor() {
      client = this;
    }
    once(name, fn) {
      events.set(name, fn);
    }
    on(name, fn) {
      events.set(name, fn);
    }
    login() {
      return Promise.resolve();
    }
  }
  class REST {
    setToken() {
      return this;
    }
    async put(route, options) {
      command = options.body[0];
    }
  }
  const source = readFileSync(
    new URL("../discord-presence/index.js", import.meta.url),
    "utf8",
  ).replace(/^import\s[^;]+;\s*/gm, "");
  const context = {
    DEFAULT_SETUP_SUPPLY_ROLE_ID,
    REQUEST_MANUFACTURERS,
    SETUP_CONFIRMATION_WHITELIST,
    resolveRequestManufacturer,
    setupRequestPayload,
    isAnyRequestManufacturer,
    Client,
    REST,
    EmbedBuilder: Builder,
    ActionRowBuilder: Builder,
    ButtonBuilder: Builder,
    SlashCommandBuilder: Builder,
    ButtonStyle: { Link: 5, Success: 3 },
    GatewayIntentBits: { Guilds: 1 },
    ActivityType: { Playing: 0 },
    MessageFlags: { Ephemeral: 64, SuppressNotifications: 4096 },
    Routes: { applicationGuildCommands: () => "/commands" },
    readFile: async () => JSON.stringify({ Hypercar: [{ name: "Toyota GR010" }] }),
    fetch: async () => Response.json([]),
    searchRequestTracks,
    resolveRequestTrack,
    matchingRequestSetups,
    URLSearchParams,
    console: { log() {}, warn() {}, error() {} },
    process: {
      env: {
        DISCORD_BOT_TOKEN: "fake",
        DISCORD_CLIENT_ID: "1556978316404068452",
        DISCORD_GUILD_ID: "1464926567401652418",
        DISCORD_CHANNEL_ID: "1511795330176520193",
        DISCORD_ROLE_ID: "1538601074074849330",
        GITHUB_TOKEN: "fake",
      },
      on() {},
      exit() {
        throw Error("unexpected exit");
      },
    },
  };
  vm.runInNewContext(source, context);
  await events.get("ready")();
  return { command, sends, handle: events.get("interactionCreate"), context };
}
function autocomplete(name, value) {
  let choices;
  return {
    commandName: "request",
    options: {
      getFocused: (all) => {
        assert.equal(all, true);
        return { name, value };
      },
    },
    isAutocomplete: () => true,
    respond: async (result) => {
      choices = result;
    },
    get choices() {
      return choices;
    },
  };
}
function slash(track) {
  const calls = [];
  return {
    commandName: "request",
    user: { id: "1033453785416208564" },
    options: {
      getString: (name) =>
        ({ fahrzeug: "Toyota GR010", strecke: track, hersteller: "HYMO", weitere_infos: "Test" })[
          name
        ],
    },
    isAutocomplete: () => false,
    isButton: () => false,
    isChatInputCommand: () => true,
    reply: async (value) => calls.push(["reply", value]),
    deferReply: async (value) => calls.push(["defer", value]),
    editReply: async (value) => calls.push(["edit", value]),
    calls,
  };
}

test("Bot registriert beide Vorschlagsfelder und beantwortet das tatsächlich fokussierte Feld", async () => {
  const b = await bot();
  assert.ok(b.command.options.find((x) => x.name === "fahrzeug").autocomplete);
  assert.ok(b.command.options.find((x) => x.name === "strecke").autocomplete);
  const track = autocomplete("strecke", "spa");
  await b.handle(track);
  assert.equal(track.choices.length, 1);
  assert.equal(track.choices[0].value, "Spa-Francorchamps");
  const car = autocomplete("fahrzeug", "toy");
  await b.handle(car);
  assert.equal(car.choices[0].value, "Toyota GR010");
  const empty = autocomplete("strecke", "");
  await b.handle(empty);
  assert.equal(empty.choices.length, 25);
});

test("Bot validiert die Strecke und behält Button, Rollen-Tag und Ping-Unterdrückung", async () => {
  const b = await bot(),
    invalid = slash("Nürburgring");
  await b.handle(invalid);
  assert.equal(b.sends.length, 0);
  assert.equal(invalid.calls[0][0], "reply");
  const valid = slash("Spa");
  await b.handle(valid);
  assert.equal(b.sends.length, 1);
  const message = b.sends[0];
  assert.equal(
    message.embeds[0].fields.find((f) => f.name === "Strecke").value,
    "Spa-Francorchamps",
  );
  assert.equal(message.components[0].components[0].custom_id, "setup_ready:1033453785416208564");
  assert.match(message.content, /<@&1538601074074849330>/);
  assert.equal(message.allowedMentions.roles.length, 0);
  assert.equal(message.flags, 4096);
});

test("Vorhandenes Setup bleibt privat und verlinkt weiterhin direkt in das Fahrzeug", async () => {
  const b = await bot();
  b.context.fetch = async () => Response.json([{ type: "file", name: "Toyota Spa HYMO.zip" }]);
  const input = slash("Spa");
  await b.handle(input);
  assert.equal(b.sends.length, 0);
  const reply = input.calls.find((x) => x[0] === "edit")[1];
  assert.match(reply.content, /bereits ein Setup vorhanden/);
  assert.match(reply.components[0].data.components[0].data.url, /vehicle=Toyota\+GR010/);
});

test("Paul bleibt Paul Ricard; Aliase treffen keine beliebigen Wortfragmente", () => {
  const html = readFileSync(new URL("../public/request.html", import.meta.url), "utf8");
  const source = html
    .slice(html.search(/let REQUEST_TRACKS\s*=\s*\[\]/), html.search(/const form\s*=/))
    .replace(/let REQUEST_TRACKS\s*=\s*\[\]/, "const REQUEST_TRACKS=tracks");
  const browser = vm.runInNewContext(source + ";({searchRequestTracks,resolveRequestTrack})", {
    tracks: REQUEST_TRACKS,
  });
  for (const search of [searchRequestTracks, browser.searchRequestTracks]) {
    assert.ok(search("Pa").every((track) => track.name !== "Interlagos"));
    for (const query of ["Pau", "Paul", "paul ric", "Ricard"]) {
      const hits = search(query);
      assert.equal(hits.length, 5, query);
      assert.ok(
        hits.every((track) => track.family === "paulricard"),
        query,
      );
    }
    for (const query of ["Sao", "São Paulo", "Paulo", "Inter", "Jose Carlos Pace"]) {
      assert.ok(
        search(query).some((track) => track.name === "Interlagos"),
        query,
      );
    }
    assert.equal(search("carlos")[0]?.name, "Interlagos");
    assert.equal(search("arlos").length, 0);
    assert.equal(search("qatar")[0]?.name, "Lusail");
    assert.equal(search("port")[0]?.name, "Algarve / Portimão");
    assert.equal(search("short").length, 2);
  }
});
