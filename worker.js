export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/test") {
        return new Response("Worker funktioniert!");
      }

      return env.ASSETS.fetch(request);

    } catch (error) {
      return new Response(
        `WORKER ERROR

Name: ${error?.name || "unknown"}

Message: ${error?.message || "unknown"}

Stack:
${error?.stack || "kein Stack vorhanden"}`,
        {
          status: 500,
          headers: {
            "Content-Type": "text/plain; charset=UTF-8"
          }
        }
      );
    }
  }
};
