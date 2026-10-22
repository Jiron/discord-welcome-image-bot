import type { Config } from './config.js';

/** The settings of {@link Config} that shape the image. */
export type ImageSettings = Pick<
  Config,
  | 'apiBase'
  | 'template'
  | 'title'
  | 'text'
  | 'background'
  | 'titleColor'
  | 'textColor'
  | 'usernameColor'
  | 'borderColor'
  | 'accentColor'
  | 'showMemberCount'
>;

/** What the URL needs to know about the joining member. */
export interface WelcomeSubject {
  /** Name to show: server nickname, else global display name, else username. */
  displayName: string;
  /** The account handle (`user.username`). */
  username: string;
  /** Legacy four-digit discriminator; `"0"` (or missing) for accounts on the new username system. */
  discriminator?: string | null | undefined;
  avatarUrl: string;
  memberCount?: number | null | undefined;
}

interface NameSource {
  displayName?: string | null | undefined;
  user: { username: string; globalName?: string | null | undefined };
}

/** Same fallback order Discord clients use: nickname/global name, then username. */
export function resolveDisplayName(member: NameSource): string {
  const candidates = [member.displayName, member.user.globalName];
  for (const candidate of candidates) {
    const name = candidate?.trim();
    if (name !== undefined && name !== '') return name;
  }
  return member.user.username;
}

/** Only accounts that still have a legacy discriminator show one. */
export function hasLegacyDiscriminator(
  discriminator: string | null | undefined,
): discriminator is string {
  return (
    discriminator !== null &&
    discriminator !== undefined &&
    discriminator !== '' &&
    !/^0+$/.test(discriminator)
  );
}

/** Templates other than the original layout can show "Member #N". */
export function sendsMemberCount(
  settings: Pick<ImageSettings, 'template' | 'showMemberCount'>,
): boolean {
  return settings.showMemberCount ?? settings.template !== 'classic';
}

/**
 * Builds the `generate.png` URL. Every value goes through URLSearchParams, so names with
 * spaces, `&`, `/`, `#`, quotes or emoji cannot break or inject into the query string.
 */
export function buildWelcomeImageUrl(settings: ImageSettings, subject: WelcomeSubject): string {
  const params = new URLSearchParams();
  params.set('template', settings.template);
  params.set('displayName', subject.displayName);
  params.set('username', subject.username);
  if (hasLegacyDiscriminator(subject.discriminator)) {
    params.set('discriminator', subject.discriminator);
  }
  params.set('image', subject.avatarUrl);
  params.set('title', settings.title);
  if (settings.text !== undefined) params.set('text', settings.text);
  params.set('background', settings.background);
  params.set('titleColor', settings.titleColor);
  params.set('textColor', settings.textColor);
  params.set('usernameColor', settings.usernameColor);
  params.set('discriminatorColor', settings.usernameColor);
  params.set('borderColor', settings.borderColor);
  if (settings.accentColor !== undefined) params.set('accentColor', settings.accentColor);
  if (
    sendsMemberCount(settings) &&
    typeof subject.memberCount === 'number' &&
    Number.isInteger(subject.memberCount) &&
    subject.memberCount > 0
  ) {
    params.set('memberCount', String(subject.memberCount));
  }
  return `${settings.apiBase}/welcome-image-generator/generate.png?${params.toString()}`;
}
