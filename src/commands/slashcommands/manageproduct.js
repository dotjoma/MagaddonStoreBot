const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { isAdmin } = require('../../middleware/adminCheck');
const { isAuthorizedUser } = require('../../middleware/authorizedUser');
const { getTotalProducts, getActiveListings, getRevenueToday } = require('../../services/productService');
const { RED } = require('../../colors/discordColors');
const { replyAdminError } = require('../../utils/embedHelpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('manageproduct')
    .setDescription('Manage products (Create, Read, Update, Delete)'),

  async execute(interaction) {
    // Check if user is admin
    if (!(isAdmin(interaction.member) && isAuthorizedUser(interaction.user.id))) {
      await replyAdminError(interaction);
      return;
    }

    let totalProducts = 'Loading...';
    let activeListings = 'Loading...';
    let revenueToday = 'Loading...';
    try {
      const [tp, al, rt] = await Promise.all([
        getTotalProducts(),
        getActiveListings(),
        getRevenueToday()
      ]);
      totalProducts = tp;
      activeListings = al;
      revenueToday = `${rt} WL`;
    } catch (err) {
      console.error('Error fetching manageproduct stats:', err);
    }

    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('product_action')
          .setPlaceholder('🛍️ Choose a product action')
          .addOptions([
            {
              label: 'Create Product',
              description: 'Add a new item to your shop inventory',
              value: 'create',
              emoji: '✨'
            },
            {
              label: 'View Product',
              description: 'Browse and inspect existing products',
              value: 'read',
              emoji: '🔍'
            },
            {
              label: 'Update Product',
              description: 'Edit details of existing products',
              value: 'update',
              emoji: '⚡'
            },
            {
              label: 'Delete Product',
              description: 'Remove products from your inventory',
              value: 'delete',
              emoji: '💥'
            }
          ])
      );

    const embed = new EmbedBuilder()
      .setTitle('Product Management Dashboard')
      .setDescription('Welcome to your shop management center! Select an action below to manage your product inventory.')
      .setColor(RED)
      .setThumbnail('https://cdn.discordapp.com/attachments/1234567890/shop-icon.png') // Add your shop icon URL here
      .addFields(
        { 
          name: '✨ Create Product', 
          value: '`Add new items to expand your inventory`', 
          inline: true 
        },
        { 
          name: '🔍 View Product', 
          value: '`Browse and inspect current stock`', 
          inline: true 
        },
        { 
          name: '⚡ Update Product', 
          value: '`Modify pricing, descriptions & more`', 
          inline: true 
        },
        { 
          name: '💥 Delete Product', 
          value: '`Remove items from your store`', 
          inline: true 
        },
        {
          name: '\u200b',
          value: '\u200b',
          inline: false
        },
        {
          name: 'Quick Stats',
          value: `\`\`\`yml\nTotal Products: ${totalProducts}\nActive Listings: ${activeListings}\nRevenue Today: ${revenueToday}\`\`\``,
          inline: false
        }
      )
      .setFooter({ 
        text: `Requested by ${interaction.user.username} • Shop Management System`, 
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
      })
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      components: [row],
      ephemeral: true
    });
  }
};