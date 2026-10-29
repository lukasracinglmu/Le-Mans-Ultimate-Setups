import { readFileSync } from "node:fs";

// GitHub repository settings from wrangler.jsonc, so tests use the production values.
const { vars } = JSON.parse(readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8"));

export const repositoryEnv = Object.freeze({
  GITHUB_OWNER: vars.GITHUB_OWNER,
  GITHUB_REPO: vars.GITHUB_REPO,
  GITHUB_BRANCH: vars.GITHUB_BRANCH,
  BACKUP_GITHUB_OWNER: vars.BACKUP_GITHUB_OWNER,
  BACKUP_GITHUB_REPO: vars.BACKUP_GITHUB_REPO,
  BACKUP_GITHUB_BRANCH: vars.BACKUP_GITHUB_BRANCH,
});
