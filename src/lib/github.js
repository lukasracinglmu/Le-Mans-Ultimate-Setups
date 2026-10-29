/* @file-notes: Gemeinsame Header und Anfragen für die GitHub API. */
import { githubRepository } from "../config.js";

export const GITHUB_API = "https://api.github.com";

export function githubHeaders(token, headers = {}) {
  return {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "lmu-setups-worker",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...headers,
  };
}

// Request against the website repository. `path` follows "/repos/<owner>/<repo>",
// e.g. "/contents/public/index.html". Timeouts and Accept stay with the caller.
export function githubRequest(env, path, options = {}) {
  const repository = githubRepository(env);
  if (!repository) throw Error("GitHub-Repository ist nicht konfiguriert.");
  return fetch(`${GITHUB_API}/repos/${repository}${path}`, {
    ...options,
    headers: githubHeaders(env.GITHUB_TOKEN, options.headers),
  });
}
