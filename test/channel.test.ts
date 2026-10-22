import { PermissionFlagsBits, type Channel, type Client } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { checkChannel } from '../src/channel.js';

const client = { user: { id: '1' } } as unknown as Client<true>;

function textChannel(permissions: bigint[] | null): Channel {
  return {
    isTextBased: () => true,
    isDMBased: () => false,
    guild: { members: { me: { id: '1' } } },
    permissionsFor: () =>
      permissions === null ? null : { has: (flag: bigint) => permissions.includes(flag) },
  } as unknown as Channel;
}

const all = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
];

describe('checkChannel', () => {
  it('accepts a text channel with all permissions', () => {
    expect(checkChannel(textChannel(all), client).ok).toBe(true);
  });

  it('rejects a missing channel', () => {
    expect(checkChannel(null, client)).toEqual({ ok: false, reason: 'channel not found' });
  });

  it('rejects channels that are not server text channels', () => {
    const voiceLike = { isTextBased: () => false, isDMBased: () => false } as unknown as Channel;
    const dm = { isTextBased: () => true, isDMBased: () => true } as unknown as Channel;
    expect(checkChannel(voiceLike, client).ok).toBe(false);
    expect(checkChannel(dm, client).ok).toBe(false);
  });

  it('names the missing permissions', () => {
    const result = checkChannel(
      textChannel(all.filter((flag) => flag !== PermissionFlagsBits.AttachFiles)),
      client,
    );
    expect(result).toEqual({ ok: false, reason: 'missing permissions: AttachFiles' });
  });

  it('rejects when permissions cannot be worked out', () => {
    expect(checkChannel(textChannel(null), client).ok).toBe(false);
  });
});
