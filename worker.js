const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_OAUTH = "https://discord.com/oauth2";

const COOKIE_NAME = "lmu_session";
const STATE_COOKIE = "lmu_oauth_state";

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // =========================
      // DISCORD LOGIN
      // =========================
      if (url.pathname === "/auth/discord") {
        return await discordLogin(env);
      }

      // =========================
      // DISCORD CALLBACK
      // =========================
      if (url.pathname === "/auth/discord/callback") {
        return await discordCallback(request, env);
      }

      // =========================
      // CURRENT USER
      // =========================
      if (url.pathname === "/api/me") {
        return await getCurrentUser(request, env);
      }

      // =========================
      // SETUP REQUEST
      // =========================
      if (
        url.pathname === "/api/request" &&
        request.method === "POST"
      ) {
        return await createSetupRequest(request, env);
      }

      // =========================
      // LOGOUT
      // =========================
      if (url.pathname === "/auth/logout") {
        return logout();
      }

      // =========================
      // WEBSITE
      // =========================
      return env.ASSETS.fetch(request);

    } catch (error) {
      return new Response(
        `Worker Error

Name: ${error?.name || "Unknown"}

Message: ${error?.message || "Unknown"}

Stack:
${error?.stack || "No stack available"}`,
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


// ============================================================
// DISCORD LOGIN
// ============================================================

async function discordLogin(env) {

  if (
    !env.DISCORD_CLIENT_ID ||
    !env.SITE_URL
  ) {
    return errorResponse(
      "DISCORD_CLIENT_ID oder SITE_URL fehlt in Cloudflare.",
      500
    );
  }

  const state = crypto.randomUUID();

  const redirectUri =
    `${env.SITE_URL}/auth/discord/callback`;

  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "identify",
    state: state
  });

  const response = Response.redirect(
    `${DISCORD_OAUTH}/authorize?${params.toString()}`,
    302
  );

  response.headers.append(
    "Set-Cookie",
    `${STATE_COOKIE}=${state}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`
  );

  return response;
}


// ============================================================
// DISCORD CALLBACK
// ============================================================

