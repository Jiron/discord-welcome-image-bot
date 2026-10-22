import { describe, expect, it } from 'vitest';
import {
  buildWelcomeImageUrl,
  hasLegacyDiscriminator,
  resolveDisplayName,
  type WelcomeSubject,
} from '../src/welcome-url.js';
import { baseConfig } from './helpers.js';

const subject: WelcomeSubject = {
  displayName: 'Ada Lovelace',
  username: 'ada',
  discriminator: '0',
  avatarUrl: 'https://cdn.discordapp.com/avatars/1/a.png?size=256',
  memberCount: 1234,
};

function query(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe('buildWelcomeImageUrl', () => {
  it('points at the generator on the configured API base', () => {
    const url = new URL(buildWelcomeImageUrl(baseConfig, subject));
    expect(url.origin).toBe('https://api.discorddevtools.xyz');
    expect(url.pathname).toBe('/welcome-image-generator/generate.png');
  });

  it('keeps the original look: same colors, title and no extra text', () => {
    const q = query(buildWelcomeImageUrl(baseConfig, subject));
    expect(q.get('title')).toBe('Welcome to the server!');
    expect(q.get('titleColor')).toBe('a9a9a9');
    expect(q.get('textColor')).toBe('a9a9a9');
    expect(q.get('usernameColor')).toBe('fff');
    expect(q.get('borderColor')).toBe('a9a9a9');
    expect(q.get('background')).toBe('https://cdn.example.com/bg.jpg');
    expect(q.get('template')).toBe('classic');
    expect(q.has('text')).toBe(false);
  });

  it('does not send a discriminator for the new username system', () => {
    expect(query(buildWelcomeImageUrl(baseConfig, subject)).has('discriminator')).toBe(false);
    expect(
      query(buildWelcomeImageUrl(baseConfig, { ...subject, discriminator: undefined })).has(
        'discriminator',
      ),
    ).toBe(false);
  });

  it('sends the discriminator of legacy accounts', () => {
    const q = query(buildWelcomeImageUrl(baseConfig, { ...subject, discriminator: '1337' }));
    expect(q.get('discriminator')).toBe('1337');
  });

  it('round-trips special characters through the query string', () => {
    const nasty = 'a b&c=d/e?f#g+h%i "quote" \'single\' <b>&amp;\\';
    const url = buildWelcomeImageUrl(baseConfig, {
      ...subject,
      displayName: nasty,
      username: nasty,
    });
    const q = query(url);
    expect(q.get('displayName')).toBe(nasty);
    expect(q.get('username')).toBe(nasty);
    // Nothing leaked out as a separate parameter or fragment.
    expect(new URL(url).hash).toBe('');
    expect(q.has('c')).toBe(false);
    expect(q.has('amp;')).toBe(false);
  });

  it('round-trips emoji, CJK and combining characters', () => {
    const name = '🎉 Zoë 山田太郎 👨‍👩‍👧';
    const q = query(buildWelcomeImageUrl(baseConfig, { ...subject, displayName: name }));
    expect(q.get('displayName')).toBe(name);
  });

  it('encodes the avatar URL so its own query cannot leak out', () => {
    const q = query(buildWelcomeImageUrl(baseConfig, subject));
    expect(q.get('image')).toBe('https://cdn.discordapp.com/avatars/1/a.png?size=256');
    expect(q.has('size')).toBe(false);
  });

  it('encodes every parameter when everything is set', () => {
    const q = query(
      buildWelcomeImageUrl(
        {
          ...baseConfig,
          template: 'banner',
          text: 'Have fun & be kind!',
          accentColor: 'ff8800',
        },
        { ...subject, discriminator: '0420' },
      ),
    );
    expect(Object.fromEntries(q)).toEqual({
      template: 'banner',
      displayName: 'Ada Lovelace',
      username: 'ada',
      discriminator: '0420',
      image: 'https://cdn.discordapp.com/avatars/1/a.png?size=256',
      title: 'Welcome to the server!',
      text: 'Have fun & be kind!',
      background: 'https://cdn.example.com/bg.jpg',
      titleColor: 'a9a9a9',
      textColor: 'a9a9a9',
      usernameColor: 'fff',
      discriminatorColor: 'fff',
      borderColor: 'a9a9a9',
      accentColor: 'ff8800',
      memberCount: '1234',
    });
  });

  describe('memberCount', () => {
    it('is left out for the classic template by default', () => {
      expect(query(buildWelcomeImageUrl(baseConfig, subject)).has('memberCount')).toBe(false);
    });

    it('is sent for other templates by default', () => {
      const q = query(buildWelcomeImageUrl({ ...baseConfig, template: 'card' }, subject));
      expect(q.get('memberCount')).toBe('1234');
    });

    it('can be forced on or off', () => {
      const forcedOn = buildWelcomeImageUrl({ ...baseConfig, showMemberCount: true }, subject);
      expect(query(forcedOn).get('memberCount')).toBe('1234');
      const forcedOff = buildWelcomeImageUrl(
        { ...baseConfig, template: 'card', showMemberCount: false },
        subject,
      );
      expect(query(forcedOff).has('memberCount')).toBe(false);
    });

    it('is left out when the count is unknown or implausible', () => {
      const config = { ...baseConfig, template: 'card' };
      for (const memberCount of [undefined, null, 0, -3, 1.5, Number.NaN]) {
        const url = buildWelcomeImageUrl(config, { ...subject, memberCount });
        expect(query(url).has('memberCount')).toBe(false);
      }
    });
  });
});

describe('hasLegacyDiscriminator', () => {
  it.each([
    ['0', false],
    ['0000', false],
    ['', false],
    [undefined, false],
    [null, false],
    ['0001', true],
    ['1337', true],
  ])('%j -> %j', (value, expected) => {
    expect(hasLegacyDiscriminator(value)).toBe(expected);
  });
});

describe('resolveDisplayName', () => {
  it('prefers the member display name, then the global name, then the username', () => {
    expect(
      resolveDisplayName({ displayName: 'Nick', user: { username: 'u', globalName: 'G' } }),
    ).toBe('Nick');
    expect(resolveDisplayName({ displayName: '', user: { username: 'u', globalName: 'G' } })).toBe(
      'G',
    );
    expect(
      resolveDisplayName({ displayName: '  ', user: { username: 'u', globalName: null } }),
    ).toBe('u');
    expect(resolveDisplayName({ user: { username: 'u' } })).toBe('u');
  });
});
