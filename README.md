<div align="center">

<img src="https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/raw/refs/heads/main/assets/header-logo.webp" alt="Three Peaks Racing" width="360">

# 🏁 LMU SETUP DATABASE

### Three Peaks Racing × Le Mans Ultimate

**Die zentrale Setup-Plattform für das Team.**  
Fahrzeuge · Strecken · Setup-Versionen · Discord · Cloudflare

<br>

<img alt="Cloudflare Workers" src="https://img.shields.io/badge/CLOUDFLARE-WORKERS-F38020?style=for-the-badge&logo=cloudflare&logoColor=white">
<img alt="Discord" src="https://img.shields.io/badge/DISCORD-OAUTH_%26_BOT-5865F2?style=for-the-badge&logo=discord&logoColor=white">
<img alt="GitHub" src="https://img.shields.io/badge/GITHUB-REPOSITORY-181717?style=for-the-badge&logo=github&logoColor=white">
<img alt="Node.js" src="https://img.shields.io/badge/NODE.JS-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white">

<br><br>

<img alt="D1" src="https://img.shields.io/badge/D1-DATABASE-F38020?style=flat-square&logo=cloudflare&logoColor=white">
<img alt="R2" src="https://img.shields.io/badge/R2-STORAGE-F38020?style=flat-square&logo=cloudflare&logoColor=white">
<img alt="LMU" src="https://img.shields.io/badge/LE_MANS-ULTIMATE-C8102E?style=flat-square">
<img alt="Status" src="https://img.shields.io/badge/STATUS-ACTIVE-2EA44F?style=flat-square">

<br><br>

`HYPERCAR`　·　`LMP2`　·　`LMP3`　·　`LMGT3`

</div>

---

## ⚡ Projekt

> **LMU Setup Database** ist die interne Setup-Plattform von **Three Peaks Racing** für **Le Mans Ultimate**. Sie verbindet eine schnelle Fahrzeug-/Setup-Datenbank mit Discord OAuth, granularen Berechtigungen, Setup Requests und einer Cloudflare-basierten Infrastruktur.

<table>
<tr>
<td width="50%">

### 🎯 Fokus

- Setups schnell finden
- nach Klasse, Fahrzeug und Strecke filtern
- Setup-Versionen nachvollziehen
- kontrollierter Upload/Delete-Zugriff
- Discord direkt integrieren
- Racing-Informationen zentral anzeigen

</td>
<td width="50%" align="center">
<img src="https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/raw/refs/heads/main/assets/three-peaks-racing-logo.webp" alt="Three Peaks Racing Logo" width="310">
</td>
</tr>
</table>

---

## ✨ Core Features

<table>
<tr>
<td width="33%" valign="top">

### 🏎️ Database
**Hypercar · LMP2 · LMP3 · LMGT3**

Fahrzeugklassenfilter, Fahrzeugsuche, Streckensuche und Setup-Zähler.

</td>
<td width="33%" valign="top">

### 📦 Setup Management
**Download · Upload · Delete**

Sequenzieller Multi-ZIP-Upload, Retry-System und direkte Aktualisierung.

</td>
<td width="33%" valign="top">

### 🔢 Versions
**Persistent & editierbar**

Version beim Upload vergeben oder bei bestehenden Setups nachtragen.

</td>
</tr>
<tr>
<td valign="top">

### 🔐 Access
**Server-side permissions**

Database Access und Upload/Delete Access sind sauber voneinander getrennt.

</td>
<td valign="top">

### 🤖 Discord
**OAuth · Requests · Bot**

Login, Setup Requests, Role/User Ping und separater Presence Bot.

</td>
<td valign="top">

### 🏆 Racing
**LMUPORTAL**

Upcoming Races mit Weekly/Special sowie Bronze/Silver/Gold-Klassifizierung.

</td>
</tr>
</table>

---

## 🧪 Setup Partner

<div align="center">

### GO　×　HYMO　×　beAlien

<br>

<img src="https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/raw/refs/heads/main/assets/manufacturers/go-setups.webp" alt="GO Setups" width="220">
&nbsp;&nbsp;&nbsp;
<img src="https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/raw/refs/heads/main/assets/manufacturers/hymo-setups.webp" alt="HYMO Setups" width="220">
&nbsp;&nbsp;&nbsp;
<img src="https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/raw/refs/heads/main/assets/manufacturers/bealien.webp" alt="beAlien Setups" width="220">

