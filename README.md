<div align="center">

<img src="assets/header-logo.webp" alt="Three Peaks Racing" width="300">

# LMU Setup Database

### 🏁 Three Peaks Racing × Le Mans Ultimate

**Eine zentrale Setup-Plattform für LMU – schnell, übersichtlich und Discord-integriert.**

<br>

![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?style=for-the-badge&logo=cloudflare&logoColor=white)
![Discord](https://img.shields.io/badge/Discord-OAuth_%26_Bot-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?style=for-the-badge&logo=github&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?style=for-the-badge&logo=node.js&logoColor=white)

![D1](https://img.shields.io/badge/Cloudflare-D1-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![R2](https://img.shields.io/badge/Cloudflare-R2-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![LMU](https://img.shields.io/badge/Le_Mans-Ultimate-C8102E?style=flat-square)
![Status](https://img.shields.io/badge/Projekt-Aktiv-success?style=flat-square)

<br>

> **Setup Database · Versionsverwaltung · Discord OAuth · Upload/Delete · Setup Requests · LMUPORTAL**

</div>

---

## 🏎️ Was ist die LMU Setup Database?

Die **LMU Setup Database** ist die interne Setup-Plattform von **Three Peaks Racing** für **Le Mans Ultimate**. Sie bündelt Fahrzeug- und Strecken-Setups in einer zentralen Oberfläche und verbindet die Website direkt mit Discord sowie der Cloudflare-Infrastruktur.

Je nach Berechtigung können Nutzer Setups **ansehen, herunterladen, hochladen, löschen und Metadaten bearbeiten**. Bestehende Rechte werden serverseitig geprüft.

<div align="center">
<br>
<img src="assets/bp-logo.webp" alt="Three Peaks Racing Branding" width="480">
<br><br>
</div>

---

## ✨ Features auf einen Blick

| Bereich | Funktionen |
|---|---|
| 🏁 **Fahrzeuge** | Hypercar · LMP2 · LMP3 · LMGT3 |
| 🔎 **Navigation** | Fahrzeugklassenfilter · Streckensuche · Herstellerfilter |
| 🧪 **Setup-Anbieter** | GO · HYMO · beAlien |
| 📦 **Setups** | Download · Upload · Delete · Setup Counts |
| 🔢 **Versionen** | Version beim Upload · nachträgliches Bearbeiten · persistente Speicherung |
| ⚡ **Multi-Upload** | mehrere ZIPs · strikt sequenziell · Concurrency 1 · Retry |
| 🔐 **Access** | Discord OAuth · Database Access · Upload/Delete Access |
| 🤖 **Discord** | Setup Requests · User Ping · Role Ping · Presence Bot |
| 🏆 **Racing** | LMUPORTAL · Upcoming Races · Weekly/Special · Bronze/Silver/Gold |
| ☁️ **Backend** | Cloudflare Workers · D1 · R2 · GitHub |

---

## 🖼️ Hersteller

<div align="center">

| GO | HYMO | beAlien |
|:---:|:---:|:---:|
| <img src="assets/manufacturers/go-setups.webp" alt="GO Setups" width="210"> | <img src="assets/manufacturers/hymo-setups.webp" alt="HYMO Setups" width="210"> | <img src="assets/manufacturers/bealien.webp" alt="beAlien Setups" width="210"> |

</div>

Die Hersteller-Grafiken werden auch in der bestehenden Website-Diashow verwendet.

---

## 🧩 Architektur

```text
                         ┌─────────────────────┐
                         │       Browser       │
                         │   LMU Setup DB UI   │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │  runtime-worker.js  │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │  access-worker.js   │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    ui-hotfix.js     │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ production-worker.js│
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │      worker.js      │
                         └──────────┬──────────┘
                                    │
             ┌──────────────────────┼──────────────────────┐
             │                      │                      │
             ▼                      ▼                      ▼
      ┌─────────────┐        ┌─────────────┐        ┌─────────────┐
      │   Discord   │        │ Cloudflare  │        │   GitHub    │
      │ OAuth / Bot │        │  D1 + R2    │        │ Repo/Data   │
      └─────────────┘        └─────────────┘        └─────────────┘
```

### Worker-Layer

| Datei | Aufgabe |
|---|---|
| `runtime-worker.js` | produktiver Cloudflare Entry Point |
| `access-worker.js` | Access-/Berechtigungs-Layer |
| `ui-hotfix.js` | bestehende UI-Integrationen |
| `production-worker.js` | produktive Integrationslogik |
| `worker.js` | Kern-API, OAuth, Uploads, Discord und Datenzugriffe |
| `setup-version.js` | persistente Setup-Versionen und Edit-Funktion |

---

## 📁 Repository Map

```text
Le-Mans-Ultimate-Setups/
│
├── 🎨 assets/
│   ├── header-logo.webp
│   ├── bp-logo.webp
│   ├── three-peaks-racing-logo.webp
│   └── manufacturers/
│       ├── go-setups.webp
│       ├── hymo-setups.webp
│       └── bealien.webp
│
├── 🤖 discord-presence/
│   ├── index.js
│   ├── bot.js
│   ├── package.json
│   ├── .env.example
│   └── README.txt
│
├── 📦 setups/
│
├── 🌐 index.html
├── ⚙️ runtime-worker.js
├── 🔐 access-worker.js
├── 🧩 ui-hotfix.js
├── 🚀 production-worker.js
├── ☁️ worker.js
├── 🔢 setup-version.js
├── 🗃️ setups.json
├── 🧱 schema.sql
├── 🔧 wrangler.jsonc
├── 📝 CHANGELOG.md
└── 📖 README.md
```

---

## 🔐 Berechtigungsmodell

```text
┌───────────────────────┐
│    Database Access    │
├───────────────────────┤
│ ✓ Datenbank ansehen   │
│ ✓ Setups herunterladen│
│ ✗ Upload              │
│ ✗ Delete              │
│ ✗ Edit                │
└───────────────────────┘
            │
            │ höhere Berechtigungsstufe
            ▼
┌────────────────────────┐
│ Upload / Delete Access │
├────────────────────────┤
│ ✓ Datenbank ansehen    │
│ ✓ Download             │
│ ✓ Upload               │
│ ✓ Delete               │
│ ✓ Setup-Version Edit   │
└────────────────────────┘
```

Die relevanten Berechtigungen werden **serverseitig** geprüft. Das Ausblenden von UI-Elementen ist nicht die eigentliche Zugriffskontrolle.

---

## 📦 Setup Upload Pipeline

Der Multi-ZIP-Upload bleibt bewusst strikt sequenziell:

```text
ZIP-Dateien auswählen
        │
        ▼
 Version festlegen
        │
        ▼
   Upload Queue
        │
        ├──► ZIP 1 ──► fertig
        │
        ├──► ZIP 2 ──► fertig
        │
        └──► ZIP 3 ──► fertig

       Concurrency = 1
```

Fehlgeschlagene Uploads können erneut versucht werden. Die dem Upload zugewiesene Version bleibt dabei erhalten.

---

## 🔢 Setup-Versionen

Versionen werden als Metadaten eindeutig einem Setup zugeordnet und persistent gespeichert.

```text
Setup
├── Fahrzeug / Klasse
├── Strecke / Datei
├── bestehende Metadaten
└── Version
```

Neue Uploads können beispielsweise folgende Versionswerte verwenden:

`1.0` · `1.4` · `v2` · `2.1.3` · `2026.10`

Ältere Setups ohne gespeicherte Versionsinformation zeigen **`—`**. Upload/Delete-berechtigte Nutzer können die Version über die Edit-Funktion nachtragen oder später ändern, ohne die Setup-Datei erneut hochzuladen.

---

## 🤖 Discord Integration

### Website

Discord übernimmt unter anderem:

- OAuth Login
- Benutzeridentität
- serverseitige Rechteprüfung
- Setup Requests
- User Ping
- Role Ping

### Presence Bot

Der eigenständige Presence-Bot befindet sich in `discord-presence/`.

```bash
cd discord-presence
npm install
npm start
```

Produktiver Wispbyte-Entry-Point:

```bash
node index.js
```

Der Bot zeigt die konfigurierte **Le Mans Ultimate**-Aktivität über Discord an.

---

## ☁️ Cloudflare Stack

<div align="center">

**Workers** → Anwendung & API  
**D1** → Berechtigungen & persistente Metadaten  
**R2** → Upload-Infrastruktur  
**Secrets** → vertrauliche Konfiguration

</div>

Die zentrale Worker-Konfiguration befindet sich in `wrangler.jsonc`. Der produktive Entry Point ist `runtime-worker.js`.

---

## 🛡️ Security

Die Anwendung setzt auf serverseitige Schutzmechanismen, ohne den normalen berechtigten Nutzerfluss unnötig zu verändern.

Unter anderem relevant:

- Discord OAuth State Validation
- serverseitige Authorization
- Same-Origin-Prüfungen für schreibende Requests
- sichere Session-Cookies
- Input Validation
- Request-Größenlimits
- Security Header / CSP
- D1 Prepared Statements
- geschützte Worker-Secrets

### 🔒 Niemals committen

```text
DISCORD_CLIENT_SECRET
DISCORD_BOT_TOKEN
GITHUB_TOKEN
SESSION_SECRET
LMUPORTAL_API1
LMUPORTAL_API2
.env
.dev.vars
```

`node_modules`, lokale Wrangler-Daten und Environment-Dateien werden über `.gitignore` ausgeschlossen.

---

## 🚀 Deployment Flow

```text
GitHub / main
      │
      ▼
Cloudflare Build
      │
      ▼
npx wrangler deploy
      │
      ▼
Cloudflare Worker
      │
      ▼
Production
```

Änderungen am produktiven Branch werden über die bestehende GitHub-/Cloudflare-Pipeline bereitgestellt.

---

## 🧰 Tech Stack

<div align="center">

| Frontend | Backend | Daten | Integration | Hosting |
|:---:|:---:|:---:|:---:|:---:|
| HTML · CSS · JavaScript | Cloudflare Workers | D1 · R2 · GitHub | Discord API/OAuth | Cloudflare |

</div>

---

## 🏁 Three Peaks Racing

<div align="center">

<img src="assets/three-peaks-racing-logo.webp" alt="Three Peaks Racing" width="300">

### LMU Setup Database

**Built for Le Mans Ultimate. Built for the team.**

`Hypercar` · `LMP2` · `LMP3` · `LMGT3`

<br>

**Three Peaks Racing © 2026**

</div>
