import { AttachmentBuilder, type MessageCreateOptions } from 'discord.js';
import type { Config } from './config.js';
import { fetchImage, type FetchImageOptions } from './image-client.js';
import { serializeError, type Logger } from './logger.js';
import { ATTACHMENT_NAME, buildWelcomeMessage } from './welcome-message.js';
import { buildWelcomeImageUrl, resolveDisplayName, type ImageSettings } from './welcome-url.js';

/** The part of a discord.js `GuildMember` the welcome flow reads. */
export interface WelcomeMember {
  id: string;
  displayName: string;
  user: { username: string; globalName: string | null; discriminator: string };
  guild: { name: string; memberCount: number };
  displayAvatarURL(options: { extension: 'png'; size: 256 }): string;
}

/** The part of a discord.js text channel the welcome flow writes to. */
export interface WelcomeChannel {
  send: (options: MessageCreateOptions) => Promise<unknown>;
}

export interface WelcomeDeps {
  config: ImageSettings & Pick<Config, 'embedTitle' | 'embedColor'>;
  channel: WelcomeChannel;
  logger: Logger;
  imageOptions?: FetchImageOptions;
}

export type WelcomeOutcome = 'image' | 'text' | 'failed';

/**
 * Welcomes one member: downloads the image from the API and posts it as a file attachment.
 * If the API fails the member still gets a text welcome. Never throws.
 */
export async function sendWelcome(
  member: WelcomeMember,
  deps: WelcomeDeps,
): Promise<WelcomeOutcome> {
  const { config, channel, logger } = deps;
  const log = { userId: member.id, guild: member.guild.name };

  const url = buildWelcomeImageUrl(config, {
    displayName: resolveDisplayName(member),
    username: member.user.username,
    discriminator: member.user.discriminator,
    avatarUrl: member.displayAvatarURL({ extension: 'png', size: 256 }),
    memberCount: member.guild.memberCount,
  });

  const subject = { id: member.id, guildName: member.guild.name };
  let image: Buffer | undefined;
  try {
    image = await fetchImage(url, {
      ...deps.imageOptions,
      onRetry: (info) => {
        logger.warn('Image API asked for a retry', { ...log, ...info });
        deps.imageOptions?.onRetry?.(info);
      },
    });
  } catch (error) {
    logger.error('Could not get the welcome image, sending a text welcome', {
      ...log,
      error: serializeError(error),
    });
  }

  if (image !== undefined) {
    try {
      await channel.send({
        ...buildWelcomeMessage(config, subject, true),
        files: [new AttachmentBuilder(image, { name: ATTACHMENT_NAME })],
      });
      logger.info('Welcome sent', { ...log, withImage: true, bytes: image.length });
      return 'image';
    } catch (error) {
      logger.error('Could not send the welcome image, sending a text welcome', {
        ...log,
        error: serializeError(error),
      });
    }
  }

  try {
    await channel.send(buildWelcomeMessage(config, subject, false));
    logger.info('Welcome sent', { ...log, withImage: false });
    return 'text';
  } catch (error) {
    logger.error('Could not send the welcome message', { ...log, error: serializeError(error) });
    return 'failed';
  }
}
