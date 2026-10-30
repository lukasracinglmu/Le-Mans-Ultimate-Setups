// Share only an in-flight request. No permission result survives beyond it.
let pending = null;
export function fetchMeResponse(refresh = false) {
	if (refresh || !pending) {
		const active = fetch(refresh ? '/api/me?refresh=1' : '/api/me', {
			credentials: 'same-origin',
			cache: 'no-store',
		}).finally(() => {
			if (pending === active) pending = null;
		});
		pending = active;
	}
	return pending.then((response) => response.clone());
}
