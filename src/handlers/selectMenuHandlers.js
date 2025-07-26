const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, ModalBuilder, MessageFlags } = require('discord.js');
const { getAllProductsWithStock } = require('../services/productService');
const { isAdmin } = require('../middleware/adminCheck');
const { createClient } = require('@supabase/supabase-js');
const { RED } = require('../colors/discordColors');
const { WORLDLOCK } = require('../emojis/discordEmojis');
const { replyAdminError } = require('../utils/embedHelpers');

const selectMenuHandlers = {};

selectMenuHandlers['buy_product_select'] = async (interaction) => {
  try {
    const productId = interaction.values[0];
    const product = await getAllProductsWithStock().then(products => products.find(p => String(p.id) === productId));
    if (!product) {
      await interaction.reply({ content: 'Product not found.', flags: MessageFlags.Ephemeral });
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId(`buy_quantity_modal_${product.id}`)
      .setTitle(`Buy: ${product.name}`);
    const quantityInput = new TextInputBuilder()
      .setCustomId('quantity')
      .setLabel(`How many would you like to buy? Stock: ${product.stock}`)
      .setStyle(TextInputStyle.Short)
      .setMinLength(1)
      .setMaxLength(6)
      .setRequired(true)
      .setValue('1');
    modal.addComponents(
      new ActionRowBuilder().addComponents(quantityInput)
    );
    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error in buy_product_select:', error);
    await interaction.reply({ content: 'An error occurred while processing your product selection.', flags: MessageFlags.Ephemeral });
  }
};

selectMenuHandlers['view_product_select'] = async (interaction) => {
  if (!isAdmin(interaction.member)) {
    await replyAdminError(interaction, 'You do not have permission to use this command.');
    return;
  }
  const productId = interaction.values[0];
  try {
    const products = await getAllProductsWithStock();
    const product = products.find(p => String(p.id) === productId);
    if (!product) throw new Error('Product not found');
    const embed = new EmbedBuilder()
      .setTitle('Product Details')
      .setColor(RED)
      .addFields([
        { name: 'Name', value: product.name, inline: true },
        { name: 'Code', value: product.code, inline: true },
        { name: 'Price', value: `${product.price} ${WORLDLOCK}`, inline: true },
        { name: 'Stock', value: String(product.stock), inline: true },
        { name: 'Description', value: product.description || 'No description', inline: false }
      ]);
    if (product.image) {
      embed.setThumbnail(product.image);
    }
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('Error fetching product:', error);
    await interaction.reply({ 
      content: 'Failed to fetch product details. Please try again or contact support.', 
      flags: MessageFlags.Ephemeral 
    });
  }
};

selectMenuHandlers['update_product_select'] = async (interaction) => {
  if (!isAdmin(interaction.member)) {
    await replyAdminError(interaction, 'You do not have permission to use this command.');
    return;
  }
  const productId = interaction.values[0];
  try {
    const products = await getAllProductsWithStock();
    const product = products.find(p => String(p.id) === productId);
    if (!product) throw new Error('Product not found');
    const modal = new ModalBuilder()
      .setCustomId(`update_product_modal_${product.id}`)
      .setTitle('Update Product');
    const nameInput = new TextInputBuilder()
      .setCustomId('name')
      .setLabel('Product Name')
      .setStyle(TextInputStyle.Short)
      .setValue(product.name)
      .setRequired(true);
    const codeInput = new TextInputBuilder()
      .setCustomId('code')
      .setLabel('Product Code')
      .setStyle(TextInputStyle.Short)
      .setValue(product.code)
      .setRequired(true);
    const descriptionInput = new TextInputBuilder()
      .setCustomId('description')
      .setLabel('Product Description')
      .setStyle(TextInputStyle.Paragraph)
      .setValue(product.description || '')
      .setRequired(true);
    const priceInput = new TextInputBuilder()
      .setCustomId('price')
      .setLabel('Price (in World Locks)')
      .setStyle(TextInputStyle.Short)
      .setValue(String(product.price))
      .setRequired(true);
    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(codeInput),
      new ActionRowBuilder().addComponents(descriptionInput),
      new ActionRowBuilder().addComponents(priceInput)
    );
    await interaction.showModal(modal);
  } catch (error) {
    console.error('Error fetching product for update:', error);
    await interaction.reply({ 
      content: 'Failed to fetch product details. Please try again or contact support.', 
      flags: MessageFlags.Ephemeral 
    });
  }
};

