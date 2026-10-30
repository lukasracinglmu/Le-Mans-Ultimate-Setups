/* @file-notes: Findet zu einer Anfrage die Route aus der Routing-Tabelle. */

// `method` is one method, a list or '*' for any method. `path` is one path or a list;
// a path ending in '*' matches every path that starts with the part before it.
function matches(route, method, pathname) {
	if (route.method !== '*' && ![].concat(route.method).includes(method)) {
		return false;
	}
	return []
		.concat(route.path)
		.some((path) =>
			path.endsWith('*') ? pathname.startsWith(path.slice(0, -1)) : pathname === path
		);
}

// Middleware runs first, in order; the first one that answers ends the request. Then the
// first matching route answers, or the fallback when no route matches.
export function createRouter({ middleware = [], routes, fallback }) {
	return async function handle(request, env, ctx) {
		for (const step of middleware) {
			const response = await step(request, env, ctx);
			if (response) {
				return response;
			}
		}
		const { pathname } = new URL(request.url);
		const route = routes.find((entry) => matches(entry, request.method, pathname));
		return route ? route.handler(request, env, ctx) : fallback(request, env, ctx);
	};
}
