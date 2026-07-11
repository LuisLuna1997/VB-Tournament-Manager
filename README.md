# 🏐 VB Tournament Manager

A single-page web app for running **volleyball tournaments day-of** — check in
teams, generate a round-robin schedule, run matches across multiple courts, track
standings, and play out an elimination bracket.

It runs **entirely in your browser**. No backend, no accounts, no database — all
state lives in `localStorage`. Open it, run your tournament, done.

> Built with React 19 + TypeScript + Vite + Zustand + Tailwind v4.

<!-- Optional: drop a screenshot in ./public and reference it here so it shows on GitHub:
![VB Tournament Manager](./public/screenshot.png)
-->

---

## 🚀 Quick start

**Prerequisites:** [Node.js](https://nodejs.org) **20.19+ or 22.12+** (any recent
LTS) and [Git](https://git-scm.com). Check with `node -v`. Starting from a
machine with nothing installed? Jump to **Setting up on a new computer** below.

```bash
# 1. Clone
git clone https://github.com/LuisLuna1997/VB-Tournament-Manager.git
cd VB-Tournament-Manager

# 2. Install dependencies
npm install

# 3. Start the app
npm run dev
```

Vite prints a local URL (usually **http://localhost:5173**) — open it in your
browser and you're running. Hot reload is on, so edits show up instantly.

That's the whole setup. No environment variables, no services to start, no config.

---

## 🛠️ Setting up on a new computer

Starting from a machine with **nothing installed**? Here's the whole thing.

### 1. Install the two prerequisites

You only need **Node.js** (it bundles **npm**) and **Git**.

**macOS**

```bash
# via Homebrew (https://brew.sh):
brew install node git
# …or download the Node.js LTS installer from https://nodejs.org
# (Git also ships with the Xcode tools: xcode-select --install)
```

**Windows**

- Node.js — download the **LTS** installer from <https://nodejs.org> (keep "Add to PATH" checked)
- Git — <https://git-scm.com/download/win>

**Linux (Debian / Ubuntu)**

```bash
sudo apt update && sudo apt install -y git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -   # Node.js 20 LTS
sudo apt install -y nodejs
```

Verify everything is ready:

```bash
node -v      # v20.19+ or v22.12+
npm -v
git --version
```

### 2. Clone the project

```bash
git clone https://github.com/LuisLuna1997/VB-Tournament-Manager.git
cd VB-Tournament-Manager
```

### 3. Install all project dependencies

```bash
npm install
```

This reads `package.json` and downloads **everything the app needs** — React,
Vite, Zustand, Tailwind, SheetJS, and the rest — into a local `node_modules/`
folder. No other manual installs are required.

### 4. Run it

```bash
npm run dev        # dev server with hot reload → http://localhost:5173
```

Other handy commands: `npm run build` (production bundle → `dist/`),
`npm run preview` (serve the build), `npm run check` (lint + typecheck + tests).

> **Optional — standalone macOS app.** `npm run build:app` packages a
> double-clickable `VB Tournament.app`. That step additionally needs **python3**
> on the Mac (preinstalled on most macOS setups / ships with the Xcode command
> line tools).

---

## ✨ Features

- **Multi-division** tournaments (e.g. Beginners / Intermediate / Advanced), each
  progressing through its own phases independently.
- **Check-in** — import teams + players from a spreadsheet (`.xlsx` / `.csv`) or
  add them by hand; track who's `in` / `out` / `late`; mark teams ready.
- **Round-robin scheduling** — automatic circle-method generation with byes,
  per-team or per-division game caps, and "evade" pairings (teams to keep apart).
- **Courts view** — live court assignment, drag-and-drop "up next" staging, score
  entry, and a queue that blocks teams already playing.
- **Standings** — win% ranking with point-differential / points-for /
  head-to-head tiebreakers.
- **Finals** — 2-team (final only) or 4-team (semis → championship + 3rd place)
  brackets, with organizer tie-break picks.
- **Public scoreboard** — a big-screen view of live matches and champions.
- **Import / export** — full JSON backup, XLSX report, clipboard TSV, and optional
  live push to a Google Sheet for spectators.

---

## 📋 Available scripts

| Command | What it does |
|---------|--------------|
| `npm run dev` | Start the dev server with hot reload |
| `npm run build` | Build a production bundle → `dist/` |
| `npm run preview` | Serve the built `dist/` locally to preview it |
| `npm run lint` | Lint the project (ESLint) |
| `npm run typecheck` | Type-check without emitting (`tsc`) |
| `npm run test` | Run tests in watch mode (Vitest) |
| `npm run test:run` | Run the test suite once |
| `npm run coverage` | Run tests with a coverage report |
| `npm run check` | **lint + typecheck + tests** — the pre-share quality gate |

---

## 🏐 Using it

1. **Create a tournament** and add one or more **divisions** (Beginners /
   Intermediate / Advanced).
2. **Check in teams** — either add them manually or **import a spreadsheet**
   (see format below). Mark players `in` / `out` / `late`; teams turn *ready* at
   6+ checked-in players.
3. **Generate the schedule** — a round-robin is created automatically (with byes
   and any game caps you set).
4. **Run matches in the Courts view** — assign courts, stage the next match, and
   enter scores as games finish.
5. **Watch the standings** update live, then **run the finals bracket**.
6. Open the **public scoreboard** on a big screen for players and spectators.

### Spreadsheet import format

Import is **per-division** (triggered from a division's check-in page) and reads
an `.xlsx` / `.csv` with a header row. Columns are matched **by name** (fuzzy), so
order and extra columns are fine:

| Column (header contains…) | Meaning |
|---------------------------|---------|
| `Team manager` / `manager` | Team manager |
| `Division` | Which division the row belongs to |
| `Team name` / `team` | Team name |
| `Color` | Team color (name → hex; auto-assigned if blank) |
| `Player 1`, `Player 2`, … | Player names (repeat per player) |

Each `Player N` column may be followed by an optional **status** cell
(`IN` / `OUT` / `LATE`) and an optional **link letter** (`A`–`Z`) to keep certain
players on the same team.

A row whose team name contains **"free agent"** is imported as an **unassigned
free-agent pool** for the division rather than a team. When the import preview
opens, only the current division's rows — its teams *and* its free-agent pool —
are pre-checked; other divisions' rows stay visible so you can pull them in too.

> 💾 **Your data is local.** Everything is saved in the browser's `localStorage`
> on the machine you're using — nothing is uploaded. Use **Export as JSON** for a
> full backup you can re-import later.

---

## 🖥️ Optional: build a standalone macOS app

You can bundle the app into a double-clickable **`VB Tournament.app`** (plus a
`.zip` for AirDrop) so non-technical organizers can run it without Node:

```bash
npm run build:app
```

> Requires `python3` on the target Mac (it's used to serve the bundled app on
> localhost). See [`Documentation/10-development.md`](./Documentation/10-development.md)
> for details.

---

## 🧱 Tech stack

- **[React 19](https://react.dev)** + **[TypeScript](https://www.typescriptlang.org)**
- **[Vite](https://vite.dev)** — dev server & build
- **[Zustand](https://zustand-demo.pmnd.rs)** — single-store state (persisted to `localStorage`)
- **[Tailwind CSS v4](https://tailwindcss.com)** + **[shadcn/ui](https://ui.shadcn.com)** — styling & components
- **[SheetJS (xlsx)](https://sheetjs.com)** — spreadsheet import/export
- **[Vitest](https://vitest.dev)** — testing

---

## 📁 Project structure

```
src/
  features/        # feature modules (checkin, schedule, courts, standings, finals, scoreboard)
  stores/          # Zustand store — the single Tournament state + actions/selectors
  lib/             # pure logic: scheduling, standings, brackets, export, colors
  types/           # domain types (Tournament → Division → Team → Player, Match)
  layout/          # app shell, division/phase routing
  components/ui/   # shadcn UI primitives
Documentation/     # in-depth docs (architecture, data model, scheduling, …)
```

---

## 📚 Full documentation

Deep dives on architecture, the data model, scheduling, standings, finals, and
more live in **[`Documentation/`](./Documentation/README.md)**.

---

## 🤝 Contributing

Before opening a PR, run the quality gate:

```bash
npm run check   # lint + typecheck + tests
```

Keep algorithmic logic in `src/lib/` (with a unit test) rather than in components
or the store body. See
[`Documentation/10-development.md`](./Documentation/10-development.md) for
conventions.

---

## 📄 License

Released under the [MIT License](./LICENSE) — free to use, modify, and
distribute; see the `LICENSE` file for details.
