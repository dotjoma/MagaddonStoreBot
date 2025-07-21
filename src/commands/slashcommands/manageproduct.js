const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { isAdmin } = require('../../middleware/adminCheck');
const { RED } = require('../../colors/discordColors');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('manageproduct')
    .setDescription('Manage products (Create, Read, Update, Delete)'),

  async execute(interaction) {
    // Check if user is admin
    if (!isAdmin(interaction.member)) {
      await interaction.reply({ 
        content: 'You do not have permission to use this command.', 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('product_action')
          .setPlaceholder('Select an action')
          .addOptions([
            {
              label: 'Create Product',
              description: 'Add a new product to the store',
              value: 'create',
              emoji: '➕'
            },
            {
              label: 'View Product',
              description: 'View details of an existing product',
              value: 'read',
              emoji: '👁️'
            },
            {
              label: 'Update Product',
              description: 'Modify an existing product',
              value: 'update',
              emoji: '📝'
            },
            {
              label: 'Delete Product',
              description: 'Remove a product from the store',
              value: 'delete',
              emoji: '🗑️'
            }
          ])
      );

    const embed = new EmbedBuilder()
      .setTitle('Product Management')
      .setDescription('Select an action to manage products')
      .setColor(RED)
      .addFields(
        { name: 'Create Product', value: 'Add a new product to the store', inline: true },
        { name: 'View Product', value: 'View details of an existing product', inline: true },
        { name: 'Update Product', value: 'Modify an existing product', inline: true },
        { name: 'Delete Product', value: 'Remove a product from the store', inline: true }
      );

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
  }
}; 