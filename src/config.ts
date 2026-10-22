import { z } from 'zod';

/** Default background of the original bot, so the default look does not change. */
export const DEFAULT_BACKGROUND = 'https://cdn.wallpapersafari.com/97/1/kSG1Bj.jpg';

const snowflake = z.string().regex(/^\d{17,20}$/, 'must be a Discord ID (17-20 digits)');

/** Hex color with or without a leading "#", normalised to the API's form (no "#"). */
const hexColor = z
  .string()
  .regex(/^#?(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i, 'must be a hex color')
  .transform((value) => value.replace(/^#/, '').toLowerCase());

/** An empty value in .env ("KEY=") means "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional());

const withDefault = <O>(schema: z.ZodType<O>, fallback: O) =>
  z
    .preprocess((value) => (value === '' ? undefined : value), schema.optional())
    .transform((value) => value ?? fallback);

const embedColor = z
  .string()
  .regex(/^#?[0-9a-f]{6}$/i, 'must be a 6-digit hex color')
  .transform((value) => value.replace(/^#/, '').toLowerCase());

const envSchema = z.object({
  TOKEN: z.string().min(1, 'is required'),
  CHANNEL_ID: snowflake,
  TEMPLATE: withDefault(
    z.string().regex(/^[a-z0-9_-]{1,32}$/i, 'must be a template id'),
    'classic',
  ),
  API_BASE: withDefault(
    z.url({ protocol: /^https?$/ }).transform((value) => value.replace(/\/+$/, '')),
    'https://api.discorddevtools.xyz',
  ),
  TITLE: withDefault(z.string().max(100), 'Welcome to the server!'),
  TEXT: optional(z.string().max(300)),
  BACKGROUND: withDefault(z.url({ protocol: /^https?$/ }), DEFAULT_BACKGROUND),
  TITLE_COLOR: withDefault(hexColor, 'a9a9a9'),
  TEXT_COLOR: withDefault(hexColor, 'a9a9a9'),
  USERNAME_COLOR: withDefault(hexColor, 'fff'),
  BORDER_COLOR: withDefault(hexColor, 'a9a9a9'),
  ACCENT_COLOR: optional(hexColor),
  SHOW_MEMBER_COUNT: optional(z.stringbool()),
  EMBED_TITLE: withDefault(z.string().max(256), 'Welcome!'),
  EMBED_COLOR: withDefault(embedColor, '5865f2'),
});

export interface Config {
  token: string;
  channelId: string;
  template: string;
  apiBase: string;
  title: string;
  text: string | undefined;
  background: string;
  titleColor: string;
  textColor: string;
  usernameColor: string;
  borderColor: string;
  accentColor: string | undefined;
  /** `undefined` means "automatic": on for every template except `classic`. */
  showMemberCount: boolean | undefined;
  embedTitle: string;
  embedColor: number;
}

export interface LoadedConfig {
  config: Config;
  /** Human-readable notes about deprecated setup (for example the config.json fallback). */
  warnings: string[];
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** The channel ID the pre-2.0 bot kept in config.json, or undefined if it is missing or a placeholder. */
export function legacyChannelId(legacyConfig: unknown): string | undefined {
  if (typeof legacyConfig !== 'object' || legacyConfig === null) return undefined;
  const value = (legacyConfig as Record<string, unknown>).channelID;
  return snowflake.safeParse(value).success ? (value as string) : undefined;
}

/**
 * Validates the environment.
 *
 * Migration fallback: when CHANNEL_ID is not set, the `channelID` of the old config.json is used,
 * so a deployment that only has TOKEN in .env keeps working.
 */
export function parseConfig(
  env: Record<string, string | undefined>,
  legacyConfig?: unknown,
): LoadedConfig {
  const warnings: string[] = [];
  const input: Record<string, string | undefined> = { ...env };

  if (input.CHANNEL_ID === undefined || input.CHANNEL_ID === '') {
    const legacy = legacyChannelId(legacyConfig);
    if (legacy !== undefined) {
      input.CHANNEL_ID = legacy;
      warnings.push(
        'CHANNEL_ID is not set; using channelID from config.json. Please set CHANNEL_ID in .env.',
      );
    }
  }

  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `${issue.path.join('.') || 'env'} ${issue.message}`,
    );
    throw new ConfigError(`Invalid configuration: ${problems.join('; ')}`);
  }

  const env2 = parsed.data;
  return {
    warnings,
    config: {
      token: env2.TOKEN,
      channelId: env2.CHANNEL_ID,
      template: env2.TEMPLATE.toLowerCase(),
      apiBase: env2.API_BASE,
      title: env2.TITLE,
      text: env2.TEXT,
      background: env2.BACKGROUND,
      titleColor: env2.TITLE_COLOR,
      textColor: env2.TEXT_COLOR,
      usernameColor: env2.USERNAME_COLOR,
      borderColor: env2.BORDER_COLOR,
      accentColor: env2.ACCENT_COLOR,
      showMemberCount: env2.SHOW_MEMBER_COUNT,
      embedTitle: env2.EMBED_TITLE,
      embedColor: Number.parseInt(env2.EMBED_COLOR, 16),
    },
  };
}
