const { SlashCommandBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const { isAdmin } = require('../../middleware/adminCheck');
const { isAuthorizedUser } = require('../../middleware/authorizedUser');
const { replyAdminError } = require('../../utils/embedHelpers');
const { WHITECROWN } = require('../../emojis/discordEmojis');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setdepo')
    .setDescription('Set depo world, owner, and bot name (admin only)'),
  async execute(interaction) {
    if (!(isAdmin(interaction.member) && isAuthorizedUser(interaction.user.id))) {
      await replyAdminError(interaction);
      return;
    }
    // Show modal for input
    const modal = new ModalBuilder()
      .setCustomId('setdepo_modal')
      .setTitle(`${WHITECROWN} Set Depo Information ${WHITECROWN}`);
    const worldInput = new TextInputBuilder()
      .setCustomId('world')
      .setLabel('Depo World Name')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    const ownerInput = new TextInputBuilder()
      .setCustomId('owner')
      .setLabel('Owner Name')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    const botInput = new TextInputBuilder()
      .setCustomId('bot')
      .setLabel('Bot Name')
      .setStyle(TextInputStyle.Short)
      .setRequired(true);
    modal.addComponents(
      new ActionRowBuilder().addComponents(worldInput),
      new ActionRowBuilder().addComponents(ownerInput),
      new ActionRowBuilder().addComponents(botInput)
    );
    await interaction.showModal(modal);
  },
}; 