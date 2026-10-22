import { AttachmentBuilder } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { ImageFetchError, fetchImage, parseRetryAfter } from '../src/image-client.js';
import { createLogger } from '../src/logger.js';
import { buildWelcomeMessage } from '../src/welcome-message.js';
import { sendWelcome } from '../src/welcome.js';
import { PNG, baseConfig, imageResponse, makeChannel, makeLogger, makeMember } from './helpers.js';

const noSleep = (): Promise<void> => Promise.resolve();

function setup(fetchImpl: ReturnType<typeof vi.fn>) {
  const channel = makeChannel();
  const logger = makeLogger();
  const sleep = vi.fn(noSleep);
  const deps = {
    config: baseConfig,
    channel,
    logger,
    imageOptions: { fetch: fetchImpl as never, sleep },
  };
  return { channel, logger, sleep, deps };
}

describe('sendWelcome', () => {
  it('downloads the image and posts it as welcome.png with an embed and a mention', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse());
    const { channel, deps } = setup(fetchImpl);

    expect(await sendWelcome(makeMember(), deps)).toBe('image');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const requested = new URL(fetchImpl.mock.calls[0]?.[0] as string);
    expect(requested.pathname).toBe('/welcome-image-generator/generate.png');
    expect(requested.searchParams.get('displayName')).toBe('Ada Lovelace');

    expect(channel.send).toHaveBeenCalledTimes(1);
    const payload = channel.send.mock.calls[0]?.[0] as {
      content: string;
      embeds: { image: { url: string }; title: string }[];
      files: AttachmentBuilder[];
      allowedMentions: { users: string[]; parse: string[] };
    };
    expect(payload.content).toBe('<@111111111111111111>');
    expect(payload.embeds[0]?.image.url).toBe('attachment://welcome.png');
    expect(payload.embeds[0]?.title).toBe('Welcome!');
    expect(payload.allowedMentions).toEqual({ parse: [], users: ['111111111111111111'] });
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0]).toBeInstanceOf(AttachmentBuilder);
    expect(payload.files[0]?.name).toBe('welcome.png');
    expect(Buffer.from(payload.files[0]?.attachment as Buffer).equals(PNG)).toBe(true);
  });

  it('falls back to a text welcome when the API fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('nope', { status: 500 }));
    const { channel, logger, deps } = setup(fetchImpl);

    expect(await sendWelcome(makeMember(), deps)).toBe('text');

    // 1 attempt + 1 retry, then give up.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(channel.send).toHaveBeenCalledTimes(1);
    const payload = channel.send.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(payload.content).toBe('<@111111111111111111> Welcome to **Test Server**!');
    expect(payload.embeds).toEqual([]);
    expect(payload).not.toHaveProperty('files');
    expect(logger.error).toHaveBeenCalled();
  });

  it('falls back to a text welcome when the request throws', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    const { channel, deps } = setup(fetchImpl);

    expect(await sendWelcome(makeMember(), deps)).toBe('text');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it('retries once after a 429 and honours Retry-After', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('slow down', { status: 429, headers: { 'retry-after': '3' } }),
      )
      .mockResolvedValueOnce(imageResponse());
    const { channel, logger, sleep, deps } = setup(fetchImpl);

    expect(await sendWelcome(makeMember(), deps)).toBe('image');

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledExactlyOnceWith(3000);
    expect(logger.warn).toHaveBeenCalledWith(
      'Image API asked for a retry',
      expect.objectContaining({ status: 429, delayMs: 3000 }),
    );
    expect(channel.send).toHaveBeenCalledTimes(1);
  });

  it('retries once after a 503 with the default delay', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(imageResponse());
    const { sleep, deps } = setup(fetchImpl);

    expect(await sendWelcome(makeMember(), deps)).toBe('image');
    expect(sleep).toHaveBeenCalledExactlyOnceWith(1000);
  });

  it('does not retry a 404', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('no', { status: 404 }));
    const { sleep, deps } = setup(fetchImpl);

    expect(await sendWelcome(makeMember(), deps)).toBe('text');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('sends a text welcome when posting the image fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse());
    const { channel, deps } = setup(fetchImpl);
    channel.send.mockRejectedValueOnce(new Error('Missing Permissions')).mockResolvedValueOnce({});

    expect(await sendWelcome(makeMember(), deps)).toBe('text');
    expect(channel.send).toHaveBeenCalledTimes(2);
  });

  it('reports failure without throwing when nothing can be sent', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('x', { status: 500 }));
    const { channel, logger, deps } = setup(fetchImpl);
    channel.send.mockRejectedValue(new Error('Missing Access'));

    expect(await sendWelcome(makeMember(), deps)).toBe('failed');
    expect(logger.error).toHaveBeenCalledWith(
      'Could not send the welcome message',
      expect.anything(),
    );
  });
});

