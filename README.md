# Le Mans Ultimate Setups

Le Mans Ultimate setup database hosted with GitHub and Cloudflare Workers.

## Architecture

- `index.html` – Website / UI
- `worker.js` – Discord OAuth, Discord Mini Player API, setup upload/delete, `/request` interactions and authorization
- `setups.json` – vehicle catalog
- `schema.sql` – D1 schema for individual upload permissions
- `CHANGELOG.md` – project and deployment change log
- `wrangler.jsonc` – Cloudflare Worker configuration

## Secrets

The following values must stay in Cloudflare secrets and must not be committed to GitHub:

- `DISCORD_CLIENT_SECRET`
- `DISCORD_BOT_TOKEN`
- `GITHUB_TOKEN`
- `SESSION_SECRET`

## Discord /request

The Worker handles Discord interactions at:

`/interactions/discord`

Set the full Worker URL plus this path as the Interactions Endpoint URL in the Discord Developer Portal. The owner can then register the guild command from the website admin section.

## Upload permissions

Upload access is granted by either:

1. the configured Discord uploader role, or
2. an individual grant stored in Cloudflare D1.

Individual grants are managed by the owner through the website and are checked server-side.
