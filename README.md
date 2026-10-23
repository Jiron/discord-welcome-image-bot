# discord-welcome-image-bot

An example Discord bot that greets every new member with a generated welcome image. It shows how to use the
[DiscordDevTools welcome image API](https://www.discorddevtools.xyz) from a bot: build a URL, download the
image, post it as an attachment.

TypeScript (strict, ESM), discord.js v14, Node 22 or newer.

## How it works

1. A member joins (`guildMemberAdd`).
2. The bot builds a `generate.png` URL with the member's display name, username and avatar.
3. It downloads the PNG (15 s timeout, one retry on `429`/`5xx`, honouring `Retry-After`).
4. It posts a message with a mention and an embed that shows the image, sent as the file `welcome.png`.
5. If the API cannot be reached, the member still gets a plain text welcome.

Because the bot uploads the file itself, it does not depend on Discord's image proxy fetching the API in time.

## Setup

1. **Create the bot.** In the [Developer Portal](https://discord.com/developers/applications) create an application, open
   **Bot** and copy the token (Reset Token).
2. **Enable the intent.** On the same page, under **Privileged Gateway Intents**, switch on **Server Members Intent**.
   The bot asks for the `Guilds` and `GuildMembers` intents only. It does not read messages, so the Message Content intent
   stays off.
3. **Invite it.** In **OAuth2 > URL Generator** pick the `bot` scope and the permissions **View Channels**,
   **Send Messages**, **Embed Links** and **Attach Files**.
4. **Configure it.** Copy `.env.example` to `.env`, then set `TOKEN` and `CHANNEL_ID` (Developer Mode > right-click the
   channel > Copy Channel ID).
5. **Run it:**

```sh
npm ci
npm run build
npm start
```

For development use `npm run dev`, which restarts on every change.

At start the bot logs whether the welcome channel exists and whether it may post there. Joins on other servers the bot
is in are ignored.

## Configuration

Settings come from environment variables. A `.env` file in the project folder is loaded automatically; real
environment variables win over it. Colors are hex without the `#`.

| Variable            | Required | Default                           | Purpose                                                 |
| ------------------- | -------- | --------------------------------- | ------------------------------------------------------- |
| `TOKEN`             | yes      |                                   | Bot token                                               |
| `CHANNEL_ID`        | yes      |                                   | Channel that receives the welcomes                      |
| `TEMPLATE`          | no       | `classic`                         | Image template, see below                               |
| `API_BASE`          | no       | `https://api.discorddevtools.xyz` | API address, for example when you host your own         |
| `TITLE`             | no       | `Welcome to the server!`          | First line on the image                                 |
| `TEXT`              | no       | the template's own text           | Message line on the image                               |
| `BACKGROUND`        | no       | the original wallpaper            | Background image URL                                    |
| `TITLE_COLOR`       | no       | `a9a9a9`                          | Title color                                             |
| `TEXT_COLOR`        | no       | `a9a9a9`                          | Message color                                           |
| `USERNAME_COLOR`    | no       | `fff`                             | Name color                                              |
| `BORDER_COLOR`      | no       | `a9a9a9`                          | Avatar border color                                     |
| `ACCENT_COLOR`      | no       | the template's own                | Accent color of templates that have one                 |
| `SHOW_MEMBER_COUNT` | no       | on, except for `classic`          | Send the member count ("Member #1,234") to the template |
| `EMBED_TITLE`       | no       | `Welcome!`                        | Title of the embed that holds the image                 |
| `EMBED_COLOR`       | no       | `5865f2`                          | Color stripe of the embed                               |

Invalid values stop the bot at start with a message that names the setting (never its value).

### Upgrading from the old bot

Earlier versions kept the token and channel in `config.json`. If `CHANNEL_ID` is not set, the bot still reads `channelID`
from `config.json`, so an existing `.env` that only holds `TOKEN` keeps working (it logs a warning). The token is only
read from `TOKEN`.

## Templates

`TEMPLATE` picks the layout: `classic` (the original), `centered`, `card`, `banner`, `minimal` or `split`. The
API lists every template with its parameters and defaults at
[`/welcome-image-generator/templates`](https://api.discorddevtools.xyz/welcome-image-generator/templates), and the
website has a live playground. Unknown templates fall back to `classic`, and invalid parameter values fall back to their
defaults, so a typo never breaks the embed.

## The core of it

The whole idea is a URL. This is `src/welcome-url.ts` in short:

```ts
const params = new URLSearchParams({
  template: 'classic',
  displayName: member.displayName, // nickname, else global name, else username
  username: member.user.username,
  image: member.displayAvatarURL({ extension: 'png', size: 256 }),
  title: 'Welcome to the server!',
});
// Legacy accounts only; accounts on the new username system have discriminator "0".
if (member.user.discriminator !== '0') params.set('discriminator', member.user.discriminator);

const url = `https://api.discorddevtools.xyz/welcome-image-generator/generate.png?${params}`;
```

Always build the query with `URLSearchParams` (or your language's equivalent). Names can contain `&`, `#`, spaces
and emoji, and pasting them into a string breaks the URL. Then download the image and attach it
(`src/welcome.ts`):

```ts
const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
const image = Buffer.from(await response.arrayBuffer());

await channel.send({
  content: `<@${member.id}>`,
  embeds: [{ title: 'Welcome!', image: { url: 'attachment://welcome.png' } }],
  files: [new AttachmentBuilder(image, { name: 'welcome.png' })],
});
```

### The same in discord.py

```python
import io
from urllib.parse import urlencode

import aiohttp
import discord

@bot.event
async def on_member_join(member: discord.Member):
    query = {"template": "classic", "displayName": member.display_name, "username": member.name,
             "image": member.display_avatar.replace(size=256, format="png").url,
             "title": "Welcome to the server!"}
    if getattr(member, "discriminator", "0") != "0":
        query["discriminator"] = member.discriminator
    url = "https://api.discorddevtools.xyz/welcome-image-generator/generate.png?" + urlencode(query)
    async with aiohttp.ClientSession() as session, session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as r:
        r.raise_for_status()
        image = discord.File(io.BytesIO(await r.read()), filename="welcome.png")
    embed = discord.Embed(title="Welcome!", color=0x5865F2).set_image(url="attachment://welcome.png")
    await member.guild.system_channel.send(member.mention, embed=embed, file=image)
```

You need `intents.members = True` for `on_member_join`.

## Project layout

```
index.js                 PM2 entry point: imports dist/index.js
src/index.ts             wiring: config, client, events, graceful shutdown
src/config.ts            zod-validated environment, config.json fallback
src/welcome-url.ts       pure: builds the API URL
src/welcome-message.ts   pure: builds the message and embed
src/image-client.ts      fetch with timeout, retry and Retry-After
src/welcome.ts           the send flow (image, or text fallback)
src/channel.ts           channel and permission checks
src/logger.ts            JSON logs, secrets redacted
test/                    Vitest tests (no Discord connection needed)
```

## Scripts

| Script                 | Does                        |
| ---------------------- | --------------------------- |
| `npm run build`        | Compile `src/` to `dist/`   |
| `npm start`            | Run the compiled bot        |
| `npm run dev`          | Run from source and reload  |
| `npm run typecheck`    | Type-check source and tests |
| `npm run lint`         | ESLint                      |
| `npm run format`       | Prettier                    |
| `npm run format:check` | Prettier, check only        |
| `npm test`             | Vitest                      |

## Deploy

The bot is a single long-running Node process (Node 22 or newer; CI and the live machine use Node 24). It needs the
build: `index.js` in the repository root only contains `import './dist/index.js';`.

On the DiscordDevTools machine PM2 runs it from `C:\Code\ecosystem.config.js` (app `discord-welcome-image-bot`, `cwd` =
this folder, script `index.js`, `shutdown_with_message: true`); `StartEdno.bat` starts it through the same file.
Deploying an update:

```sh
git pull --ff-only
npm ci
npm run build          # index.js fails to start without dist/
pm2 restart discord-welcome-image-bot
pm2 save
```

`.env` (token and channel) stays on the machine and is not in git. On another host, point any process manager at
`index.js`, for example:

```js
{ name: 'discord-welcome-image-bot', cwd: '/path/to/bot', script: 'index.js', shutdown_with_message: true }
```

The bot exits cleanly on `SIGINT`, `SIGTERM` and PM2's `shutdown` message (set `shutdown_with_message: true` on Windows,
where signals cannot be delivered). Logs are one JSON object per line on stdout (info) and stderr (warnings and errors),
and never contain the token. Unhandled promise rejections are logged, not fatal.

## Tests and CI

`npm test` runs Vitest: config parsing and the `config.json` fallback, URL building, the message and embed, the image
download with its retry and `Retry-After` handling, the text fallback, and the channel and permission checks. It needs
no network and no Discord connection.

`.github/workflows/ci.yml` runs on every push to `main` and on pull requests, on Ubuntu with Node 24: `npm ci`,
`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`.

## License

MIT
