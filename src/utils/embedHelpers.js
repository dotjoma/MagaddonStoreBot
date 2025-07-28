const { EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { RED } = require('../colors/discordColors');
const { ALERT, REDARROW } = require('../emojis/discordEmojis');

function getAdminErrorEmbed(interaction) {
  return new EmbedBuilder()
    .setTitle(`${ALERT} Access Denied`)
    .setDescription(`${REDARROW} You do not have permission to use this command.`)
    .setColor(RED)
    .setFooter({
      text: 'Magaddon Store • Access Denied',
      iconURL: interaction.guild.iconURL()
    })
    .setTimestamp();
}

async function replyAdminError(interaction) {
  const errorEmbed = getAdminErrorEmbed(interaction);
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