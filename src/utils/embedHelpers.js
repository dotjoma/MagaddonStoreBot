const { EmbedBuilder, MessageFlags } = require('discord.js');
const { RED } = require('../colors/discordColors');

function getAdminErrorEmbed() {
  return new EmbedBuilder()
    .setTitle('🚫 Access Denied')
    .setDescription('You do not have permission to use this command.')
    .setColor(RED)
    .setTimestamp();
}

async function replyAdminError(interaction) {
  const errorEmbed = getAdminErrorEmbed();
  await interaction.reply({
    embeds: [errorEmbed],
    flags: MessageFlags.Ephemeral
  });
}

module.exports = { getAdminErrorEmbed, replyAdminError };