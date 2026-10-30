/* Full Admin implies ordinary rights; do not materialize new duplicate grants. */
export async function setFullAdminAccess(env, userId, actorId, grant) {
	if (grant) {
		await env.ACCESS_DB.prepare(
			'INSERT INTO full_admin_access (user_id,granted_by,created_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET granted_by=excluded.granted_by,created_at=CURRENT_TIMESTAMP'
		)
			.bind(userId, actorId)
			.run();
	} else {
		// Older versions wrote all four grants. Revoke them in one D1 transaction.
		await env.ACCESS_DB.batch(
			['full_admin_access', 'admin_panel_access', 'database_access', 'upload_access'].map((table) =>
				env.ACCESS_DB.prepare('DELETE FROM ' + table + ' WHERE user_id=?').bind(userId)
			)
		);
	}
}
