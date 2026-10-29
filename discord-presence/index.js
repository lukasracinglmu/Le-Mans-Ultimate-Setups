/* @file-notes: Discord-Bot mit Präsenz und Setup-Request-Slash-Command. */
import 'dotenv/config';
import { REQUEST_MANUFACTURERS, resolveRequestManufacturer, setupRequestPayload, isAnyRequestManufacturer } from './request-manufacturers.js';
import { searchRequestTracks, resolveRequestTrack, matchingRequestSetups } from './request-tracks.js';
import { readFile } from 'node:fs/promises';
import {
  ActivityType,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
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
const setupsFile = process.env.SETUPS_FILE?.trim() || './setups.json';
const setupsUrl = process.env.SETUPS_SOURCE_URL?.trim();
const githubToken = process.env.GITHUB_TOKEN?.trim();
const githubOwner = process.env.GITHUB_OWNER?.trim() || 'lukasracinglmu';
const githubRepo = process.env.GITHUB_REPO?.trim() || 'Le-Mans-Ultimate-Setups';
const githubBranch = process.env.GITHUB_BRANCH?.trim() || 'main';
const setupDownloadBaseUrl = process.env.SETUP_DOWNLOAD_BASE_URL?.trim() || 'https://le-mans-ultimate-setups.3peaks-database.workers.dev';
const setupSupplyRoleId = process.env.DISCORD_UPLOAD_ROLE_ID?.trim() || process.env.DISCORD_ROLE_ID?.trim() || '1538601074074849330';
const setupConfirmationWhitelist = new Set([
  '771358435416473600',
  '640948738445279261',
  '198399938739175424',
  '711862720567312455',
  '646758275714514955',
  '999265474078593164'
]);

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
    .setDescription('Strecke aus der Liste auswählen')
    .setAutocomplete(true)
    .setRequired(true)
    .setMaxLength(100))
  .addStringOption(option => option
    .setName('hersteller')
    .setDescription('Optional: gewünschten Setup-Hersteller auswählen')
    .addChoices({name:'Egal',value:'egal'},...REQUEST_MANUFACTURERS.map(item=>({name:item.name,value:item.id})))
    .setRequired(false))
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
  let data;

  try {
    data = JSON.parse(await readFile(setupsFile, 'utf8'));
    console.log(`Fahrzeugdaten lokal geladen: ${setupsFile}`);
  } catch (localError) {
    if (!setupsUrl) {
      throw new Error(`Die Datei ${setupsFile} fehlt auf dem Bot-Host.`);
    }

    const response = await fetch(setupsUrl);
    if (!response.ok) {
      throw new Error(`Fahrzeugdaten konnten nicht geladen werden: HTTP ${response.status}`);
    }

    data = await response.json();
    console.log('Fahrzeugdaten über die konfigurierte URL geladen.');
  }

  vehicles = Object.entries(data).flatMap(([className, entries]) =>
    (Array.isArray(entries) ? entries : [])
      .map(entry => ({ name: String(entry?.name || '').trim(), className }))
      .filter(entry => entry.name)
  );
}

function normalizeSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

