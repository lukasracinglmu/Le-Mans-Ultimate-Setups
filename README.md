<div align="center">

<img src="https://raw.githubusercontent.com/lukasracinglmu/Le-Mans-Ultimate-Setups/main/assets/banner.svg" alt="LMU Setups Banner" width="100%"/>

<!--
  SVG Banner – paste this into /assets/banner.svg in your repo
  GitHub renders SVGs from raw.githubusercontent.com inline when used in <img> tags
-->

</div>

---

<div align="center">

# 🏎️ Le Mans Ultimate — Private Setup Portal

**The fastest laps start before you leave the pits.**

[![Discord](https://img.shields.io/badge/Discord-Join%20Us-5865F2?style=for-the-badge&logo=discord&logoColor=white)](https://discord.gg/)
[![LMU Version](https://img.shields.io/badge/LMU-v1.3-red?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0xMiAyQzYuNDggMiAyIDYuNDggMiAxMnM0LjQ4IDEwIDEwIDEwIDEwLTQuNDggMTAtMTBTMTcuNTIgMiAxMiAyek0xMiAyMGMtNC40MSAwLTgtMy41OS04LThzMy41OS04IDgtOCA4IDMuNTkgOCA4LTMuNTkgOC04IDh6Ii8+PC9zdmc+)](https://game.lemansultimate.com)
[![Status](https://img.shields.io/badge/Setups-LIVE-brightgreen?style=for-the-badge)](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups)
[![Cars](https://img.shields.io/badge/Cars-Hypercar%20%7C%20LMP2%20%7C%20GT3-orange?style=for-the-badge)](https://github.com/lukasracinglmu/Le-Mans-Ultimate-Setups)

</div>

---

<div align="center">

## ⚡ What Is This?

</div>

A **private, invite-only setup portal** for Le Mans Ultimate — built for serious sim racers who want every tenth of a second.

Setups are organized by car class, track, and session type. Access is managed via **Discord OAuth** and individual database permissions. If you're reading this, you've been invited.

---

<div align="center">

## 🗺️ System Architecture

</div>

```
┌─────────────────────────────────────────────────────────────────┐
│                      LE MANS ULTIMATE SETUPS                    │
│                         Private Portal                          │
└─────────────────────────────────────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
     ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
     │  🔐 Discord  │ │  🚗 Vehicle  │ │  📅 Race     │
     │  OAuth Login │ │  Overview   │ │  Calendar    │
     │              │ │  + Setups   │ │  & Countdown │
     └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
            │                │                │
            ▼                ▼                ▼
     ┌──────────────────────────────────────────────┐
     │              PERMISSION LAYER                │
     │  Admin │ Upload+Delete │ Database Access     │
     └──────────────────────┬───────────────────────┘
                            │
            ┌───────────────┼───────────────┐
            ▼               ▼               ▼
   ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
   │  📦 Setup    │ │  🤖 Discord  │ │  🌐 LMUPOR-  │
   │  Upload      │ │  Bot Pings   │ │  TAL Data    │
   │  Multi-ZIP   │ │  Role / User │ │  Integration │
   └──────────────┘ └──────────────┘ └──────────────┘
```

---

<div align="center">

## 🏁 Car Classes

</div>

<table align="center">
<tr>
<td align="center" width="33%">

### HYPERCAR 🔴

`Ferrari 499P` · `Porsche 963`  
`Toyota GR010` · `BMW M Hybrid V8`  
`Peugeot 9X8 Evo` · `Cadillac V-Series.R`  
`Alpine A424` · `Lamborghini SC63`

</td>
<td align="center" width="33%">

### LMP2 🔵

`Oreca 07`

</td>
<td align="center" width="33%">

### LMGT3 🟡

`Ferrari 296 GT3` · `McLaren 720S Evo`  
`Ford Mustang GT3` · `BMW M4 GT3`  
`Lamborghini Huracán EVO2`  
`Lexus RC F GT3` · `Corvette Z06`  
`Porsche 992 GT3 R` · `Aston Martin`

</td>
</tr>
</table>

---

<div align="center">

## 🗓️ Setup Types

</div>

| Type | Code | Description |
|:----:|:----:|:------------|
| 🟢 Qualifying | `Q` | Maximum attack — low fuel, peak downforce where it counts |
| 🔵 Race | `R` | Balanced for consistency over a full stint |
| 🟣 Endurance | `Endu` | Long-run optimized, tire care, traffic management |
| 🌧️ Wet | `Wet` | Rain compounds, adjusted aero, cautious bias |
| ⚡ Esport | `Esport` | Razor-edge, max performance — not for the faint-hearted |
| 🛡️ Safe | `Safe` | Forgiving and stable — great base for learning a track |

---

<div align="center">

## 🔐 Access Flow

</div>

```
You open the portal
        │
        ▼
  ┌─────────────┐      No access?
  │ Discord     │ ─────────────────► Contact Admin on Discord
  │ Login       │
  └──────┬──────┘
         │ Authenticated
         ▼
  ┌─────────────┐      Not whitelisted?
  │ Permission  │ ─────────────────► Request access via Discord
  │ Check       │
  └──────┬──────┘
         │ Approved
         ▼
  ┌─────────────────────────────────┐
  │  Full Setup Portal Access       │
  │  ✓ Browse Vehicles              │
  │  ✓ Filter by Class / Series     │
  │  ✓ Download Setups              │
  │  ✓ View Race Calendar           │
  │  ✓ See Upcoming Events          │
  └─────────────────────────────────┘
```

---

<div align="center">

## 🏆 Tracks

</div>

```
WEC / ELMS CALENDAR                    SETUP AVAILABILITY
══════════════════════════════════════════════════════════

🇫🇷  Le Mans (Full · Mulsanne)          ████████████████ ✓
🇧🇭  Bahrain International              ████████████████ ✓
🇺🇸  COTA (Full · National)             ████████████████ ✓
🇯🇵  Fuji Speedway                      ████████████████ ✓
🇧🇷  Interlagos                         ████████████████ ✓
🇮🇹  Monza (WEC · Curva Grande)         ████████████████ ✓
🇮🇹  Imola                              ████████████████ ✓
🇵🇹  Portimão                           ████████████████ ✓
🇺🇸  Sebring                            ████████████████ ✓
🇬🇧  Silverstone                        ████████████████ ✓
🇧🇪  Spa-Francorchamps                  ████████████████ ✓
🇫🇷  Paul Ricard                        ████████████████ ✓
🇶🇦  Qatar (Lusail)                     ████████████████ ✓
```

---

<div align="center">

## 📦 Upload & Versioning

</div>

Authorized uploaders follow this workflow:

```
 Select ZIP(s)                 Version Tag
      │                             │
      ▼                             ▼
 ┌─────────┐               ┌──────────────┐
 │  Queue  │               │  e.g. v1.3.2 │
 │  Built  │               │  LMU patch   │
 └────┬────┘               └──────┬───────┘
      │                           │
      ▼                           ▼
 ┌───────────────────────────────────────────────┐
 │   Sequential Upload  (Concurrency: 1)         │
 │                                               │
 │   ZIP 1 ──► Extract ──► Validate ──► Store   │
 │   ZIP 2 ──► Extract ──► Validate ──► Store   │
 │   ZIP 3 ──► Extract ──► Validate ──► Store   │
 └───────────────────────────────────────────────┘
               │
               ▼
     Auto-refresh · Live Status · Retry on Fail
```

---

<div align="center">

## 🤖 Discord Bot

</div>

The portal is directly connected to Discord. When a setup request is made:

```
User clicks "Request Setup"
           │
           ▼
   ┌───────────────────┐
   │  Discord Bot      │
   │  @User Ping  ──►  │ ──► Direct message to uploader
   │  @Role Ping  ──►  │ ──► Notify relevant team role
   └───────────────────┘
```

No emails. No forms. Just Discord.

---

<div align="center">

## 🎖️ Race Calendar — Medal System

</div>

Every race in the calendar is rated:

| Medal | Type | Description |
|:-----:|:----:|:------------|
| 🥉 Bronze | Weekly | Standard weekly race events |
| 🥈 Silver | Weekly+ | Higher-priority weekly events |
| 🥇 Gold | Special | Championship rounds, marquee events |

Events auto-remove after they expire. Countdown timers update live.

---

<div align="center">

## 🔎 Finding Your Setup

</div>

1. **Log in** via Discord
2. **Select** your car from the Vehicle Overview
3. **Filter** by class (Hypercar / LMP2 / GT3) or series (GO / HYMO / beAlien)
4. **Open** the car detail view — scroll to your track
5. **Download** the setup ZIP
6. Drop it into `Le Mans Ultimate\UserData\player\Settings\`

---

<div align="center">

---

*Built for the sim racing community. Access by invitation only.*  
*Setups are tagged by car, track, session type, and LMU version.*

[![Made with ❤️ for LMU](https://img.shields.io/badge/Made%20with%20%E2%9D%A4%EF%B8%8F%20for-Le%20Mans%20Ultimate-red?style=flat-square)](https://game.lemansultimate.com)

</div>