selectMenuHandlers['delete_product_select'] = async (interaction) => {
  if (!isAdmin(interaction.member)) {
    await replyAdminError(interaction, 'You do not have permission to use this command.');
    return;
  }
  const productId = interaction.values[0];
  try {
    const products = await getAllProductsWithStock();
    const product = products.find(p => String(p.id) === productId);
    if (!product) throw new Error('Product not found');
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId);
    if (error) throw error;
    await interaction.reply({ 
      content: `Product '${product.name}' (Stock: ${product.stock}) has been deleted successfully!`, 
      flags: MessageFlags.Ephemeral 
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    await interaction.reply({ 
      content: 'Failed to delete product. Please try again or contact support.', 
      flags: MessageFlags.Ephemeral 
    });
  }
};

selectMenuHandlers['product_action'] = async (interaction) => {
  if (!isAdmin(interaction.member)) {
    await replyAdminError(interaction, 'You do not have permission to use this command.');
    return;
  }
  const action = interaction.values[0];
  const products = await getAllProductsWithStock();
  switch (action) {
    case 'create': {
      const modal = new ModalBuilder()
        .setCustomId('create_product_modal')
        .setTitle('Create New Product');
      const nameInput = new TextInputBuilder()
        .setCustomId('name')
        .setLabel('Product Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const codeInput = new TextInputBuilder()
        .setCustomId('code')
        .setLabel('Product Code')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      const descriptionInput = new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Product Description')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      const priceInput = new TextInputBuilder()
        .setCustomId('price')
        .setLabel('Price (in World Locks)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(codeInput),
        new ActionRowBuilder().addComponents(descriptionInput),
        new ActionRowBuilder().addComponents(priceInput)
      );
      await interaction.showModal(modal);
      break;
    }
    case 'read': {
      if (!products || products.length === 0) {
        await interaction.reply({ 
          content: 'No products available.', 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('view_product_select')
        .setPlaceholder('Select a product to view')
        .addOptions(
          products.map(p => ({
            label: p.name,
            value: String(p.id),
            description: `Code: ${p.code || p.id}`
          }))
        );
      const row = new ActionRowBuilder().addComponents(selectMenu);
      await interaction.reply({
        content: 'Select a product to view:',
        components: [row],
        flags: MessageFlags.Ephemeral
      });
      break;
    }
    case 'update': {
      if (!products || products.length === 0) {
        await interaction.reply({ 
          content: 'No products available to update.', 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('update_product_select')
        .setPlaceholder('Select a product to update')
        .addOptions(
          products.map(p => ({
            label: `${p.name} (Stock: ${p.stock})`,
            value: String(p.id),
            description: `Code: ${p.code || p.id}`
          }))
        );
      const row = new ActionRowBuilder().addComponents(selectMenu);
      await interaction.reply({
        content: 'Select a product to update:',
        components: [row],
        flags: MessageFlags.Ephemeral
      });
      break;
    }
    case 'delete': {
      if (!products || products.length === 0) {
        await interaction.reply({ 
          content: 'No products available to delete.', 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('delete_product_select')
        .setPlaceholder('Select a product to delete')
        .addOptions(
          products.map(p => ({
            label: p.name,
            value: String(p.id),
            description: `Code: ${p.code || p.id}`
          }))
        );
      const row = new ActionRowBuilder().addComponents(selectMenu);
      await interaction.reply({
        content: '⚠️ **Warning**: This action cannot be undone. Select a product to delete:',
        components: [row],
        flags: MessageFlags.Ephemeral
      });
      break;
    }
  }
};

async function handleSelectMenuInteraction(interaction) {
  const handler = selectMenuHandlers[interaction.customId];
  if (handler) {
    await handler(interaction);
  } else {
    await interaction.reply({ content: 'Unknown menu interaction.', ephemeral: true });
  }
}

module.exports = { selectMenuHandlers, handleSelectMenuInteraction };
