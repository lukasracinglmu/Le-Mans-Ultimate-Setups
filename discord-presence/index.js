import 'dotenv/config';
import { ActivityType, Client, GatewayIntentBits } from 'discord.js';

const token = process.env.DISCORD_BOT_TOKEN?.trim();

if (!token) {
  console.error('ERROR: DISCORD_BOT_TOKEN is missing.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const startedAt = Date.now();

function applyPresence() {
  if (!client.user) return;

  client.user.setPresence({
    status: 'dnd',
    activities: [
      {
        name: 'Le Mans Ultimate',
        type: ActivityType.Playing,
        timestamps: { start: startedAt }
      }
    ],
    afk: false
  });
}

client.once('ready', () => {
  applyPresence();
  console.log(`Logged in as ${client.user.tag}`);
  console.log('Status: DND');
  console.log('Activity: Playing Le Mans Ultimate');
  console.log('Elapsed timer: enabled');
});

client.on('error', error => {
  console.error('Discord client error:', error);
});

process.on('unhandledRejection', error => {
  console.error('Unhandled rejection:', error);
});

client.login(token).catch(error => {
  console.error('Discord login failed:', error?.message || error);
  process.exit(1);
});
