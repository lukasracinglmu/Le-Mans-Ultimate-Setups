<div align="center">

<img src="assets/bp-logo.webp" alt="Three Peaks Racing" width="320">

<br><br>

# 🏁 LMU SETUP DATABASE

<h3>Three Peaks Racing &nbsp;×&nbsp; Le Mans Ultimate</h3>

<p><strong>Die zentrale Setup-Plattform für das Team.</strong></p>

<br>

![Cloudflare](https://img.shields.io/badge/CLOUDFLARE-WORKERS-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Discord](https://img.shields.io/badge/DISCORD-OAUTH_%26_BOT-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![GitHub](https://img.shields.io/badge/GITHUB-REPOSITORY-181717?style=for-the-badge&logo=github&logoColor=white)
![Node.js](https://img.shields.io/badge/NODE.JS-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)

<br>

![D1](https://img.shields.io/badge/D1-DATABASE-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![R2](https://img.shields.io/badge/R2-STORAGE-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![LMU](https://img.shields.io/badge/LE_MANS-ULTIMATE-C8102E?style=flat-square)
![Status](https://img.shields.io/badge/STATUS-ACTIVE-2EA44F?style=flat-square)

<br><br>

`HYPERCAR` &nbsp;·&nbsp; `LMP2` &nbsp;·&nbsp; `LMP3` &nbsp;·&nbsp; `LMGT3`

<br>

</div>

---

<br>

## ⚡&nbsp; Projekt

> **LMU Setup Database** ist die interne Setup-Plattform von **Three Peaks Racing** für **Le Mans Ultimate**. Sie verbindet eine schnelle Fahrzeug-/Setup-Datenbank mit Discord OAuth, granularen Berechtigungen, Setup Requests und einer Cloudflare-basierten Infrastruktur.

<br>

### 🎯&nbsp; Fokus

| | |
|---|---|
| 🔍 | Setups schnell finden |
| 🏎️ | nach Klasse, Fahrzeug und Strecke filtern |
| 🔢 | Setup-Versionen nachvollziehen |
| 🔐 | kontrollierter Upload/Delete-Zugriff |
| 🤖 | Discord direkt integrieren |

<br>

---

<br>

## ✨&nbsp; Core Features

<br>

<div align="center">

| 🏎️ Database | 📦 Setup Management | 🔢 Versions |
|:---:|:---:|:---:|
| **Hypercar · LMP2 · LMP3 · LMGT3** | **Download · Upload · Delete** | **Persistent & editierbar** |
| Fahrzeugklassenfilter, Fahrzeugsuche, Streckensuche und Setup-Zähler | Sequenzieller Multi-ZIP-Upload, Retry-System und direkte Aktualisierung | Version beim Upload vergeben oder bei bestehenden Setups nachtragen |

<br>

| 🔐 Access | 🤖 Discord |
|:---:|:---:|
| **Server-side permissions** | **OAuth · Requests · Bot** |
| Database Access und Upload/Delete Access sind sauber voneinander getrennt | Login, Setup Requests, Role/User Ping und separater Presence Bot |

</div>

<br>

---

<br>

## 🧪&nbsp; Setup Partner

<div align="center">

### GO &nbsp;×&nbsp; HYMO &nbsp;×&nbsp; beAlien

<br>

<img src="assets/manufacturers/go-setups.webp" alt="GO Setups" width="200">
&nbsp;&nbsp;&nbsp;&nbsp;
<img src="assets/manufacturers/hymo-setups.webp" alt="HYMO Setups" width="200">
&nbsp;&nbsp;&nbsp;&nbsp;
<img src="assets/manufacturers/bealien.webp" alt="beAlien Setups" width="200">

<br><br>

Die Grafiken werden direkt aus dem Repository geladen und von der Website-Diashow verwendet.

</div>

<br>

---

<br>

## 🏗️&nbsp; System Architecture

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

<br>

| Layer | Rolle |
|:--|:--|
| ⚡ `runtime-worker.js` | Produktiver Entry Point |
| 🔐 `access-worker.js` | Zentrale Access-/Permission-Schicht |
| 🧩 `ui-hotfix.js` | Bestehende UI-Erweiterungen |
| 🚀 `production-worker.js` | Produktive Integrationen |
| ☁️ `worker.js` | Core API, Discord OAuth, Upload und GitHub-Zugriff |
| 🔢 `setup-version.js` | Persistente Setup-Versionen |

<br>

---

<br>

## 🔐&nbsp; Permission Matrix

<div align="center">

| Funktion | 🗄️ Database Access | 📦 Upload / Delete Access |
|:--|:--:|:--:|
| Setup Database öffnen | ✅ | ✅ |
| Setups ansehen | ✅ | ✅ |
| Setups herunterladen | ✅ | ✅ |
| Setup hochladen | ❌ | ✅ |
| Setup löschen | ❌ | ✅ |
| Setup-Version bearbeiten | ❌ | ✅ |

</div>

<br>

> **Wichtig:** Die Zugriffskontrolle erfolgt serverseitig. Das Ausblenden eines Buttons im Frontend ist niemals die eigentliche Berechtigungsprüfung.

<br>

---

<br>

## 📦&nbsp; Upload Pipeline

```text
        ┌──────────────────────┐
        │  ZIP-Dateien wählen  │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │   Version eingeben   │
        └──────────┬───────────┘
                   │
                   ▼
        ┌──────────────────────┐
        │     Upload Queue     │   Concurrency: 1
        └──────────┬───────────┘
                   │
        ┌──────────┼──────────┐
        ▼          ▼          ▼
     ZIP #1     ZIP #2     ZIP #3
        │          │          │
        ▼          ▼          ▼
       DONE       DONE       DONE
```

**Warum sequenziell?** Die Upload-Pipeline verarbeitet jede ZIP kontrolliert nacheinander. Dadurch bleiben Status, Retry und Post-Upload-Refresh eindeutig.

<br>

---

<br>

## 🔢&nbsp; Setup Version System

Beispiele: `1.0` &nbsp;·&nbsp; `1.4` &nbsp;·&nbsp; `v2` &nbsp;·&nbsp; `2.1.3` &nbsp;·&nbsp; `2026.10`

Alte Setups ohne Version bleiben kompatibel und zeigen **`—`**. Berechtigte Nutzer können die Version mit dem Stift-Editor ändern — **ohne die ZIP erneut hochzuladen**.

<br>

---

<br>

## 🤖&nbsp; Discord Ecosystem

<div align="center">

| 🌐 Website Integration | 🟣 Presence Bot |
|:--|:--|
| Discord OAuth Login | Eigener Node.js-Prozess |
| Discord User Identity | Entry Point `index.js` |
| Serverseitige Rollenprüfung | Discord.js |
| Setup Request System | DND Status |
| User Ping · Role Ping | Aktivität `Le Mans Ultimate` |

</div>

<br>

```bash
cd discord-presence && npm install && npm start
```

<br>

---

<br>

## ☁️&nbsp; Cloudflare Infrastructure

<div align="center">

**WORKERS** `Application + API` &nbsp;→&nbsp; **D1** `Permissions + Metadata` &nbsp;→&nbsp; **R2** `Upload Infrastructure`

</div>

<br>

| Service | Verwendung |
|:--|:--|
| ⚡ Workers | Website, API und Integrationslogik |
| 🗄️ D1 | Zugriffsrechte, Setup-Versionen und persistente Metadaten |
| 📦 R2 | Upload-Infrastruktur |
| 🔑 Worker Secrets | Discord, GitHub und weitere vertrauliche Konfiguration |

<br>

---

<br>

## 🛡️&nbsp; Security Baseline

```text
✓  Discord OAuth State Validation
✓  Server-side Authorization
✓  Same-Origin Checks
✓  Secure Session Handling
✓  Input Validation
✓  Request Size Limits
✓  Security Headers / CSP
✓  D1 Prepared Statements
✓  Worker Secrets
```

<br>

> 🚫 **Secrets gehören niemals ins Repository**
>
> `DISCORD_CLIENT_SECRET` · `DISCORD_BOT_TOKEN` · `GITHUB_TOKEN` · `SESSION_SECRET`

<br>

---

<br>

## 🗂️&nbsp; Repository

```text
Le-Mans-Ultimate-Setups/
│
├── assets/
│   ├── bp-logo.webp
│   ├── header-logo.webp
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

<br>

---

<br>

## 🚀&nbsp; Deployment

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

<br>

---

<br>

## 🧰&nbsp; Stack

<div align="center">

![JavaScript](https://img.shields.io/badge/JavaScript-ES_Modules-F7DF1E?style=for-the-badge&logo=javascript&logoColor=000)
![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Discord](https://img.shields.io/badge/Discord-API-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-API-181717?style=for-the-badge&logo=github&logoColor=white)

</div>

<br>

---

<br>

## 📝&nbsp; Project History

Alle relevanten Änderungen werden in **[`CHANGELOG.md`](CHANGELOG.md)** dokumentiert.

<br>

---

<br>

<div align="center">

<img src="assets/bp-logo.webp" alt="Three Peaks Racing" width="240">

<br><br>

## 🏁 THREE PEAKS RACING

### LMU Setup Database

**Built for Le Mans Ultimate. Built for the team.**

<br>

`HYPERCAR` &nbsp;·&nbsp; `LMP2` &nbsp;·&nbsp; `LMP3` &nbsp;·&nbsp; `LMGT3`

<br>

<sub>Three Peaks Racing © 2026 · Internal Project Documentation</sub>

</div>
