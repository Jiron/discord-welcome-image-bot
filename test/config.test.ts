import { describe, expect, it } from 'vitest';
import { ConfigError, DEFAULT_BACKGROUND, legacyChannelId, parseConfig } from '../src/config.js';

const CHANNEL = '123456789012345678';
const required = { TOKEN: 'secret-token-value', CHANNEL_ID: CHANNEL };

describe('parseConfig', () => {
  it('applies defaults that keep the old look', () => {
    const { config, warnings } = parseConfig(required);
    expect(warnings).toEqual([]);
    expect(config).toMatchObject({
      token: 'secret-token-value',
      channelId: CHANNEL,
      template: 'classic',
      apiBase: 'https://api.discorddevtools.xyz',
      title: 'Welcome to the server!',
      text: undefined,
      background: DEFAULT_BACKGROUND,
      titleColor: 'a9a9a9',
      textColor: 'a9a9a9',
      usernameColor: 'fff',
      borderColor: 'a9a9a9',
      accentColor: undefined,
      showMemberCount: undefined,
      embedTitle: 'Welcome!',
      embedColor: 0x5865f2,
    });
  });

  it('reads and normalises optional settings', () => {
    const { config } = parseConfig({
      ...required,
      TEMPLATE: 'Banner',
      API_BASE: 'https://api.example.test///',
      TITLE: 'Hi!',
      TEXT: 'Read the rules',
      BACKGROUND: 'https://example.test/bg.png',
      ACCENT_COLOR: '#FF8800',
      TITLE_COLOR: 'ABCDEF',
      SHOW_MEMBER_COUNT: 'true',
      EMBED_COLOR: '#00ff00',
    });
    expect(config).toMatchObject({
      template: 'banner',
      apiBase: 'https://api.example.test',
      title: 'Hi!',
      text: 'Read the rules',
      background: 'https://example.test/bg.png',
      accentColor: 'ff8800',
      titleColor: 'abcdef',
      showMemberCount: true,
      embedColor: 0x00ff00,
    });
  });

  it('treats empty values like unset ones (KEY= in .env)', () => {
    const { config } = parseConfig({
      ...required,
      TEMPLATE: '',
      TEXT: '',
      ACCENT_COLOR: '',
      SHOW_MEMBER_COUNT: '',
      API_BASE: '',
    });
    expect(config.template).toBe('classic');
    expect(config.text).toBeUndefined();
    expect(config.accentColor).toBeUndefined();
    expect(config.showMemberCount).toBeUndefined();
    expect(config.apiBase).toBe('https://api.discorddevtools.xyz');
  });

  it('requires TOKEN', () => {
    expect(() => parseConfig({ CHANNEL_ID: CHANNEL })).toThrow(ConfigError);
    expect(() => parseConfig({ CHANNEL_ID: CHANNEL })).toThrow(/TOKEN/);
  });

  it('requires CHANNEL_ID when there is no config.json to fall back on', () => {
    expect(() => parseConfig({ TOKEN: 'x' })).toThrow(/CHANNEL_ID/);
    expect(() => parseConfig({ TOKEN: 'x' }, {})).toThrow(/CHANNEL_ID/);
  });

  it.each([
    ['CHANNEL_ID', 'not-a-snowflake'],
    ['API_BASE', 'ftp://example.test'],
    ['BACKGROUND', 'javascript:alert(1)'],
    ['ACCENT_COLOR', 'red'],
    ['TEMPLATE', 'a b&c'],
    ['SHOW_MEMBER_COUNT', 'maybe'],
    ['EMBED_COLOR', 'fff'],
  ])('rejects an invalid %s', (key, value) => {
    expect(() => parseConfig({ ...required, [key]: value })).toThrow(ConfigError);
  });

  it('never puts values in the error message', () => {
    expect(() =>
      parseConfig({ TOKEN: 'super-secret-token', CHANNEL_ID: 'bogus-channel-value' }),
    ).toThrow(/CHANNEL_ID/);
    try {
      parseConfig({ TOKEN: 'super-secret-token', CHANNEL_ID: 'bogus-channel-value' });
    } catch (error) {
      expect((error as Error).message).not.toContain('super-secret-token');
      expect((error as Error).message).not.toContain('bogus-channel-value');
    }
  });

  describe('config.json fallback (migration from the old bot)', () => {
    it('uses channelID from config.json when CHANNEL_ID is missing', () => {
      const { config, warnings } = parseConfig({ TOKEN: 'x' }, { channelID: CHANNEL });
      expect(config.channelId).toBe(CHANNEL);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toContain('CHANNEL_ID');
    });

    it('also falls back when CHANNEL_ID is empty', () => {
      const { config } = parseConfig({ TOKEN: 'x', CHANNEL_ID: '' }, { channelID: CHANNEL });
      expect(config.channelId).toBe(CHANNEL);
    });

    it('lets CHANNEL_ID win over config.json', () => {
      const { config, warnings } = parseConfig(
        { TOKEN: 'x', CHANNEL_ID: '111111111111111111' },
        { channelID: CHANNEL },
      );
      expect(config.channelId).toBe('111111111111111111');
      expect(warnings).toEqual([]);
    });

    it('ignores the placeholder from the template config.json', () => {
      const placeholder = { token: 'TOKEN HERE', channelID: 'CHANNEL ID HERE' };
      expect(() => parseConfig({ TOKEN: 'x' }, placeholder)).toThrow(/CHANNEL_ID/);
    });

    it('does not take the token from config.json', () => {
      expect(() => parseConfig({ CHANNEL_ID: CHANNEL }, { token: 'abc.def.ghi' })).toThrow(/TOKEN/);
    });
  });
});

describe('legacyChannelId', () => {
  it('only accepts snowflake-shaped channelID values', () => {
    expect(legacyChannelId({ channelID: CHANNEL })).toBe(CHANNEL);
    expect(legacyChannelId({ channelID: 'CHANNEL ID HERE' })).toBeUndefined();
    expect(legacyChannelId({ channelID: 1234 })).toBeUndefined();
    expect(legacyChannelId(null)).toBeUndefined();
    expect(legacyChannelId('x')).toBeUndefined();
  });
});