<br><br>

Die drei finalen Grafiken werden direkt aus dem Repository geladen und auch von der Website-Diashow verwendet.

</div>

---

## 🏗️ System Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                         USER / BROWSER                       │
│                    LMU SETUP DATABASE UI                     │
└──────────────────────────────┬───────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                     CLOUDFLARE WORKER STACK                  │
│                                                              │
│  runtime-worker.js                                           │
│         │                                                    │
│         ▼                                                    │
│  access-worker.js    ─────►  Database / Upload Permissions   │
│         │                                                    │
│         ▼                                                    │
│  ui-hotfix.js        ─────►  Production UI Integrations      │
│         │                                                    │
│         ▼                                                    │
│  production-worker.js ────►  Production Features            │
│         │                                                    │
│         ▼                                                    │
│  worker.js           ─────►  Core API / OAuth / Upload       │
└───────────────┬─────────────────┬─────────────────┬──────────┘
                │                 │                 │
                ▼                 ▼                 ▼
        ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
        │   DISCORD    │  │  CLOUDFLARE  │  │    GITHUB    │
        │ OAuth / Bot  │  │   D1 / R2    │  │ Code / Setup │
        └──────────────┘  └──────────────┘  └──────────────┘
```

### Worker Chain

| Layer | Rolle |
|:--|:--|
| ⚡ `runtime-worker.js` | produktiver Entry Point |
| 🔐 `access-worker.js` | zentrale Access-/Permission-Schicht |
| 🧩 `ui-hotfix.js` | bestehende UI-Erweiterungen |
| 🚀 `production-worker.js` | produktive Integrationen |
| ☁️ `worker.js` | Core API, Discord OAuth, Upload und GitHub-Zugriff |
| 🔢 `setup-version.js` | persistente Setup-Versionen |

---

## 🔐 Permission Matrix

| Funktion | Database Access | Upload / Delete Access |
|:--|:--:|:--:|
| Setup Database öffnen | ✅ | ✅ |
| Setups ansehen | ✅ | ✅ |
| Setups herunterladen | ✅ | ✅ |
| Setup hochladen | ❌ | ✅ |
| Setup löschen | ❌ | ✅ |
| Setup-Version bearbeiten | ❌ | ✅ |

> **Wichtig:** Die Zugriffskontrolle erfolgt serverseitig. Das Ausblenden eines Buttons im Frontend ist niemals die eigentliche Berechtigungsprüfung.

---

## 📦 Upload Pipeline

```text
          ┌──────────────────────┐
          │ ZIP-Dateien auswählen│
          └──────────┬───────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │   Version eingeben   │
          └──────────┬───────────┘
                     │
                     ▼
          ┌──────────────────────┐
          │     Upload Queue     │
          │    Concurrency: 1    │
          └──────────┬───────────┘
                     │
          ┌──────────┼──────────┐
          ▼          ▼          ▼
       ZIP #1     ZIP #2     ZIP #3
          │          │          │
          ▼          ▼          ▼
         DONE       DONE       DONE
```

**Warum sequenziell?** Die bestehende Upload-Pipeline verarbeitet jede ZIP kontrolliert nacheinander. Dadurch bleiben Status, Retry und Post-Upload-Refresh eindeutig.

---

## 🔢 Setup Version System

```text
SETUP IDENTITY
│
├── Klasse
├── Fahrzeug
└── Dateiname
        │
        ▼
   VERSION METADATA
        │
        └── D1 persistent
