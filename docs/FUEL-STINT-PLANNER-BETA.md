# Fuel & Stint Planner (Beta)

## Restore point

- Backup branch: `backup/pre-fuel-stint-planner-2026-10-25`
- Commit before implementation: `941e92c6b92603f94f9c38ba70bd059498499243`
- Created: 25.10.2026 (Europe/Berlin)
- Restore: move `main` back to the backup branch/commit only after confirming the target deployment and branch state.

## Beta scope

The planner is available at `/strategy` and is server-side protected by the existing `databaseAccess` check. Users without Database Access receive a 404 and cannot use the page through a direct URL. The existing setup, upload, ticket, admin, and permission APIs are not changed.

Changed/added files:

- `strategy.html` — isolated Beta UI
- `strategy.js` — vehicle search, synchronized Fuel controls, consumption runs, calculator and stint table
- `runtime-worker.js` — protected page route and authenticated navigation entry

## Data policy

The existing vehicle catalog from `setups.json` supplies vehicle names and classes. No Fuel capacity, VE, BoP, or Energy values are invented. The Beta requires verified values to be entered manually until an official, versioned LMU/BoP source is selected and validated.

## Current calculation model

- Expected laps: race duration / average lap time
- Consumption per lap: entered value or average of test runs
- Safe range: Fuel / consumption minus reserve laps
- Stint length: safe range, limited by optional maximum stint length
- Final stint: automatically shortened when the remaining race distance is shorter
- Driver assignment: round-robin through the entered driver list

The next safe extension is a versioned vehicle-data table with source URL, BoP version, validity date and history.