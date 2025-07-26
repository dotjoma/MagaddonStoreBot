const { EmbedBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, MessageFlags } = require('discord.js');
const { v5: uuidv5, v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const { getAllProductsWithStock, getTotalProducts, getActiveListings, getRevenueToday } = require('../services/productService');
const { getUserBalance, getUserWithRoleAndCreatedAt, deductWorldLocksAndAddSpent } = require('../services/userService');
const { getAvailableInventoryItems, markInventoryItemsAsSold } = require('../services/inventoryService');
const { setWorldName, setOwnerName, setBotName } = require('../services/configService');
const { isAdmin } = require('../middleware/adminCheck');
const { RED } = require('../colors/discordColors');
const { WORLDLOCK } = require('../emojis/discordEmojis');
const { getSetGrowIdRow, replyAdminError } = require('../utils/embedHelpers');
const DISCORD_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';

const modalHandlers = {};

modalHandlers['set_growid_modal'] = async (interaction) => {
  const discordId = interaction.user.id;
  const uuidId = uuidv5(String(discordId), DISCORD_NAMESPACE);
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
  const growid = interaction.fields.getTextInputValue('growid');
  const email = interaction.fields.getTextInputValue('email');
  try {
    // Check if user exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', uuidId)
      .single();
    if (!existingUser) {
      // Create new user
      const { error: createError } = await supabase
        .from('users')
        .insert([{ id: uuidId, growid, email, username: interaction.user.username }]);
      if (createError) throw createError;
    } else {
      // Update GrowID and email
      const { error: updateError } = await supabase
        .from('users')
        .update({ growid, email })
        .eq('id', uuidId);
      if (updateError) throw updateError;
    }
    const embed = new EmbedBuilder()
      .setTitle('✅ GrowID Set')
      .setDescription(`Your GrowID has been set to **${growid}**${email ? `\nEmail: **${email}**` : ''}`)
      .setColor(RED)
      .setFooter({
        text: 'Magaddon Store • Registration',
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('Error setting GrowID:', error);
    await interaction.reply({ content: 'Failed to set GrowID. Please try again or contact support.', flags: MessageFlags.Ephemeral });
  }
};

modalHandlers['setdepo_modal'] = async (interaction) => {
  if (!isAdmin(interaction.member)) {
    await replyAdminError(interaction);
    return;
  }
  const world = interaction.fields.getTextInputValue('world');
  const owner = interaction.fields.getTextInputValue('owner');
  const bot = interaction.fields.getTextInputValue('bot');
  try {
    await setWorldName(world);
    await setOwnerName(owner);
    await setBotName(bot);
    const embed = new EmbedBuilder()
      .setTitle('Depo Info Updated!')
      .setDescription(
        `**World:** ${world}\n` +
        `**Owner:** ${owner}\n` +
        `**Bot:** ${bot}`
      )
      .setColor(RED);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch (error) {
    await interaction.reply({ content: 'Failed to update depo info.', flags: MessageFlags.Ephemeral });
  }
};

modalHandlers['create_product_modal'] = async (interaction) => {
  if (!isAdmin(interaction.member)) {
    await replyAdminError(interaction);
    return;
  }
  const name = interaction.fields.getTextInputValue('name');
  const code = interaction.fields.getTextInputValue('code');
  const description = interaction.fields.getTextInputValue('description');
  const price = parseInt(interaction.fields.getTextInputValue('price'), 10);
  if (isNaN(price) || price < 0) {
    await interaction.reply({ content: 'Invalid price. Please enter a valid number.', flags: MessageFlags.Ephemeral });
    return;
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
  try {
    const { data: product, error } = await supabase
      .from('products')
      .insert([{ name, code, description, price }])
      .select()
      .single();
    if (error) throw error;
    const embed = new EmbedBuilder()
      .setTitle('🎉 Product Created')
      .setDescription('• A new product has been added successfully!')
      .setColor(RED)
      .setThumbnail('https://cdn-icons-png.flaticon.com/512/3081/3081559.png')
      .addFields([
        { name: 'Name', value: ` ${name}`, inline: true },
        { name: 'Code', value: ` ${code}`, inline: true },
        { name: 'Price', value: ` ${price} ${WORLDLOCK}`, inline: true },
        { name: 'Description', value: description, inline: false }
      ])
      .setFooter({
        text: 'Magaddon Store • Product Management',
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('Error creating product:', error);
    await interaction.reply({ content: 'Failed to create product. Please try again or contact support.', flags: MessageFlags.Ephemeral });
  }
};

modalHandlers['update_product_modal_'] = async (interaction) => {
  if (!isAdmin(interaction.member)) {
    await replyAdminError(interaction);
    return;
  }
  const productId = interaction.customId.split('_').pop();
  const name = interaction.fields.getTextInputValue('name');
  const code = interaction.fields.getTextInputValue('code');
  const description = interaction.fields.getTextInputValue('description');
  const price = parseInt(interaction.fields.getTextInputValue('price'), 10);
  if (isNaN(price) || price < 0) {
    await interaction.reply({ content: 'Invalid price. Please enter a valid number.', flags: MessageFlags.Ephemeral });
    return;
  }
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
  try {
    const { data: product, error } = await supabase
      .from('products')
      .update({ name, code, description, price })
      .eq('id', productId)
      .select()
      .single();
    if (error) throw error;
    const embed = new EmbedBuilder()
      .setTitle('Product Updated')
      .setDescription('Product has been updated successfully!')
      .setColor(RED)
      .addFields([
        { name: 'Name', value: name, inline: true },
        { name: 'Code', value: code, inline: true },
        { name: 'Price', value: `${price} WL`, inline: true },
        { name: 'Description', value: description }
      ]);
    if (product.image) {
      embed.setThumbnail(product.image);
    }
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('Error updating product:', error);
    await interaction.reply({ content: 'Failed to update product. Please try again or contact support.', flags: MessageFlags.Ephemeral });
  }
};

modalHandlers['buy_quantity_modal_'] = async (interaction) => {
  try {
    const productId = interaction.customId.replace('buy_quantity_modal_', '');
    const quantityStr = interaction.fields.getTextInputValue('quantity');
    const quantity = parseInt(quantityStr, 10);
    if (isNaN(quantity) || quantity < 1 || quantity > 999999) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'Invalid quantity. Please enter a number between 1 and 999999.', flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: 'Invalid quantity. Please enter a number between 1 and 999999.', flags: MessageFlags.Ephemeral });
      }
      return;
    }
    const [products, user] = await Promise.all([
      getAllProductsWithStock(),
      getUserBalance(interaction.user.id)
    ]);
    const product = products.find(p => String(p.id) === productId);
    if (!product) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'Product not found.', flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: 'Product not found.', flags: MessageFlags.Ephemeral });
      }
      return;
    }
    if (quantity > product.stock) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `Not enough stock. Only ${product.stock} available.`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: `Not enough stock. Only ${product.stock} available.`, flags: MessageFlags.Ephemeral });
      }
      return;
    }
    const totalPrice = (product.price || 0) * quantity;
    if ((user.world_lock || 0) < totalPrice) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `You do not have enough World Locks. You need ${totalPrice} WL, but you have ${user.world_lock || 0} WL.`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: `You do not have enough World Locks. You need ${totalPrice} WL, but you have ${user.world_lock || 0} WL.`, flags: MessageFlags.Ephemeral });
      }
      return;
    }
    const inventoryItems = await getAvailableInventoryItems(productId, quantity);
    if (!inventoryItems || inventoryItems.length < quantity) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `Not enough inventory. Only ${inventoryItems.length} available.`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: `Not enough inventory. Only ${inventoryItems.length} available.`, flags: MessageFlags.Ephemeral });
      }
      return;
    }
    // Prepare DM content as a txt file
    const now = Date.now();
    const safeProductName = product.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `purchased_from_MagaddonStore_${safeProductName}_${now}.txt`;
    const fileContent = inventoryItems.map(item => item.data || 'No details').join('\n');
    const file = Buffer.from(fileContent, 'utf-8');
    const attachment = new AttachmentBuilder(file, { name: filename });
    try {
      await interaction.user.send({
        content: `Thank you for your purchase! Here are your items for ${product.name}:`,
        files: [attachment]
      });
    } catch (err) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: 'Failed to send you a DM. Please make sure your DMs are open and try again. No World Locks were deducted.', flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: 'Failed to send you a DM. Please make sure your DMs are open and try again. No World Locks were deducted.', flags: MessageFlags.Ephemeral });
      }
      return;
    }
    const ids = inventoryItems.map(item => item.id);
    await markInventoryItemsAsSold(ids);
    await deductWorldLocksAndAddSpent(interaction.user.id, totalPrice);
    // Insert order into database
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const orderNumber = `ORD-${now}-${uuidv4().slice(0, 10)}`;
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert([{
        user_id: uuidv5(String(interaction.user.id), DISCORD_NAMESPACE),
        product_id: product.id,
        inventory_id: inventoryItems[0]?.id || null,
        order_number: orderNumber,
        quantity,
        unit_price: product.price,
        total_amount: totalPrice,
        status: 'completed',
        payment_method: 'world_lock',
        notes: `Inventory data sent: ${fileContent}`
      }])
      .select()
      .single();
    if (orderError) {
      const errMsg = orderError.message || orderError.details || JSON.stringify(orderError);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `Order error: ${errMsg.slice(0, 300)}`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: `Order error: ${errMsg.slice(0, 300)}`, flags: MessageFlags.Ephemeral });
      }
      return;
    }
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: `Purchase successful! You bought ${quantity}x ${product.name} for ${totalPrice} WL. Check your DMs for your items.`, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: `Purchase successful! You bought ${quantity}x ${product.name} for ${totalPrice} WL. Check your DMs for your items.`, flags: MessageFlags.Ephemeral });
    }
    // Send purchase log to PURCHASE_HISTORY_CHANNEL
    const purchaseHistoryChannelId = process.env.PURCHASE_HISTORY_CHANNEL;
    const purchaseHistoryChannel = interaction.client.channels.cache.get(purchaseHistoryChannelId);
    const realOrderNumber = order ? order.order_number : orderNumber;
    const purchaseEmbed = new EmbedBuilder()
      .setTitle(`#Order Number: ${realOrderNumber}`)
      .setColor(RED)
      .addFields(
        { name: '• Buyer', value: `<@${interaction.user.id}>`, inline: true },
        { name: '• Product', value: product.name, inline: true },
        { name: '• Total Price', value: `\`${totalPrice} ${WORLDLOCK}\``, inline: true },
        { name: '\u200B', value: 'Thank you for purchasing our product!' }
      )
      .setFooter({
        text: 'Magaddon Store • Your trusted marketplace',
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();
    if (purchaseHistoryChannel) {
      purchaseHistoryChannel.send({ embeds: [purchaseEmbed] });
    }
  } catch (error) {
    console.error('Error in buy_quantity_modal_:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: 'An error occurred while processing your purchase. Please try again or contact support.', flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: 'An error occurred while processing your purchase. Please try again or contact support.', flags: MessageFlags.Ephemeral });
    }
  }
};

async function handleModalInteraction(interaction) {
  // Try exact match first
  let handler = modalHandlers[interaction.customId];
  // If not found, try prefix match for dynamic modals
  if (!handler) {
    handler = Object.entries(modalHandlers).find(([key]) => key.endsWith('_') && interaction.customId.startsWith(key))?.[1];
  }
  if (handler) {
    await handler(interaction);
  } else {
    await interaction.reply({ content: 'Unknown modal.', ephemeral: true });
  }
}

module.exports = { modalHandlers, handleModalInteraction };
