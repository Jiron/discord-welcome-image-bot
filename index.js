const Discord = require('discord.js');
const { Intents } = require('discord.js');
const config = require('./config.json');

const client = new Discord.Client({
  intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MEMBERS, Intents.FLAGS.GUILD_MESSAGES],
});

console.log("Starting...");

client.on('ready', () => {
  console.log("the bot is online!");
});

client.on('guildMemberAdd', (member) => {
    var user = member.user;
    var imageURL = `https://api.discorddevtools.xyz/welcome-image-generator/generate.png?username=${user.username}&discriminator=${user.discriminator}&image=${user.avatarURL()}&usernameColor=fff&discriminatorColor=fff&title=Welcome+to+the+server!&titleColor=a9a9a9&textColor=a9a9a9&borderColor=a9a9a9&background=https://cdn.wallpapersafari.com/97/1/kSG1Bj.jpg`;
    const embed = new Discord.MessageEmbed()
    .setTitle('Welcome!')
    .setImage(imageURL)
    .setColor('BLURPLE');

    client.channels.cache.get(config.channelID).send(`<@${user.id}>`);
    client.channels.cache.get(config.channelID).send({embeds: [embed]});
});

client.login(config.token);