async function discordCallback(request, env) {

  const url = new URL(request.url);

  const code =
    url.searchParams.get("code");

  const returnedState =
    url.searchParams.get("state");

  const discordError =
    url.searchParams.get("error");

  const errorDescription =
    url.searchParams.get("error_description");


  // Discord hat einen Fehler zurückgegeben
  if (discordError) {

    return errorResponse(
      `Discord OAuth2 Fehler: ${discordError}${
        errorDescription
          ? ` – ${errorDescription}`
          : ""
      }`,
      400
    );
  }


  // Kein Code
  if (!code) {

    return errorResponse(
      "Kein Discord Authorization Code vorhanden.",
      400
    );
  }


  // Cookies lesen
  const cookieHeader =
    request.headers.get("Cookie") || "";

  const cookies =
    parseCookies(cookieHeader);

  const savedState =
    cookies[STATE_COOKIE];


  // State prüfen
  if (
    !savedState ||
    !returnedState ||
    savedState !== returnedState
  ) {

    return errorResponse(
      "Ungültiger OAuth2 State. Bitte erneut anmelden.",
      400
    );
  }


  if (
    !env.DISCORD_CLIENT_ID ||
    !env.DISCORD_CLIENT_SECRET ||
    !env.SITE_URL
  ) {

    return errorResponse(
      "Discord OAuth2 Variablen fehlen in Cloudflare.",
      500
    );
  }


  const redirectUri =
    `${env.SITE_URL}/auth/discord/callback`;


  // ==========================================================
  // TOKEN
  // ==========================================================

  const tokenResponse =
    await fetch(
      `${DISCORD_API}/oauth2/token`,
      {
        method: "POST",

        headers: {
          "Content-Type":
            "application/x-www-form-urlencoded"
        },

        body:
          new URLSearchParams({
            client_id:
              env.DISCORD_CLIENT_ID,

            client_secret:
              env.DISCORD_CLIENT_SECRET,

            grant_type:
              "authorization_code",

            code:
              code,

            redirect_uri:
              redirectUri
          })
      }
    );


  if (!tokenResponse.ok) {

    const errorText =
      await tokenResponse.text();

    return errorResponse(
      `Discord Token Fehler (${tokenResponse.status}): ${errorText}`,
      500
    );
  }


  const tokenData =
    await tokenResponse.json();


  if (!tokenData.access_token) {

    return errorResponse(
      "Discord hat kein Access Token zurückgegeben.",
      500
    );
  }


  // ==========================================================
  // DISCORD USER
  // ==========================================================

  const userResponse =
    await fetch(
      `${DISCORD_API}/users/@me`,
      {
        headers: {
          Authorization:
            `Bearer ${tokenData.access_token}`
        }
      }
    );


  if (!userResponse.ok) {

    const errorText =
      await userResponse.text();

    return errorResponse(
      `Discord Benutzer Fehler (${userResponse.status}): ${errorText}`,
      500
    );
  }


  const user =
    await userResponse.json();


  // ==========================================================
  // ROLLE PRÜFEN
  // ==========================================================

  const hasAccess =
    await checkDatabaseAccess(
      user.id,
      env
    );


  if (!hasAccess) {

    return new Response(
      `
<!DOCTYPE html>
<html lang="de">

<head>

<meta charset="UTF-8">

<meta name="viewport"
      content="width=device-width, initial-scale=1.0">

<title>Kein Zugriff</title>

<style>

body {
  margin: 0;
  background: #111;
  color: white;
  font-family: Arial, sans-serif;

  min-height: 100vh;

  display: flex;
  align-items: center;
  justify-content: center;
}

.box {
  max-width: 500px;
  padding: 35px;
  text-align: center;
}

a {
  color: white;
}

</style>

</head>

<body>

<div class="box">

<h1>Kein Zugriff</h1>

<p>
Dein Discord-Account besitzt keinen Zugriff
auf die LMU Setup Database.
</p>

<p>
Dir fehlt die erforderliche Database-Rolle.
</p>

<p>
<a href="/">Zurück zur Website</a>
</p>

</div>

</body>

</html>
      `,
      {
        status: 403,

        headers: {
          "Content-Type":
            "text/html; charset=UTF-8"
        }
      }
    );
  }


  // ==========================================================
  // SESSION
  // ==========================================================

  if (!env.SESSION_SECRET) {

    return errorResponse(
      "SESSION_SECRET fehlt in Cloudflare.",
      500
    );
  }


  const sessionData = {

    id:
      user.id,

    username:
      user.username,

    exp:
      Math.floor(
        Date.now() / 1000
      ) + 604800
  };


  const session =
    await createSession(
      sessionData,
      env.SESSION_SECRET
    );


  return new Response(
    null,
    {
      status: 302,

      headers: {

        "Location": "/",

        "Set-Cookie":
          `${COOKIE_NAME}=${session}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
      }
    }
  );
}


// ============================================================
// DISCORD ROLLE PRÜFEN
// ============================================================

async function checkDatabaseAccess(
  userId,
  env
) {

  if (
    !env.DISCORD_BOT_TOKEN ||
    !env.DISCORD_GUILD_ID ||
    !env.DISCORD_ROLE_ID
  ) {
    return false;
  }


  const response =
    await fetch(
      `${DISCORD_API}/guilds/${env.DISCORD_GUILD_ID}/members/${userId}`,
      {
        headers: {
          Authorization:
            `Bot ${env.DISCORD_BOT_TOKEN}`
        }
      }
    );


  if (!response.ok) {
    return false;
  }


  const member =
    await response.json();


  return (
    Array.isArray(member.roles) &&
    member.roles.includes(
      env.DISCORD_ROLE_ID
    )
  );
}


// ============================================================
// CURRENT USER
// ============================================================

async function getCurrentUser(
  request,
  env
) {

  if (!env.SESSION_SECRET) {

    return json({
      loggedIn: false
    });
  }


  const session =
    await getSession(
      request,
      env.SESSION_SECRET
    );


  if (!session) {

    return json({
      loggedIn: false
    });
  }


  const hasAccess =
    await checkDatabaseAccess(
      session.id,
      env
    );


  if (!hasAccess) {

    return json({
      loggedIn: false
    });
  }


  return json({
    loggedIn: true,

    user: {
      id:
        session.id,

      username:
        session.username
    }
  });
}


// ============================================================
// SETUP REQUEST
// ============================================================

async function createSetupRequest(
  request,
  env
) {

  const session =
    await getSession(
      request,
      env.SESSION_SECRET
    );


  if (!session) {

    return json(
      {
        success: false,
        error:
          "Nicht angemeldet."
      },
      401
    );
  }


  const hasAccess =
    await checkDatabaseAccess(
      session.id,
      env
    );


  if (!hasAccess) {

    return json(
      {
        success: false,
        error:
          "Keine Database-Berechtigung."
      },
      403
    );
  }


  let body;


  try {

    body =
      await request.json();

  } catch {

    return json(
      {
        success: false,
        error:
          "Ungültige Anfrage."
      },
      400
    );
  }


  const vehicle =
    String(
      body.vehicle || ""
    ).trim();


  const track =
    String(
      body.track || ""
    ).trim();


  const message =
    String(
      body.message || ""
    ).trim();


  if (
    !vehicle ||
    !track
  ) {

    return json(
      {
        success: false,
        error:
          "Fahrzeug und Strecke sind erforderlich."
      },
      400
    );
  }


  const discordMessage =
`## Setup Request

**User:** ${session.username}
**Discord ID:** ${session.id}

**Fahrzeug:** ${vehicle}
**Strecke:** ${track}

${
  message
    ? `**Nachricht:**\n${message}`
    : ""
}`;


  const discordResponse =
    await fetch(
      `${DISCORD_API}/channels/${env.DISCORD_CHANNEL_ID}/messages`,
      {
        method: "POST",

        headers: {
          "Authorization":
            `Bot ${env.DISCORD_BOT_TOKEN}`,

          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({
            content:
              discordMessage
          })
      }
    );


  if (!discordResponse.ok) {

    const errorText =
      await discordResponse.text();

    return json(
      {
        success: false,
        error:
          `Discord Fehler (${discordResponse.status}): ${errorText}`
      },
      500
    );
  }


  return json({
    success: true
  });
}


// ============================================================
// SESSION ERSTELLEN
// ============================================================

async function createSession(
  data,
  secret
) {

  const payload =
    base64urlEncode(
      JSON.stringify(data)
    );


  const signature =
    await sign(
      payload,
      secret
    );


  return `${payload}.${signature}`;
}


// ============================================================
// SESSION LESEN
// ============================================================

async function getSession(
  request,
  secret
) {

  if (!secret) {
    return null;
  }


  const cookieHeader =
    request.headers.get("Cookie");


  if (!cookieHeader) {
    return null;
  }


  const cookies =
    parseCookies(
      cookieHeader
    );


  const session =
    cookies[COOKIE_NAME];


  if (!session) {
    return null;
  }


  const parts =
    session.split(".");


  if (parts.length !== 2) {
    return null;
  }


  const [
    payload,
    signature
  ] = parts;


  const valid =
    await verify(
      payload,
      signature,
      secret
    );


  if (!valid) {
    return null;
  }


  try {

    const data =
      JSON.parse(
        base64urlDecode(
          payload
        )
      );


    if (
      data.exp &&
      Math.floor(
        Date.now() / 1000
      ) > data.exp
    ) {

      return null;
    }


    return data;

  } catch {

    return null;
  }
}


// ============================================================
// HMAC SIGN
// ============================================================

async function sign(
  value,
  secret
) {

  const key =
    await crypto.subtle.importKey(
      "raw",

      new TextEncoder()
        .encode(secret),

      {
        name: "HMAC",
        hash: "SHA-256"
      },

      false,

      ["sign"]
    );


  const signature =
    await crypto.subtle.sign(
      "HMAC",

      key,

      new TextEncoder()
        .encode(value)
    );


  return base64urlEncode(
    new Uint8Array(
      signature
    )
  );
}


// ============================================================
// VERIFY
// ============================================================

async function verify(
  value,
  signature,
  secret
) {

  const expected =
    await sign(
      value,
      secret
    );


  return timingSafeEqual(
    expected,
    signature
  );
}


// ============================================================
// TIMING SAFE EQUAL
// ============================================================

function timingSafeEqual(
  a,
  b
) {

  if (
    a.length !==
    b.length
  ) {

    return false;
  }


  let result = 0;


  for (
    let i = 0;
    i < a.length;
    i++
  ) {

    result |=
      a.charCodeAt(i) ^
      b.charCodeAt(i);
  }


  return result === 0;
}


// ============================================================
// LOGOUT
// ============================================================

function logout() {

  return new Response(
    null,
    {
      status: 302,

      headers: {

        "Location": "/",

        "Set-Cookie":
          `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
      }
    }
  );
}


