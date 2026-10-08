import { ActivityType, Client, GatewayIntentBits } from 'discord.js';

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  console.error('DISCORD_BOT_TOKEN is missing. Add it as a secret environment variable on the bot host.');
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

function applyPresence() {
  if (!client.user) return;

  client.user.setPresence({
    status: 'dnd',
    activities: [
      {
        name: 'Le Mans Ultimate',
        type: ActivityType.Playing
      }
    ]
  });
}

client.once('ready', () => {
  console.log(`Discord presence connected as ${client.user.tag}`);
  applyPresence();
});

client.on('error', error => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
});

client.login(token);
