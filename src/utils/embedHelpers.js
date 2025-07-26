const { EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
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

function getSetGrowIdRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('set_growid')
      .setLabel('Set GrowID')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('<:char:1239164095396319252>')
  );
}

module.exports = { getAdminErrorEmbed, replyAdminError, getSetGrowIdRow };