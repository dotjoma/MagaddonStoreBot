const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, ModalBuilder, MessageFlags } = require('discord.js');
const { getAllProductsWithStock } = require('../services/productService');
const { isAdmin } = require('../middleware/adminCheck');
const { createClient } = require('@supabase/supabase-js');
const { RED } = require('../colors/discordColors');
const { WORLDLOCK, WHITECROWN, ALERT, CHECK, REDARROW, DIAMONDLOCK, BGL } = require('../emojis/discordEmojis');
const { replyAdminError } = require('../utils/embedHelpers');
const addStockFileCache = require('../utils/addStockCache');
const fs = require('fs');
const path = require('path');

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

// Function to write logs to file
function writeToLogFile(message) {
  const logDir = path.join(__dirname, '..', '..', 'logs');
  const logFile = path.join(logDir, 'add_stock_logs.txt');
  
  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Add timestamp to message
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  
  // Append to log file
  fs.appendFileSync(logFile, logMessage);
}

// Helper function to process addstock (used for both file uploads and manual input)
async function processAddStock(interaction, product, validAccounts, invalidLines = []) {
  let initialReply = null;
  
  try {
    // Send initial processing message
    try {
      if (interaction.replied || interaction.deferred) {
        initialReply = await interaction.followUp({ 
          content: `${INFO} Processing ${validAccounts.length} accounts for **${product.name}**... Please wait.`, 
          flags: MessageFlags.Ephemeral 
        });
      } else {
        initialReply = await interaction.reply({ 
          content: `${INFO} Processing ${validAccounts.length} accounts for **${product.name}**... Please wait.`, 
          flags: MessageFlags.Ephemeral 
        });
      }
    } catch (replyError) {
      console.warn('Could not send initial processing message:', replyError.message);
    }

    // Insert accounts into inventory
    const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
    const inventoryItems = [];
    const skippedDuplicates = [];
    const existingUsernames = new Set();
    const existingEmails = new Set();
    const batchUsernames = new Set();
    const batchEmails = new Set();
    const errors = [];

    writeToLogFile(`[ADD STOCK] Starting stock addition for product: ${product.name} (ID: ${product.id})`);
    writeToLogFile(`[ADD STOCK] Total accounts to process: ${validAccounts.length}`);
    writeToLogFile(`[ADD STOCK] User Info:`);
    writeToLogFile(`  👤 Username: ${interaction.user.username}`);
    writeToLogFile(`  📛 Display Name: ${interaction.member?.displayName || interaction.user.displayName || 'N/A'}`);
    writeToLogFile(`  🆔 User ID: ${interaction.user.id}`);
    writeToLogFile(`  🏷️ Roles: ${interaction.member?.roles?.cache?.map(r => r.name).join(', ') || 'N/A'}`);
    writeToLogFile(`  📍 Channel: ${interaction.channel?.name || 'DM'} (${interaction.channel?.id || 'N/A'})`);
    writeToLogFile(`  🏠 Guild: ${interaction.guild?.name || 'DM'} (${interaction.guild?.id || 'N/A'})`);

    // First, get existing usernames and emails from inventory for this product
    const { data: existingInventory } = await supabase
      .from('inventory')
      .select('data')
      .eq('product_id', product.id)
      .eq('is_sold', false);

    writeToLogFile(`[ADD STOCK] Found ${existingInventory?.length || 0} existing inventory items`);

    // Extract existing usernames and emails
    if (existingInventory) {
      for (const item of existingInventory) {
        const data = item.data;
        if (data) {
          const parts = data.split('|');
          if (parts.length >= 2) {
            const usernameOrEmail = parts[0].trim();
            // Check if it's an email (contains @)
            if (usernameOrEmail.includes('@')) {
              existingEmails.add(usernameOrEmail.toLowerCase());
            } else {
              existingUsernames.add(usernameOrEmail.toLowerCase());
            }
          }
        }
      }
    }

    writeToLogFile(`[ADD STOCK] Existing usernames: ${existingUsernames.size}, Existing emails: ${existingEmails.size}`);

    // Process new accounts
    for (const account of validAccounts) {
      const data = account.data || '';
      const parts = data.split('|');
      
      if (parts.length >= 2) {
        const usernameOrEmail = parts[0].trim();
        const isEmail = usernameOrEmail.includes('@');
        const normalizedUsernameOrEmail = usernameOrEmail.toLowerCase();
        
        // Check for duplicates in database
        const isDatabaseDuplicate = (isEmail && existingEmails.has(normalizedUsernameOrEmail)) || 
                                   (!isEmail && existingUsernames.has(normalizedUsernameOrEmail));
        
        // Check for duplicates within the same batch
        const isBatchDuplicate = (isEmail && batchEmails.has(normalizedUsernameOrEmail)) || 
                                (!isEmail && batchUsernames.has(normalizedUsernameOrEmail));
        
        if (isDatabaseDuplicate || isBatchDuplicate) {
          skippedDuplicates.push(data);
          const duplicateType = isDatabaseDuplicate ? 'DATABASE' : 'BATCH';
          writeToLogFile(`[ADD STOCK] SKIPPED DUPLICATE (${duplicateType}): ${data}`);
          continue;
        }
        
        // Add to batch sets to prevent duplicates within the same batch
        if (isEmail) {
          batchEmails.add(normalizedUsernameOrEmail);
        } else {
          batchUsernames.add(normalizedUsernameOrEmail);
        }
      }

      const { data: inventoryItem, error } = await supabase
        .from('inventory')
        .insert([{
          product_id: product.id,
          data: data,
          is_sold: false,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) {
        writeToLogFile(`[ADD STOCK] ERROR inserting item: ${data} - ${error.message}`);
        errors.push({ data, error: error.message });
        continue;
      }

      inventoryItems.push(inventoryItem);
      writeToLogFile(`[ADD STOCK] SUCCESS: Added ${data}`);
    }

    // Log summary
    writeToLogFile(`[ADD STOCK] SUMMARY for ${product.name}:`);
    writeToLogFile(`  ✅ Successfully added: ${inventoryItems.length} items`);
    writeToLogFile(`  🔄 Skipped duplicates: ${skippedDuplicates.length} items`);
    writeToLogFile(`  ❌ Errors: ${errors.length} items`);
    writeToLogFile(`  ⚠️ Invalid lines: ${invalidLines.length} items`);
    writeToLogFile(`  👤 User Details:`);
    writeToLogFile(`    - Username: ${interaction.user.username}`);
    writeToLogFile(`    - Display Name: ${interaction.member?.displayName || interaction.user.displayName || 'N/A'}`);
    writeToLogFile(`    - User ID: ${interaction.user.id}`);
    writeToLogFile(`    - Roles: ${interaction.member?.roles?.cache?.map(r => r.name).join(', ') || 'N/A'}`);
    writeToLogFile(`  📍 Location:`);
    writeToLogFile(`    - Channel: ${interaction.channel?.name || 'DM'} (${interaction.channel?.id || 'N/A'})`);
    writeToLogFile(`    - Guild: ${interaction.guild?.name || 'DM'} (${interaction.guild?.id || 'N/A'})`);
    writeToLogFile(`  🕐 Timestamp: ${new Date().toISOString()}`);

    // Optional: Send log to Discord channel if configured
    const logChannelId = process.env.ADMIN_LOG_CHANNEL;
    if (logChannelId) {
      try {
        const logChannel = interaction.client.channels.cache.get(logChannelId);
        if (logChannel) {
          const logEmbed = new EmbedBuilder()
            .setTitle(`${WHITECROWN} Stock Addition Log ${WHITECROWN}`)
            .setDescription(`**Product:** ${product.name}\n**Added by:** ${interaction.user.username} (${interaction.user.id})`)
            .setColor(RED)
            .addFields([
              { name: '✅ Successfully Added', value: `${inventoryItems.length} items`, inline: true },
              { name: '🔄 Skipped Duplicates', value: `${skippedDuplicates.length} items`, inline: true },
              { name: '❌ Errors', value: `${errors.length} items`, inline: true },
              { name: '⚠️ Invalid Lines', value: `${invalidLines.length} items`, inline: true },
              { name: '👤 User Details', value: `**Username:** ${interaction.user.username}\n**Display Name:** ${interaction.member?.displayName || interaction.user.displayName || 'N/A'}\n**User ID:** ${interaction.user.id}`, inline: false },
              { name: '📍 Location', value: `**Channel:** ${interaction.channel?.name || 'DM'}\n**Guild:** ${interaction.guild?.name || 'DM'}`, inline: false }
            ])
            .setFooter({
              text: `Stock Addition Log • ${new Date().toLocaleDateString()}`,
              iconURL: interaction.user.displayAvatarURL({ dynamic: true })
            })
            .setTimestamp();

          await logChannel.send({ embeds: [logEmbed] });
        }
      } catch (logError) {
        writeToLogFile(`[ADD STOCK] Error sending log to Discord channel: ${logError.message}`);
      }
    }

    // Create success embed
    const embed = new EmbedBuilder()
      .setTitle(`${CHECK} Stock Added Successfully`)
      .setDescription(`${REDARROW} Successfully added **${inventoryItems.length}** items to **${product.name}**`)
      .setColor(RED)
      .addFields([
        {
          name: 'Product Details',
          value: `**Name:** ${product.name}\n**Code:** ${product.code}\n**Price:** ${formatPriceWithEmojis(product.price, WORLDLOCK)}`,
          inline: true
        },
        {
          name: 'Stock Added',
          value: `**Added:** ${inventoryItems.length} items\n**Previous Stock:** ${product.stock}\n**New Total:** ${product.stock + inventoryItems.length}`,
          inline: true
        }
      ])
      .setFooter({
        text: `Added by ${interaction.user.username}`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true })
      })
      .setTimestamp();

    if (invalidLines.length > 0) {
      embed.addFields([
        {
          name: 'Invalid Lines',
          value: `${invalidLines.length} lines were skipped due to invalid format:\n\`\`\`\n${invalidLines.slice(0, 5).join('\n')}${invalidLines.length > 5 ? '\n...' : ''}\n\`\`\``,
          inline: false
        }
      ]);
    }

    if (skippedDuplicates.length > 0) {
      embed.addFields([
        {
          name: 'Skipped Duplicates',
          value: `${skippedDuplicates.length} items were skipped due to duplicate username/email:\n\`\`\`\n${skippedDuplicates.slice(0, 5).join('\n')}${skippedDuplicates.length > 5 ? '\n...' : ''}\n\`\`\``,
          inline: false
        }
      ]);
    }

    // Update the initial processing message with the final result
    try {
      if (initialReply) {
        await initialReply.edit({ 
          embeds: [embed], 
          content: null,
          flags: MessageFlags.Ephemeral 
        });
      } else {
        // Fallback if initial reply failed
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ 
            embeds: [embed], 
            flags: MessageFlags.Ephemeral 
          });
        } else {
          await interaction.reply({ 
            embeds: [embed], 
            flags: MessageFlags.Ephemeral 
          });
        }
      }
    } catch (replyError) {
      console.error('Error sending final result:', replyError);
      // Try one more fallback
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ 
            content: `${CHECK} Successfully added **${inventoryItems.length}** items to **${product.name}**`, 
            flags: MessageFlags.Ephemeral 
          });
        } else {
          await interaction.reply({ 
            content: `${CHECK} Successfully added **${inventoryItems.length}** items to **${product.name}**`, 
            flags: MessageFlags.Ephemeral 
          });
        }
      } catch (finalError) {
        console.error('Final fallback also failed:', finalError);
      }
    }

  } catch (error) {
    console.error('Error in processAddStock:', error);
    try {
      // Update the initial processing message with error
      if (initialReply) {
        await initialReply.edit({ 
          content: `${ALERT} An error occurred while adding stock. Please try again or contact support.`, 
          embeds: [],
          flags: MessageFlags.Ephemeral 
        });
      } else {
        // Fallback if initial reply failed
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ 
            content: `${ALERT} An error occurred while adding stock. Please try again or contact support.`, 
            flags: MessageFlags.Ephemeral 
          });
        } else {
          await interaction.reply({ 
            content: `${ALERT} An error occurred while adding stock. Please try again or contact support.`, 
            flags: MessageFlags.Ephemeral 
          });
        }
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
}

