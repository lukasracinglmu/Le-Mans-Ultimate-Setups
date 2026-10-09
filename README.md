<div align="center">

<img src="assets/header-logo.webp" alt="Three Peaks Racing" width="260">

# 🏁 LMU Setup Database

### Three Peaks Racing · Le Mans Ultimate

**Setup-Datenbank · Discord-Integration · Cloudflare Worker · D1 · R2**

![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)
![Discord](https://img.shields.io/badge/Discord-Integration-5865F2?logo=discord&logoColor=white)
![GitHub](https://img.shields.io/badge/GitHub-Repository-181717?logo=github&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933?logo=node.js&logoColor=white)

</div>

---

## 🏎️ Projekt

Die **LMU Setup Database** ist die interne Setup-Plattform von **Three Peaks Racing** für *Le Mans Ultimate*. Setups werden nach Fahrzeugklasse und Fahrzeug organisiert und können – abhängig von den Discord-Berechtigungen – angesehen, heruntergeladen, hochgeladen und verwaltet werden.

Die Website läuft über **Cloudflare Workers**. Persistente Berechtigungs- und Setup-Metadaten werden über **Cloudflare D1** verwaltet; Upload-Infrastruktur nutzt außerdem **R2**. Die Anmeldung und Rechteprüfung erfolgt über **Discord OAuth**.

<div align="center">
<img src="assets/bp-logo.webp" alt="Three Peaks Racing Logo" width="420">
</div>

## ✨ Funktionen

- Fahrzeugklassen: **Hypercar, LMP2, LMP3 und LMGT3**
- Setup-Suche und Fahrzeug-/Herstellerfilter
- Herstellerbereiche für **GO, HYMO und beAlien**
- Setup-Download sowie berechtigter Upload/Delete
- Strikt sequenzieller Multi-ZIP-Upload
- Setup-Versionen inklusive nachträglicher Bearbeitung
- Discord OAuth und serverseitige Rechteprüfung
- Individuelle Database- und Upload/Delete-Freigaben
- Discord Setup Requests mit Role-/User-Ping
- LMU Upcoming Races / LMUPORTAL-Integration
- Separater Discord-Presence-Bot

## 🖼️ Verwendete Grafiken

| Bereich | Datei |
|---|---|
| Header | `assets/header-logo.webp` |
| Hintergrund / Branding | `assets/bp-logo.webp` |
| Three Peaks Racing | `assets/three-peaks-racing-logo.webp` |
| GO | `assets/manufacturers/go-setups.webp` |
| HYMO | `assets/manufacturers/hymo-setups.webp` |
| beAlien | `assets/manufacturers/bealien.webp` |

<div align="center">
<img src="assets/manufacturers/go-setups.webp" alt="GO" width="180">&nbsp;&nbsp;
<img src="assets/manufacturers/hymo-setups.webp" alt="HYMO" width="180">&nbsp;&nbsp;
<img src="assets/manufacturers/bealien.webp" alt="beAlien" width="180">
</div>

## 🧩 Architektur

```text
Browser
   │
   ▼
runtime-worker.js
   │
   ▼
access-worker.js
   │
   ▼
ui-hotfix.js
   │
   ▼
production-worker.js
   │
   ▼
worker.js
   ├── Discord OAuth / Rechte
   ├── Setup API
   ├── GitHub
   ├── Cloudflare D1
   └── Cloudflare R2
```

## 📁 Repository-Struktur

```text
Le-Mans-Ultimate-Setups/
├── assets/
│   └── manufacturers/
├── discord-presence/
│   ├── index.js
│   ├── bot.js
│   ├── package.json
│   ├── .env.example
│   └── README.txt
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
└── CHANGELOG.md
```

## 🤖 Discord Bot

Der separate Presence-Bot befindet sich unter `discord-presence/`. Der produktive Einstiegspunkt für Wispbyte ist:

```bash
node index.js
```

Installation:

```bash
cd discord-presence
npm install
npm start
```

Die benötigte Umgebungsvariable ist in `.env.example` dokumentiert. **Echte Tokens gehören niemals ins Repository.**

## ☁️ Cloudflare

Die Worker-Konfiguration befindet sich in `wrangler.jsonc`. Der produktive Worker nutzt unter anderem:

- **D1** für Zugriffsrechte und persistente Metadaten
- **R2** für Upload-Infrastruktur
- **Worker Secrets** für vertrauliche Zugangsdaten
- GitHub als Quelle für Website-, Setup- und Asset-Dateien

## 🔐 Sicherheit

Folgende Werte dürfen **nicht** in GitHub committed werden:

```text
DISCORD_CLIENT_SECRET
DISCORD_BOT_TOKEN
GITHUB_TOKEN
SESSION_SECRET
LMUPORTAL_API1
LMUPORTAL_API2
```

Lokale `.env`-Dateien, `.dev.vars`, `node_modules` und Wrangler-Lokalzustände werden über `.gitignore` ausgeschlossen.

## 🔑 Berechtigungsmodell

**Database Access** erlaubt das Anzeigen und Herunterladen der Setup-Datenbank. **Upload/Delete Access** ist die höhere Berechtigungsstufe und erlaubt zusätzlich Upload, Delete und das Bearbeiten von Setup-Metadaten wie der Version. Die sicherheitsrelevanten Prüfungen erfolgen serverseitig.

## 🗂️ Setup-Versionen

Neue Uploads besitzen eine frei eingegebene Version. Bei Multi-Uploads wird die Version auf den jeweiligen Upload-Vorgang angewendet. Ältere Setups ohne Versionsinformation bleiben unverändert und zeigen `—`; berechtigte Nutzer können die Version nachträglich über die Edit-Funktion ergänzen oder ändern.

## 🚀 Deployment

Der produktive Cloudflare-Worker verwendet `runtime-worker.js` als Entry Point. Änderungen auf dem produktiven Branch werden über die bestehende Cloudflare/GitHub-Deployment-Pipeline bereitgestellt.

---

<div align="center">

### 🏁 Three Peaks Racing

**LMU Setup Database**

*Built for Le Mans Ultimate.*

</div>