// ============================================================
// COOKIES
// ============================================================

function parseCookies(
  cookieHeader
) {

  const cookies = {};


  for (
    const part of
    cookieHeader.split(";")
  ) {

    const [
      key,
      ...value
    ] =
      part.trim().split("=");


    if (key) {

      cookies[key] =
        value.join("=");
    }
  }


  return cookies;
}


// ============================================================
// BASE64URL ENCODE
// ============================================================

function base64urlEncode(
  input
) {

  const bytes =
    typeof input === "string"
      ? new TextEncoder()
          .encode(input)
      : input;


  let binary = "";


  for (
    const byte of bytes
  ) {

    binary +=
      String.fromCharCode(
        byte
      );
  }


  return btoa(binary)
    .replace(
      /\+/g,
      "-"
    )
    .replace(
      /\//g,
      "_"
    )
    .replace(
      /=+$/,
      ""
    );
}


// ============================================================
// BASE64URL DECODE
// ============================================================

function base64urlDecode(
  input
) {

  const padded =
    input
      .replace(
        /-/g,
        "+"
      )
      .replace(
        /_/g,
        "/"
      )
      .padEnd(
        input.length +
        (
          4 -
          input.length % 4
        ) % 4,
        "="
      );


  const binary =
    atob(padded);


  const bytes =
    Uint8Array.from(
      binary,
      char =>
        char.charCodeAt(0)
    );


  return new TextDecoder()
    .decode(bytes);
}


// ============================================================
// JSON
// ============================================================

function json(
  data,
  status = 200
) {

  return new Response(
    JSON.stringify(data),
    {
      status,

      headers: {
        "Content-Type":
          "application/json; charset=UTF-8",

        "Cache-Control":
          "no-store"
      }
    }
  );
}


// ============================================================
// ERROR
// ============================================================

function errorResponse(
  message,
  status
) {

  return json(
    {
      success: false,
      error: message
    },
    status
  );
}