```

Beispiele: `1.0` · `1.4` · `v2` · `2.1.3` · `2026.10`

Alte Setups ohne gespeicherte Version bleiben kompatibel und zeigen **`—`**. Berechtigte Nutzer können die Version später mit dem Stift-Editor ändern, **ohne die ZIP erneut hochzuladen**.

---

## 🤖 Discord Ecosystem

<table>
<tr>
<td width="50%" valign="top">

### 🌐 Website Integration

- Discord OAuth Login
- Discord User Identity
- serverseitige Rollenprüfung
- Setup Request System
- User Ping
- Role Ping

</td>
<td width="50%" valign="top">

### 🟣 Presence Bot

- eigener Node.js-Prozess
- Wispbyte Entry Point `index.js`
- Discord.js
- DND Status
- Aktivität `Le Mans Ultimate`

</td>
</tr>
</table>

```bash
cd discord-presence
npm install
npm start
```

---

## ☁️ Cloudflare Infrastructure

<div align="center">

**WORKERS** `Application + API` 　→　 **D1** `Permissions + Metadata` 　→　 **R2** `Upload Infrastructure`

</div>

| Service | Verwendung |
|:--|:--|
| ⚡ Workers | Website, API und Integrationslogik |
| 🗄️ D1 | Zugriffsrechte, Setup-Versionen und persistente Metadaten |
| 📦 R2 | Upload-Infrastruktur |
| 🔑 Worker Secrets | Discord, GitHub und weitere vertrauliche Konfiguration |

---

## 🗂️ Repository

```text
Le-Mans-Ultimate-Setups/
│
├── assets/
│   ├── header-logo.webp
│   ├── bp-logo.webp
│   ├── three-peaks-racing-logo.webp
│   └── manufacturers/
│       ├── go-setups.webp
│       ├── hymo-setups.webp
│       └── bealien.webp
│
├── discord-presence/
│   ├── index.js
│   ├── bot.js
│   ├── package.json
│   └── .env.example
│
├── setups/
├── index.html
├── runtime-worker.js
├── access-worker.js
├── ui-hotfix.js
├── production-worker.js
├── worker.js
├── setup-version.js
├── setups.json
├── schema.sql
├── wrangler.jsonc
├── CHANGELOG.md
└── README.md
```

---

## 🛡️ Security Baseline

```text
✓ Discord OAuth State Validation
✓ Server-side Authorization
✓ Same-Origin Checks
✓ Secure Session Handling
✓ Input Validation
✓ Request Size Limits
✓ Security Headers / CSP
✓ D1 Prepared Statements
✓ Worker Secrets
```

### 🚫 Secrets gehören niemals ins Repository

`DISCORD_CLIENT_SECRET` · `DISCORD_BOT_TOKEN` · `GITHUB_TOKEN` · `SESSION_SECRET` · `LMUPORTAL_API1` · `LMUPORTAL_API2`

Lokale `.env`, `.dev.vars`, `node_modules` und Wrangler-Lokalzustände werden über `.gitignore` ausgeschlossen.

---

## 🚀 Deployment

```text
┌───────────────┐     ┌──────────────────┐     ┌─────────────────┐
│ GitHub / main │ ──► │ Cloudflare Build │ ──► │ Worker Deploy   │
└───────────────┘     └──────────────────┘     └────────┬────────┘
                                                       │
                                                       ▼
                                              ┌─────────────────┐
                                              │   PRODUCTION    │
                                              └─────────────────┘
```

Produktiver Worker Entry Point: **`runtime-worker.js`**

---

## 🧰 Stack

<div align="center">

<img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?style=for-the-badge&logo=javascript&logoColor=000">
<img alt="Cloudflare" src="https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white">
<img alt="Discord" src="https://img.shields.io/badge/Discord-API-5865F2?style=for-the-badge&logo=discord&logoColor=white">
<img alt="GitHub" src="https://img.shields.io/badge/GitHub-API-181717?style=for-the-badge&logo=github&logoColor=white">

</div>

---

## 📝 Project History

Alle relevanten Änderungen werden in **[`CHANGELOG.md`](CHANGELOG.md)** dokumentiert. Dazu gehören Website, Discord-Integration, Setup-Verwaltung, GitHub und Cloudflare.

---

<div align="center">

<img src="https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups/raw/refs/heads/main/assets/three-peaks-racing-logo.webp" alt="Three Peaks Racing" width="280">

## 🏁 THREE PEAKS RACING

### LMU Setup Database

**Built for Le Mans Ultimate. Built for the team.**

`HYPERCAR`　·　`LMP2`　·　`LMP3`　·　`LMGT3`

<br>

<sub>Three Peaks Racing © 2026 · Internal Project Documentation</sub>

</div>
