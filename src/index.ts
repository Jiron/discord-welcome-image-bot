import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Client, Events, GatewayIntentBits, type GuildMember } from 'discord.js';
import { fetchChannel } from './channel.js';
import { ConfigError, parseConfig, type LoadedConfig } from './config.js';
import { createLogger, serializeError } from './logger.js';
import { sendWelcome } from './welcome.js';

const rootFile = (name: string): string => fileURLToPath(new URL(`../${name}`, import.meta.url));

function loadConfig(): LoadedConfig {
  // .env is optional: real environment variables win, and a missing file is fine.
  try {
    process.loadEnvFile(rootFile('.env'));
  } catch {
    // no .env file
  }

  let legacyConfig: unknown;
  try {
    legacyConfig = JSON.parse(readFileSync(rootFile('config.json'), 'utf8')) as unknown;
  } catch {
    // no (or unreadable) config.json
  }
  return parseConfig(process.env, legacyConfig);
}

function main(): void {
  let loaded: LoadedConfig;
  try {
    loaded = loadConfig();
  } catch (error) {
    // Config errors name the settings, never their values.
    const message =
      error instanceof ConfigError ? error.message : 'Could not load the configuration';
    console.error(JSON.stringify({ level: 'error', message }));
    process.exit(1);
  }
  const { config, warnings } = loaded;
  const logger = createLogger({ secrets: [config.token] });
  for (const warning of warnings) logger.warn(warning);

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled promise rejection', { error: serializeError(reason) });
  });

  // GuildMembers is a privileged intent: enable it in the Developer Portal
  // (Bot -> Privileged Gateway Intents -> Server Members Intent).
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });

  let shuttingDown = false;
  const shutdown = (reason: string): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info('Shutting down', { reason });
    void client.destroy().finally(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
  });
  // PM2 on Windows cannot deliver signals; with shutdown_with_message it sends this instead.
  process.on('message', (message) => {
    if (message === 'shutdown') shutdown('pm2 shutdown message');
  });

  client.once(Events.ClientReady, (readyClient) => {
    logger.info('Bot is online', {
      user: readyClient.user.tag,
      guilds: readyClient.guilds.cache.size,
    });
    void fetchChannel(readyClient, config.channelId).then((check) => {
      if (check.ok) {
        logger.info('Welcome channel is ready', { channelId: config.channelId });
      } else {
        logger.error('Welcome channel is not usable', {
          channelId: config.channelId,
          reason: check.reason,
        });
      }
    });
  });

  client.on(Events.Error, (error) => {
    logger.error('Discord client error', { error: serializeError(error) });
  });
  client.on(Events.Warn, (message) => {
    logger.warn('Discord client warning', { message });
  });

  client.on(Events.GuildMemberAdd, (member: GuildMember) => {
    void (async () => {
      const check = await fetchChannel(member.client, config.channelId);
      if (!check.ok) {
        logger.error('Cannot welcome member', { userId: member.id, reason: check.reason });
        return;
      }
      // The channel belongs to one server; ignore joins on any other server the bot is in.
      if (check.channel.guildId !== member.guild.id) return;
      await sendWelcome(member, { config, channel: check.channel, logger });
    })().catch((error: unknown) => {
      logger.error('Welcome failed', { userId: member.id, error: serializeError(error) });
    });
  });

  logger.info('Starting', { template: config.template });
  client.login(config.token).catch((error: unknown) => {
    logger.error('Login failed', { error: serializeError(error) });
    process.exit(1);
  });
}

main();
