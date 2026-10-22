import {
  PermissionFlagsBits,
  type Channel,
  type Client,
  type GuildTextBasedChannel,
} from 'discord.js';

export const REQUIRED_PERMISSIONS = [
  ['ViewChannel', PermissionFlagsBits.ViewChannel],
  ['SendMessages', PermissionFlagsBits.SendMessages],
  ['EmbedLinks', PermissionFlagsBits.EmbedLinks],
  ['AttachFiles', PermissionFlagsBits.AttachFiles],
] as const;

export type ChannelCheck =
  { ok: true; channel: GuildTextBasedChannel } | { ok: false; reason: string };

/** The channel must be a server text channel the bot can post embeds and files in. */
export function checkChannel(channel: Channel | null, client: Client<true>): ChannelCheck {
  if (channel === null) return { ok: false, reason: 'channel not found' };
  if (!channel.isTextBased() || channel.isDMBased()) {
    return { ok: false, reason: 'channel is not a server text channel' };
  }
  const me = channel.guild.members.me;
  const permissions = me ? channel.permissionsFor(me) : channel.permissionsFor(client.user);
  if (!permissions) return { ok: false, reason: 'could not work out the bot permissions' };
  const missing = REQUIRED_PERMISSIONS.filter(([, flag]) => !permissions.has(flag)).map(
    ([name]) => name,
  );
  if (missing.length > 0) {
    return { ok: false, reason: `missing permissions: ${missing.join(', ')}` };
  }
  return { ok: true, channel };
}

export async function fetchChannel(client: Client<true>, id: string): Promise<ChannelCheck> {
  try {
    return checkChannel(await client.channels.fetch(id), client);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `could not fetch the channel (${message})` };
  }
}
