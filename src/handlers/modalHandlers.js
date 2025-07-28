const { EmbedBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, MessageFlags } = require('discord.js');
const { v5: uuidv5, v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const { getAllProductsWithStock, getTotalProducts, getActiveListings, getRevenueToday } = require('../services/productService');
const { getUserBalance, getUserWithRoleAndCreatedAt, deductWorldLocksAndAddSpent } = require('../services/userService');
const { getAvailableInventoryItems, markInventoryItemsAsSold } = require('../services/inventoryService');
const { setWorldName, setOwnerName, setBotName } = require('../services/configService');
const { getOrderCount, createOrder } = require('../services/orderService');
const { isAdmin } = require('../middleware/adminCheck');
const { RED } = require('../colors/discordColors');
const { WORLDLOCK, CHECK, ALERT, REDARROW, DIAMONDLOCK, BGL } = require('../emojis/discordEmojis');
const { getSetGrowIdRow, replyAdminError } = require('../utils/embedHelpers');
const { isPurchaseOnCooldown, setPurchaseCooldown, getRemainingPurchaseCooldown } = require('./buttonHandlers');
const DISCORD_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const util = require('util');

// Function to format price with world locks, diamond locks, and blue gem locks
function formatPriceWithEmojis(totalPrice, worldLockEmoji) {
  const worldLocks = totalPrice % 100;
  const diamondLocks = Math.floor((totalPrice % 10000) / 100);
  const blueGemLocks = Math.floor(totalPrice / 10000);
  
  let result = '';
  
  if (blueGemLocks > 0) {
    result += `${blueGemLocks} ${BGL}`;
  }
  
  if (diamondLocks > 0) {
    if (result) result += ' ';
    result += `${diamondLocks} ${DIAMONDLOCK}`;
  }
  
  if (worldLocks > 0) {
    if (result) result += ' ';
    result += `${worldLocks} ${worldLockEmoji}`;
  }
  
  // If totalPrice is 0, show 0 world locks
  if (totalPrice === 0) {
    result = `0 ${worldLockEmoji}`;
  }
  
  return result;
}

const modalHandlers = {};

modalHandlers['set_growid_modal'] = async (interaction) => {
  const discordId = interaction.user.id;
  const uuidId = uuidv5(String(discordId), DISCORD_NAMESPACE);
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
  const growid = interaction.fields.getTextInputValue('growid');
  
  // Only get email if it exists in the modal
  let email = null;
  try {
    email = interaction.fields.getTextInputValue('email');
  } catch (e) {
    // Field not found, that's OK - user already has email
    email = null;
  }
  
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
      // Update GrowID and email (only if email was provided)
      const updateData = { growid };
      if (email) {
        updateData.email = email;
      }
      const { error: updateError } = await supabase
        .from('users')
        .update(updateData)
        .eq('id', uuidId);
      if (updateError) throw updateError;
    }
    const embed = new EmbedBuilder()
      .setTitle(`${CHECK} GrowID Set`)
      .setDescription(`${REDARROW} Your GrowID has been set to **${growid}**${email ? `\n${REDARROW} Email: **${email}**` : ''}`)
      .setColor(RED)
      .setFooter({
        text: 'Magaddon Store • Registration',
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('Error setting GrowID:', error);
    await interaction.reply({ content: `${ALERT} Failed to set GrowID. Please try again or contact support.`, flags: MessageFlags.Ephemeral });
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
      .setTitle(`${CHECK} Depo Info Updated!`)
      .setDescription(
        `**World:** ${world}\n` +
        `**Owner:** ${owner}\n` +
        `**Bot:** ${bot}`
      )
      .setColor(RED);
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch (error) {
    await interaction.reply({ content: `${ALERT} Failed to update depo info.`, flags: MessageFlags.Ephemeral });
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
    await interaction.reply({ content: `${ALERT} Invalid price. Please enter a valid number.`, flags: MessageFlags.Ephemeral });
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
      .setTitle(`${CHECK} Product Created`)
      .setDescription(`${REDARROW} A new product has been added successfully!`)
      .setColor(RED)
      .addFields([
        { name: 'Name', value: ` ${name.toUpperCase()}`, inline: true },
        { name: 'Code', value: ` ${code.toUpperCase()}`, inline: true },
        { name: 'Price', value: ` ${formatPriceWithEmojis(price, WORLDLOCK)}`, inline: true },
        { name: 'Description', value: description, inline: false }
      ])
      .setFooter({
        text: 'Magaddon Store • Product Management',
        iconURL: interaction.guild.iconURL()
      })
      .setTimestamp();
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('Error creating product:', error);
    await interaction.reply({ content: `${ALERT} Failed to create product. Please try again or contact support.`, flags: MessageFlags.Ephemeral });
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
    await interaction.reply({ content: `${ALERT} Invalid price. Please enter a valid number.`, flags: MessageFlags.Ephemeral });
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
      .setTitle(`${CHECK} Product Updated`)
      .setDescription(`${REDARROW} Product has been updated successfully!`)
      .setColor(RED)
      .addFields([
        { name: 'Name', value: name.toUpperCase(), inline: true },
        { name: 'Code', value: code.toUpperCase(), inline: true },
        { name: 'Price', value: `${formatPriceWithEmojis(price, WORLDLOCK)}`, inline: true },
        { name: 'Description', value: description }
      ])
      .setFooter({
        text: 'Magaddon Store • Product Management',
        iconURL: interaction.guild.iconURL()
      })
      .setTimestamp();
    if (product.image) {
      embed.setThumbnail(product.image);
    }
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('Error updating product:', error);
    await interaction.reply({ content: `${ALERT} Failed to update product. Please try again or contact support.`, flags: MessageFlags.Ephemeral });
  }
};

modalHandlers['buy_quantity_modal_'] = async (interaction) => {
  try {
    // Check purchase cooldown to prevent spam and race conditions
    const userId = interaction.user.id;
    if (isPurchaseOnCooldown(userId)) {
      const remainingTime = getRemainingPurchaseCooldown(userId);
      const remainingSeconds = Math.ceil(remainingTime / 1000);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ 
          content: `${ALERT} Please wait **${remainingSeconds} seconds** before making another purchase.`, 
          flags: MessageFlags.Ephemeral 
        });
      } else {
        await interaction.reply({ 
          content: `${ALERT} Please wait **${remainingSeconds} seconds** before making another purchase.`, 
          flags: MessageFlags.Ephemeral 
        });
      }
      return;
    }

    // Set purchase cooldown immediately to prevent race conditions
    setPurchaseCooldown(userId);

    const productId = interaction.customId.replace('buy_quantity_modal_', '');
    const quantityStr = interaction.fields.getTextInputValue('quantity');
    const quantity = parseInt(quantityStr, 10);
    
    // Stricter quantity validation
    if (isNaN(quantity) || quantity < 1 || quantity > 99999) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `${ALERT} Invalid quantity. Please enter a number between 1 and 99999.`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: `${ALERT} Invalid quantity. Please enter a number between 1 and 99999.`, flags: MessageFlags.Ephemeral });
      }
      return;
    }

    // Try the new transaction system first, fallback to old system if it fails
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    
    // Fetch product and user info for error handling
    const [products, user] = await Promise.all([
      getAllProductsWithStock(),
      getUserBalance(interaction.user.id)
    ]);
    
    const product = products.find(p => String(p.id) === productId);
    if (!product) {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `${ALERT} Product not found.`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: `${ALERT} Product not found.`, flags: MessageFlags.Ephemeral });
      }
      return;
    }
    
    try {
      // Start transaction
      const { data: transactionData, error: transactionError } = await supabase.rpc('process_purchase_transaction', {
        p_user_id: uuidv5(String(interaction.user.id), DISCORD_NAMESPACE),
        p_product_id: parseInt(productId),
        p_quantity: quantity
      });

      if (transactionError) {
        // Handle specific transaction errors gracefully
        if (transactionError.message.includes('Insufficient inventory')) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: `${ALERT} Not enough stock available. Please try a smaller quantity or check back later.`, flags: MessageFlags.Ephemeral });
          } else {
            await interaction.reply({ content: `${ALERT} Not enough stock available. Please try a smaller quantity or check back later.`, flags: MessageFlags.Ephemeral });
          }
          return;
        }
        
        if (transactionError.message.includes('Insufficient balance')) {
          const totalPrice = product.price * quantity;
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: `${ALERT} You don't have enough World Locks for this purchase. You need ${formatPriceWithEmojis(totalPrice - (user.world_lock || 0), WORLDLOCK)} more.`, flags: MessageFlags.Ephemeral });
          } else {
            await interaction.reply({ content: `${ALERT} You don't have enough World Locks for this purchase. You need ${formatPriceWithEmojis(totalPrice - (user.world_lock || 0), WORLDLOCK)} more.`, flags: MessageFlags.Ephemeral });
          }
          return;
        }
        
        if (transactionError.message.includes('Product not found')) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: `${ALERT} Product not found. Please try selecting a different product.`, flags: MessageFlags.Ephemeral });
          } else {
            await interaction.reply({ content: `${ALERT} Product not found. Please try selecting a different product.`, flags: MessageFlags.Ephemeral });
          }
          return;
        }
        
        if (transactionError.message.includes('User not found')) {
          if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: `${ALERT} User account not found. Please set your GrowID first.`, flags: MessageFlags.Ephemeral });
          } else {
            await interaction.reply({ content: `${ALERT} User account not found. Please set your GrowID first.`, flags: MessageFlags.Ephemeral });
          }
          return;
        }
        
        // For any other transaction errors, fall back to old system
        console.log('Transaction error, falling back to old system:', transactionError.message);
        throw new Error('Transaction system unavailable');
      }

      const { product: transactionProduct, inventory_items, total_price, order_number } = transactionData;

      // Prepare DM content as a txt file
      const now = Date.now();
      const safeProductName = transactionProduct.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const filename = `purchased_from_MagaddonStore_${safeProductName}_${now}.txt`;
      const fileContent = inventory_items.map(item => item.data || 'No details').join('\n');
      const file = Buffer.from(fileContent, 'utf-8');
      const attachment = new AttachmentBuilder(file, { name: filename });

      try {
        await interaction.user.send({
          content: `${REDARROW} Thank you for your purchase! Here are your items for ${transactionProduct.name}:`,
          files: [attachment]
        });
      } catch (err) {
        // If DM fails, we need to rollback the transaction
        await supabase.rpc('rollback_purchase_transaction', {
          p_user_id: uuidv5(String(interaction.user.id), DISCORD_NAMESPACE),
          p_product_id: parseInt(productId),
          p_quantity: quantity,
          p_order_number: order_number
        });
        
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: `${ALERT} Failed to send you a DM. Please make sure your DMs are open and try again. No World Locks were deducted.`, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: `${ALERT} Failed to send you a DM. Please make sure your DMs are open and try again. No World Locks were deducted.`, flags: MessageFlags.Ephemeral });
        }
        return;
      }

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `${CHECK} Purchase successful! You bought **${quantity}x ${transactionProduct.name.toUpperCase()}** for ${formatPriceWithEmojis(total_price, WORLDLOCK)}. Check your DMs for your items.`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: `${CHECK} Purchase successful! You bought **${quantity}x ${transactionProduct.name.toUpperCase()}** for ${formatPriceWithEmojis(total_price, WORLDLOCK)}. Check your DMs for your items.`, flags: MessageFlags.Ephemeral });
      }

      // Send purchase log to PURCHASE_HISTORY_CHANNEL
      const purchaseHistoryChannelId = process.env.PURCHASE_HISTORY_CHANNEL;
      const purchaseHistoryChannel = interaction.client.channels.cache.get(purchaseHistoryChannelId);
      const orderCount = await getOrderCount();
      const orderNumber = orderCount + 1;
      sendPurchaseLog(purchaseHistoryChannel, orderNumber, interaction.user.id, quantity, transactionProduct.name, total_price, WORLDLOCK, interaction);

    } catch (transactionError) {
      // Only log and fallback if it's a system error, not a user error
      if (transactionError.message !== 'Transaction system unavailable') {
        console.error('Transaction system failed, falling back to old system:', util.inspect(transactionError, { depth: null }));
      }
      
      // Fallback to old system (product and user already fetched above)
      if (quantity > product.stock) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: `${ALERT} Not enough stock. Only ${product.stock} available.`, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: `${ALERT} Not enough stock. Only ${product.stock} available.`, flags: MessageFlags.Ephemeral });
        }
        return;
      }
      
      const totalPrice = (product.price || 0) * quantity;
      if ((user.world_lock || 0) < totalPrice) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: `${ALERT} You do not have enough World Locks. You need ${formatPriceWithEmojis(totalPrice - (user.world_lock || 0), WORLDLOCK)} more.`, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: `${ALERT} You do not have enough World Locks. You need ${formatPriceWithEmojis(totalPrice - (user.world_lock || 0), WORLDLOCK)} more.`, flags: MessageFlags.Ephemeral });
        }
        return;
      }
      
      const inventoryItems = await getAvailableInventoryItems(productId, quantity);
      if (!inventoryItems || inventoryItems.length < quantity) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: `${ALERT} Not enough inventory. Only ${inventoryItems.length} available.`, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: `${ALERT} Not enough inventory. Only ${inventoryItems.length} available.`, flags: MessageFlags.Ephemeral });
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
          content: `${REDARROW} Thank you for your purchase! Here are your items for ${product.name}:`,
          files: [attachment]
        });
      } catch (err) {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: `${ALERT} Failed to send you a DM. Please make sure your DMs are open and try again. No World Locks were deducted.`, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: `${ALERT} Failed to send you a DM. Please make sure your DMs are open and try again. No World Locks were deducted.`, flags: MessageFlags.Ephemeral });
        }
        return;
      }
      
      const ids = inventoryItems.map(item => item.id);
      await markInventoryItemsAsSold(ids);
      await deductWorldLocksAndAddSpent(interaction.user.id, totalPrice);
      
      // Insert order into database
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
          payment_method: 'world_lock'
        }])
        .select()
        .single();
        
      if (orderError) {
        console.error('Order creation error:', orderError);
      }
      
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: `${CHECK} Purchase successful! You bought **${quantity}x ${product.name.toUpperCase()}** for ${formatPriceWithEmojis(totalPrice, WORLDLOCK)}. Check your DMs for your items.`, flags: MessageFlags.Ephemeral });
      } else {
        await interaction.reply({ content: `${CHECK} Purchase successful! You bought **${quantity}x ${product.name.toUpperCase()}** for ${formatPriceWithEmojis(totalPrice, WORLDLOCK)}. Check your DMs for your items.`, flags: MessageFlags.Ephemeral });
      }
      
      // Send purchase log to PURCHASE_HISTORY_CHANNEL
      const purchaseHistoryChannelId = process.env.PURCHASE_HISTORY_CHANNEL;
      const purchaseHistoryChannel = interaction.client.channels.cache.get(purchaseHistoryChannelId);
      const orderCount = await getOrderCount();
      const realOrderNumber = orderCount + 1;
      sendPurchaseLog(purchaseHistoryChannel, realOrderNumber, interaction.user.id, quantity, product.name, totalPrice, WORLDLOCK, interaction);
    }
  } catch (error) {
    console.error('Error in buy_quantity_modal_ (fallback):', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: `${ALERT} An error occurred while processing your purchase. Please try again or contact support.`, flags: MessageFlags.Ephemeral });
    } else {
      await interaction.reply({ content: `${ALERT} An error occurred while processing your purchase. Please try again or contact support.`, flags: MessageFlags.Ephemeral });
    }
  }
};

