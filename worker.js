export default {
  async fetch(request, env) {
    return new Response(JSON.stringify({
      DISCORD_CLIENT_ID: !!env.DISCORD_CLIENT_ID,
      DISCORD_CLIENT_SECRET: !!env.DISCORD_CLIENT_SECRET,
      DISCORD_BOT_TOKEN: !!env.DISCORD_BOT_TOKEN,
      DISCORD_GUILD_ID: !!env.DISCORD_GUILD_ID,
      DISCORD_ROLE_ID: !!env.DISCORD_ROLE_ID,
      DISCORD_CHANNEL_ID: !!env.DISCORD_CHANNEL_ID,
      SITE_URL: !!env.SITE_URL,
      SESSION_SECRET: !!env.SESSION_SECRET
    }, null, 2), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
};