async function findExistingSetup(vehicle) {
  if (!githubToken) return null;
  try {
    const path = `setups/${encodeURIComponent(vehicle.className)}/${encodeURIComponent(vehicle.name)}`;
    const response = await fetch(`https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${path}?ref=${encodeURIComponent(githubBranch)}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${githubToken}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'lmu-setup-discord-bot'
      }
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      console.warn(`GitHub-Setupprüfung fehlgeschlagen: HTTP ${response.status}. Der normale Request wird verwendet.`);
      return null;
    }
    const files = await response.json();
    if (!Array.isArray(files)) return null;
    return files
      .filter(file => file?.type === 'file' && /\.zip$/i.test(file.name || ''))
      .sort((a, b) => String(a.name).localeCompare(String(b.name), 'de', { numeric: true, sensitivity: 'base' }));
  } catch (error) {
    console.warn('GitHub-Setupprüfung nicht möglich. Der normale Request wird verwendet.');
    return null;
  }
}

function matchingSetups(files, track, manufacturer) {
  return matchingRequestSetups(files, track, manufacturer);
}

function setupPageUrl(vehicle, setupName) {
  const params = new URLSearchParams({
    category: vehicle.className,
    vehicle: vehicle.name,
    setup: setupName
  });
  return `${setupDownloadBaseUrl}/?${params.toString()}`;
}

function requestVehicleUrl(embed) {
  const fields = Object.fromEntries((embed?.fields || []).map(field => [String(field.name || '').toLowerCase(), String(field.value || '')]));
  const vehicle = fields['fahrzeug'] || '';
  const category = fields['klasse'] || '';
  if (!vehicle || !category) return setupDownloadBaseUrl;
  return `${setupDownloadBaseUrl}/?${new URLSearchParams({ category, vehicle }).toString()}`;
}

function requestField(embed, name) {
  const field = (embed?.fields || []).find(item => String(item.name || '').toLowerCase() === name);
  return String(field?.value || '');
}

function supplyRoleCanConfirm(interaction) {
  const userId = String(interaction.user?.id || interaction.member?.user?.id || '');
  return setupConfirmationWhitelist.has(userId) || Boolean(setupSupplyRoleId && interaction.member?.roles?.cache?.has(setupSupplyRoleId));
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
    const focused=interaction.options.getFocused(true);
    // Fahrzeug und Strecke werden unabhängig voneinander vorgeschlagen.
    if(focused.name==='strecke'){
      await interaction.respond(searchRequestTracks(focused.value,25).map(track=>({name:track.name,value:track.name}))).catch(()=>{});
    }else if(focused.name==='fahrzeug'){
      const query=String(focused.value||'').toLowerCase().trim();
      const matches=vehicles.filter(vehicle=>!query||vehicle.name.toLowerCase().includes(query)).slice(0,25).map(vehicle=>({name:`${vehicle.name} (${vehicle.className})`,value:vehicle.name}));
      await interaction.respond(matches).catch(()=>{});
    }else{
      await interaction.respond([]).catch(()=>{});
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('setup_ready:')) {
    if (!supplyRoleCanConfirm(interaction)) {
      await interaction.reply({ content: 'Nur Mitglieder mit der Setup-Supply-Rolle können ein Setup als hochgeladen bestätigen.', flags: MessageFlags.Ephemeral });
      return;
    }
    const requesterId = interaction.customId.slice('setup_ready:'.length);
    const embed = interaction.message.embeds?.[0];
    const vehicle = requestField(embed, 'fahrzeug');
    const track = requestField(embed, 'strecke');
    const manufacturer = resolveRequestManufacturer(requestField(embed, 'setup-hersteller'))?.name;
    const pageUrl = requestVehicleUrl(embed);
    await interaction.update({
      embeds: embed ? [EmbedBuilder.from(embed).setColor(0x2b9b68).setFooter({ text: 'Setup als hochgeladen bestätigt' })] : [],
      components: []
    });
    await interaction.channel.send({
      content: `<@${requesterId}> Das ${manufacturer ? manufacturer+'-' : ''}Setup für **${vehicle || 'deine Anfrage'}**${track ? ` auf **${track}**` : ''} wurde hochgeladen und kann jetzt genutzt werden: ${pageUrl}`,
      allowedMentions: { users: [requesterId] },
      flags: MessageFlags.SuppressNotifications
    });
    return;
  }

  if (!interaction.isChatInputCommand() || interaction.commandName !== 'request') return;
  const vehicleName = interaction.options.getString('fahrzeug', true);
  const selectedTrack = resolveRequestTrack(interaction.options.getString('strecke', true));
  const track = selectedTrack?.name || '';
  const requestedManufacturer = interaction.options.getString('hersteller')?.trim() || '';
  const manufacturer = resolveRequestManufacturer(requestedManufacturer);
  const moreInfo = interaction.options.getString('weitere_infos')?.trim() || 'Keine weiteren Informationen angegeben.';
  const vehicle = vehicles.find(item => item.name === vehicleName);

  if (!vehicle) {
    await interaction.reply({ content: 'Das Fahrzeug konnte nicht gefunden werden. Bitte nutze die Vorschläge.', ephemeral: true });
    return;
  }

  if (!isAnyRequestManufacturer(requestedManufacturer) && !manufacturer) {
    await interaction.reply({content:'Bitte GO, HYMO, beAlien oder Egal als Hersteller auswählen.',flags:MessageFlags.Ephemeral});
    return;
  }

  if (!selectedTrack) {
    await interaction.reply({content:'Die Strecke konnte nicht gefunden werden. Bitte nutze die Vorschläge.',flags:MessageFlags.Ephemeral});
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  try {
    const availableFiles = await findExistingSetup(vehicle);
    const matches = matchingSetups(availableFiles || [], track, manufacturer?.id);
    if (matches.length > 0) {
      const first = matches[0];
      const pageUrl = setupPageUrl(vehicle, first.name);
      const extra = matches.length > 1 ? ` Weitere passende Versionen: ${matches.length - 1}.` : '';
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Setup auf der Website öffnen')
          .setStyle(ButtonStyle.Link)
          .setURL(pageUrl)
      );

      await interaction.editReply({
        content: `Für **${vehicle.name}** auf **${track}**${manufacturer ? ` von **${manufacturer.name}**` : ''} ist bereits ein Setup vorhanden: **${first.name}**.${extra} Die Fahrzeugseite wird direkt beim Setup geöffnet.`,
        components: [row]
      });
      return;
    }

    const channel = await client.channels.fetch(requestChannelId);
    if (!channel?.isTextBased()) throw new Error('Der Setup-Request-Channel ist nicht erreichbar.');

    const payload=setupRequestPayload({userId:interaction.user.id,vehicle:vehicle.name,carClass:vehicle.className,track,message:moreInfo,manufacturer:manufacturer?.id||null},requestRoleId);
    const {allowed_mentions,...message}=payload;
    await channel.send({...message,allowedMentions:allowed_mentions});
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
