/* @file-notes: Discord-Bot mit Präsenz und Setup-Request-Slash-Command. */
import 'dotenv/config';
import {
  ActivityType,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder
} from 'discord.js';

const token = process.env.DISCORD_BOT_TOKEN?.trim();
const clientId = process.env.DISCORD_CLIENT_ID?.trim();
const guildId = process.env.DISCORD_GUILD_ID?.trim();
const requestChannelId = process.env.DISCORD_SETUP_REQUEST_CHANNEL_ID?.trim() || process.env.DISCORD_CHANNEL_ID?.trim();
const requestRoleId = process.env.DISCORD_SETUP_REQUEST_ROLE_ID?.trim() || process.env.DISCORD_ROLE_ID?.trim();
const setupsUrl = process.env.SETUPS_SOURCE_URL?.trim() || 'https://raw.githubusercontent.com/lukasracinglmu/Le-Mans-Ultimate-Setups/main/setups.json';

if (!token || !clientId || !guildId || !requestChannelId || !requestRoleId) {
  console.error('ERROR: DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID, DISCORD_SETUP_REQUEST_CHANNEL_ID und DISCORD_SETUP_REQUEST_ROLE_ID müssen gesetzt sein.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const startedAt = Date.now();
let vehicles = [];

const requestCommand = new SlashCommandBuilder()
  .setName('request')
  .setDescription('Erstellt eine Setup-Anfrage')
  .addStringOption(option => option
    .setName('fahrzeug')
    .setDescription('Fahrzeug auswählen')
    .setAutocomplete(true)
    .setRequired(true))
  .addStringOption(option => option
    .setName('strecke')
    .setDescription('Gewünschte Strecke')
    .setRequired(true)
    .setMaxLength(100))
  .addStringOption(option => option
    .setName('weitere_infos')
    .setDescription('Weitere Informationen zur Anfrage')
    .setRequired(false)
    .setMaxLength(1000));

function applyPresence() {
  if (!client.user) return;
  client.user.setPresence({
    status: 'dnd',
    activities: [{ name: 'Le Mans Ultimate', type: ActivityType.Playing, timestamps: { start: startedAt } }],
    afk: false
  });
}

async function loadVehicles() {
  const response = await fetch(setupsUrl);
  if (!response.ok) throw new Error(`Fahrzeugdaten konnten nicht geladen werden: HTTP ${response.status}`);
  const data = await response.json();
  vehicles = Object.entries(data).flatMap(([className, entries]) =>
    (Array.isArray(entries) ? entries : [])
      .map(entry => ({ name: String(entry?.name || '').trim(), className }))
      .filter(entry => entry.name)
  );
}

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(token);
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [requestCommand.toJSON()] });
  console.log('Slash-Command /request wurde registriert.');
}

client.once('ready', async () => {
  applyPresence();
  await loadVehicles();
  await registerCommands();
  console.log(`Logged in as ${client.user.tag}`);
  console.log(`Fahrzeuge geladen: ${vehicles.length}`);
});

client.on('interactionCreate', async interaction => {
  if (interaction.isAutocomplete()) {
    if (interaction.commandName !== 'request') return;
    const query = interaction.options.getString('fahrzeug')?.toLowerCase().trim() || '';
    const matches = vehicles
      .filter(vehicle => !query || vehicle.name.toLowerCase().includes(query))
      .slice(0, 25)
      .map(vehicle => ({ name: `${vehicle.name} (${vehicle.className})`, value: vehicle.name }));
    await interaction.respond(matches).catch(() => {});
    return;
  }

  if (!interaction.isChatInputCommand() || interaction.commandName !== 'request') return;
  const vehicleName = interaction.options.getString('fahrzeug', true);
  const track = interaction.options.getString('strecke', true).trim();
  const moreInfo = interaction.options.getString('weitere_infos')?.trim() || 'Keine weiteren Informationen angegeben.';
  const vehicle = vehicles.find(item => item.name === vehicleName);

  if (!vehicle) {
    await interaction.reply({ content: 'Das Fahrzeug konnte nicht gefunden werden. Bitte nutze die Vorschläge.', ephemeral: true });
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    const channel = await client.channels.fetch(requestChannelId);
    if (!channel?.isTextBased()) throw new Error('Der Setup-Request-Channel ist nicht erreichbar.');

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle('Neue Setup-Anfrage')
      .addFields(
        { name: 'Fahrzeug', value: vehicle.name, inline: true },
        { name: 'Klasse', value: vehicle.className, inline: true },
        { name: 'Strecke', value: track, inline: false },
        { name: 'Weitere Informationen', value: moreInfo, inline: false },
        { name: 'Angefragt von', value: `<@${interaction.user.id}>`, inline: false }
      )
      .setTimestamp();

    await channel.send({
      content: `<@&${requestRoleId}>`,
      allowedMentions: { roles: [requestRoleId], users: [interaction.user.id] },
      embeds: [embed]
    });
    await interaction.editReply('Die Setup-Anfrage wurde erfolgreich gesendet.');
  } catch (error) {
    console.error('Setup-Request fehlgeschlagen:', error);
    await interaction.editReply('Die Setup-Anfrage konnte nicht gesendet werden. Bitte prüfe die Bot-Rechte und die Channel-ID.');
  }
});

client.on('error', error => console.error('Discord client error:', error));
process.on('unhandledRejection', error => console.error('Unhandled rejection:', error));
client.login(token).catch(error => {
  console.error('Discord login failed:', error?.message || error);
  process.exit(1);
});
