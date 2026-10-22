import { vi } from 'vitest';
import type { Config } from '../src/config.js';
import type { Logger } from '../src/logger.js';
import type { WelcomeChannel, WelcomeMember } from '../src/welcome.js';

export const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

export const baseConfig: Config = {
  token: 'test-token-not-real-0000000000',
  channelId: '123456789012345678',
  template: 'classic',
  apiBase: 'https://api.discorddevtools.xyz',
  title: 'Welcome to the server!',
  text: undefined,
  background: 'https://cdn.example.com/bg.jpg',
  titleColor: 'a9a9a9',
  textColor: 'a9a9a9',
  usernameColor: 'fff',
  borderColor: 'a9a9a9',
  accentColor: undefined,
  showMemberCount: undefined,
  embedTitle: 'Welcome!',
  embedColor: 0x5865f2,
};

export function makeMember(overrides: Partial<WelcomeMember> = {}): WelcomeMember {
  return {
    id: '111111111111111111',
    displayName: 'Ada Lovelace',
    user: { username: 'ada', globalName: 'Ada Lovelace', discriminator: '0' },
    guild: { name: 'Test Server', memberCount: 1234 },
    displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/1/a.png?size=256',
    ...overrides,
  };
}

export function makeLogger(): Logger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

export function makeChannel(): WelcomeChannel & { send: ReturnType<typeof vi.fn> } {
  return { send: vi.fn().mockResolvedValue({}) };
}

export const imageResponse = (): Response =>
  new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
