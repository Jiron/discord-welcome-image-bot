import type { APIEmbed } from 'discord.js';

export const ATTACHMENT_NAME = 'welcome.png';

export interface MessageSettings {
  embedTitle: string;
  embedColor: number;
}

export interface MessageSubject {
  /** User ID, used for the mention. */
  id: string;
  guildName?: string | undefined;
}

export interface WelcomeMessageContent {
  content: string;
  embeds: APIEmbed[];
  /** Only the new member may be pinged, whatever the display name contains. */
  allowedMentions: { parse: []; users: string[] };
}

export function mention(userId: string): string {
  return `<@${userId}>`;
}

/**
 * The message for a member: a mention, plus an embed whose image is the file attached as
 * `welcome.png`. Without an image (the API was unreachable) it is a plain text welcome.
 */
export function buildWelcomeMessage(
  settings: MessageSettings,
  subject: MessageSubject,
  withImage: boolean,
): WelcomeMessageContent {
  const allowedMentions = { parse: [] as [], users: [subject.id] };
  if (!withImage) {
    const where = subject.guildName === undefined ? 'the server' : `**${subject.guildName}**`;
    return {
      content: `${mention(subject.id)} Welcome to ${where}!`,
      embeds: [],
      allowedMentions,
    };
  }
  return {
    content: mention(subject.id),
    embeds: [
      {
        title: settings.embedTitle,
        color: settings.embedColor,
        image: { url: `attachment://${ATTACHMENT_NAME}` },
      },
    ],
    allowedMentions,
  };
}