const selectMenuHandlers = {};

selectMenuHandlers['buy_product_select'] = async (interaction) => {
  try {
    const productId = interaction.values[0];
    const product = await getAllProductsWithStock().then(products => products.find(p => String(p.id) === productId));
    if (!product) {
      await interaction.reply({ content: `${ALERT} Product not found.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const modal = new ModalBuilder()
      .setCustomId(`buy_quantity_modal_${product.id}`)
      .setTitle(`Buy: ${product.name.toUpperCase()}`);
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
    await interaction.reply({ content: `${ALERT} An error occurred while processing your product selection.`, flags: MessageFlags.Ephemeral });
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
      .setTitle(`${WHITECROWN} Product Details ${WHITECROWN}`)
      .setColor(RED)
      .addFields([
        { name: 'Name', value: product.name.toUpperCase(), inline: false },
        { name: 'Code', value: product.code, inline: false },
        { name: 'Price', value: `${formatPriceWithEmojis(product.price, WORLDLOCK)}`, inline: false },
        { name: 'Stock', value: String(product.stock), inline: false },
        { name: 'Description', value: product.description || 'No description', inline: false }
      ])
      .setFooter({
        text: 'Magaddon Store • Product Details',
        iconURL: interaction.guild.iconURL()
      })
      .setTimestamp();
    if (product.image) {
      embed.setThumbnail(product.image);
    }
    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
  } catch (error) {
    console.error('Error fetching product:', error);
    await interaction.reply({ 
      content: `${ALERT} Failed to fetch product details. Please try again or contact support.`, 
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
      .setValue(product.name.toUpperCase())
      .setRequired(true);
    const codeInput = new TextInputBuilder()
      .setCustomId('code')
      .setLabel('Product Code')
      .setStyle(TextInputStyle.Short)
      .setValue(product.code.toUpperCase())
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
      content: `${ALERT} Failed to fetch product details. Please try again or contact support.`, 
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
      content: `${CHECK} Product '${product.name}' (Stock: ${product.stock}) has been deleted successfully!`, 
      flags: MessageFlags.Ephemeral 
    });
  } catch (error) {
    console.error('Error deleting product:', error);
    await interaction.reply({ 
      content: `${ALERT} Failed to delete product. Please try again or contact support.`, 
      flags: MessageFlags.Ephemeral 
    });
  }
};

selectMenuHandlers['addstock_product_select'] = async (interaction) => {
  if (!isAdmin(interaction.member)) {
    await replyAdminError(interaction, 'You do not have permission to use this command.');
    return;
  }
  
  const productId = interaction.values[0];
  try {
    const products = await getAllProductsWithStock();
    const product = products.find(p => String(p.id) === productId);
    
    if (!product) {
      await interaction.reply({ 
        content: `${ALERT} Product not found.`, 
        flags: MessageFlags.Ephemeral 
      });
      return;
    }

    // Check if file content exists in cache (from file upload)
    const fileCache = addStockFileCache.get(interaction.user.id);
    if (fileCache && fileCache.validAccounts) {
      // Process file content directly
      await processAddStock(interaction, product, fileCache.validAccounts, []);
      addStockFileCache.delete(interaction.user.id);
      return;
    }

    // Show modal for manual input
    const modal = new ModalBuilder()
      .setCustomId(`addstock_modal_${product.id}`)
      .setTitle('Account Details (one per line)');

    const accountDetailsInput = new TextInputBuilder()
      .setCustomId('account_details')
      .setLabel('Account Details (one per line)')
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder('account1@email.com|password123\naccount2@email.com|testpass456\nor any other format')
      .setRequired(true)
      .setMinLength(1)
      .setMaxLength(4000);

    modal.addComponents(
      new ActionRowBuilder().addComponents(accountDetailsInput)
    );

    await interaction.showModal(modal);

  } catch (error) {
    console.error('Error in addstock_product_select:', error);
    try {
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ 
          content: `${ALERT} An error occurred while processing your selection. Please try again.`, 
          flags: MessageFlags.Ephemeral 
        });
      } else {
        await interaction.reply({ 
          content: `${ALERT} An error occurred while processing your selection. Please try again.`, 
          flags: MessageFlags.Ephemeral 
        });
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
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
          content: `${ALERT} No products available.`, 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('view_product_select')
        .setPlaceholder('Select a product to view')
        .addOptions(
          products.map(p => ({
            label: p.name.toUpperCase(),
            value: String(p.id),
            description: `${p.price} WorldLock | Code: ${p.code} | Stock: ${p.stock}`
          }))
        );
      const row = new ActionRowBuilder().addComponents(selectMenu);
      await interaction.reply({
        content: `${REDARROW} Select a product to view:`,
        components: [row],
        flags: MessageFlags.Ephemeral
      });
      break;
    }
    case 'update': {
      if (!products || products.length === 0) {
        await interaction.reply({ 
          content: `${ALERT} No products available to update.`, 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('update_product_select')
        .setPlaceholder('Select a product to update')
        .addOptions(
          products.map(p => ({
            label: `${p.name.toUpperCase()} (Stock: ${p.stock})`,
            value: String(p.id),
            description: `${p.price} WorldLock | Code: ${p.code} | Stock: ${p.stock}`
          }))
        );
      const row = new ActionRowBuilder().addComponents(selectMenu);
      await interaction.reply({
        content: `${REDARROW} Select a product to update:`,
        components: [row],
        flags: MessageFlags.Ephemeral
      });
      break;
    }
    case 'delete': {
      if (!products || products.length === 0) {
        await interaction.reply({ 
          content: `${ALERT} No products available to delete.`, 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('delete_product_select')
        .setPlaceholder('Select a product to delete')
        .addOptions(
          products.map(p => ({
            label: p.name.toUpperCase(),
            value: String(p.id),
            description: `${p.price} WorldLock | Code: ${p.code} | Stock: ${p.stock}`
          }))
        );
      const row = new ActionRowBuilder().addComponents(selectMenu);
      await interaction.reply({
        content: `${REDARROW} Select a product to delete:`,
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
    await interaction.reply({ content: `${ALERT} Unknown menu interaction.`, ephemeral: true });
  }
}

module.exports = { selectMenuHandlers, handleSelectMenuInteraction, processAddStock };
