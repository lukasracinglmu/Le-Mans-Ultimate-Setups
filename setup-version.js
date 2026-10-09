export async function enrichSetupVersions(setups, category, vehicle, env) {
  if (!Array.isArray(setups) || !env.ACCESS_DB) return setups;
  try {
    const result = await env.ACCESS_DB.prepare(
      "SELECT file_name, version FROM setup_versions WHERE category = ? AND vehicle = ?"
    ).bind(String(category), String(vehicle)).all();
    const versions = new Map((result.results || []).map(row => [String(row.file_name), String(row.version || "")]));
    return setups.map(setup => ({ ...setup, version: versions.get(String(setup.name)) || null }));
  } catch {
    return setups.map(setup => ({ ...setup, version: null }));
  }
}

export function readSetupVersion(form) {
  const version = String(form.get("version") || "").trim();
  if (!version) return { error: "Version fehlt." };
  if (version.length > 40) return { error: "Version ist zu lang." };
  if(/[\u0000-\u001F\u007F]/.test(version)) return { error: "Ungültige Version." };
  return { version };
}

export async function storeSetupVersion(category, vehicle, fileName, version, env) {
  if (!env.ACCESS_DB) return;
  await env.ACCESS_DB.prepare(
    "INSERT INTO setup_versions (category, vehicle, file_name, version, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(category, vehicle, file_name) DO UPDATE SET version = excluded.version, updated_at = CURRENT_TIMESTAMP"
  ).bind(String(category), String(vehicle), String(fileName), String(version)).run();
}