describe('fetchImage', () => {
  it('rejects non-image responses', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response('<html>', { headers: { 'content-type': 'text/html' } }));
    await expect(fetchImage('https://x.test/a.png', { fetch: fetchImpl })).rejects.toBeInstanceOf(
      ImageFetchError,
    );
  });

  it('rejects empty and oversized bodies', async () => {
    const empty = vi
      .fn()
      .mockResolvedValue(new Response('', { headers: { 'content-type': 'image/png' } }));
    await expect(fetchImage('https://x.test/a.png', { fetch: empty })).rejects.toThrow(/size/);
    const big = vi.fn().mockResolvedValue(imageResponse());
    await expect(fetchImage('https://x.test/a.png', { fetch: big, maxBytes: 4 })).rejects.toThrow(
      /size/,
    );
  });

  it('turns a timeout into an ImageFetchError', async () => {
    const timeout = new DOMException('timed out', 'TimeoutError');
    const fetchImpl = vi.fn().mockRejectedValue(timeout);
    await expect(fetchImage('https://x.test/a.png', { fetch: fetchImpl })).rejects.toThrow(
      /timed out/,
    );
  });

  it('passes an abort signal to fetch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(imageResponse());
    await fetchImage('https://x.test/a.png', { fetch: fetchImpl, timeoutMs: 5000 });
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('caps the Retry-After wait', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 429, headers: { 'retry-after': '3600' } }))
      .mockResolvedValueOnce(imageResponse());
    const sleep = vi.fn(noSleep);
    await fetchImage('https://x.test/a.png', { fetch: fetchImpl, sleep, maxRetryDelayMs: 10_000 });
    expect(sleep).toHaveBeenCalledExactlyOnceWith(10_000);
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates', () => {
    expect(parseRetryAfter('2', 0)).toBe(2000);
    expect(parseRetryAfter('0.5', 0)).toBe(500);
    const now = Date.parse('2026-10-23T10:00:00Z');
    expect(parseRetryAfter('Fri, 23 Oct 2026 10:00:05 GMT', now)).toBe(5000);
    expect(parseRetryAfter('Fri, 23 Oct 2026 09:00:00 GMT', now)).toBe(0);
    expect(parseRetryAfter('soon', now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
  });
});

describe('buildWelcomeMessage', () => {
  it('uses the embed settings', () => {
    const message = buildWelcomeMessage(
      { embedTitle: 'Hello!', embedColor: 0x123456 },
      { id: '5' },
      true,
    );
    expect(message.embeds).toEqual([
      { title: 'Hello!', color: 0x123456, image: { url: 'attachment://welcome.png' } },
    ]);
  });

  it('text fallback works without a guild name', () => {
    const message = buildWelcomeMessage({ embedTitle: 'x', embedColor: 0 }, { id: '5' }, false);
    expect(message.content).toBe('<@5> Welcome to the server!');
  });
});

describe('logger', () => {
  it('writes JSON lines and redacts secrets', () => {
    const lines: string[] = [];
    const logger = createLogger({
      secrets: ['abcdefgh.12345678'],
      write: (line) => lines.push(line),
      now: () => new Date('2026-10-23T00:00:00Z'),
    });
    logger.info('hello', { note: 'token abcdefgh.12345678 leaked' });
    expect(lines).toHaveLength(1);
    const entry = JSON.parse(lines[0] ?? '') as Record<string, unknown>;
    expect(entry).toMatchObject({
      level: 'info',
      message: 'hello',
      time: '2026-10-23T00:00:00.000Z',
    });
    expect(lines[0]).not.toContain('abcdefgh.12345678');
    expect(lines[0]).toContain('[redacted]');
  });
});