modalHandlers['addstock_modal_'] = async (interaction) => {
  if (!isAdmin(interaction.member)) {
    await replyAdminError(interaction);
    return;
  }

  try {
    // Extract product ID from modal custom ID
    const productId = interaction.customId.replace('addstock_modal_', '');
    const accountDetails = interaction.fields.getTextInputValue('account_details');

    // Parse account details (any format, one per line)
    const lines = accountDetails.trim().split('\n').filter(line => line.trim());
    const validAccounts = [];
    const invalidLines = [];

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine) {
        validAccounts.push({ data: trimmedLine });
      }
    }

    if (validAccounts.length === 0) {
      await interaction.reply({ 
        content: `${ALERT} No account details found. Please add some content.`, 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    // Get product details
    const products = await getAllProductsWithStock();
    const product = products.find(p => String(p.id) === productId);
    
    if (!product) {
      await interaction.reply({ 
        content: `${ALERT} Product not found.`, 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    // Use the shared processAddStock function
    const { processAddStock } = require('./selectMenuHandlers');
    await processAddStock(interaction, product, validAccounts, invalidLines);

  } catch (error) {
    console.error('Error in addstock_modal_:', error);
    await interaction.reply({ 
      content: `${ALERT} An error occurred while adding stock. Please try again or contact support.`, 
      flags: MessageFlags.Ephemeral 
    });
  }
};

function sendPurchaseLog(channel, orderNumber, userId, quantity, productName, totalPrice, worldLockEmoji, interaction) {
  const embed = new EmbedBuilder()
    .setTitle(`#Order Number: ${orderNumber}`)
    .setDescription(
      `${REDARROW} Buyer: <@${userId}>\n` +
      `${REDARROW} Product: **${quantity} ${productName.toUpperCase()}**\n` +
      `${REDARROW} Total Price: **${formatPriceWithEmojis(totalPrice, worldLockEmoji)}**\n\n` +
      `**Thanks For Purchasing Our Product.**`
    )
    .setColor(RED)
    .setImage('https://media.discordapp.net/attachments/1225818847672537139/1398511989965193226/magaddon-store-banner.gif?ex=6885a149&is=68844fc9&hm=970569f9692c00c1197708d7d3ad406718ed6874c8a5c672f69fdf20bbb90bd9&=')
    .setFooter({
      text: 'Magaddon Store • Your trusted marketplace',
      iconURL: interaction.guild.iconURL()
    })
    .setTimestamp();
  if (channel) channel.send({ embeds: [embed] });
}

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
    await interaction.reply({ content: `${ALERT} Unknown modal.`, ephemeral: true });
  }
}

module.exports = { modalHandlers, handleModalInteraction };
