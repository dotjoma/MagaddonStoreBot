const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getAllProductsWithStock, checkSupabaseHealth } = require('../../services/productService');
const { RED } = require('../../colors/discordColors');
const { isAdmin } = require('../../middleware/adminCheck');
const { isAuthorizedUser } = require('../../middleware/authorizedUser');
const { replyAdminError } = require('../../utils/embedHelpers');
const fs = require('fs/promises');
const path = require('path');
const { REDARROW, FAQ, INFO, WHITECROWN, ALERT, CHECK, WORLDLOCK, DIAMONDLOCK, BGL } = require('../../emojis/discordEmojis');

const STOCK_JSON_PATH = path.join(__dirname, '../../../stockMessages.json');
const stockMessageMap = new Map();

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

// Track last update time for each channel
const lastUpdateTimes = new Map();

// Helper to read JSON file
async function readStockJson() {
  try {
    const data = await fs.readFile(STOCK_JSON_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    return {};
  }
}
// Helper to write JSON file
async function writeStockJson(obj) {
  await fs.writeFile(STOCK_JSON_PATH, JSON.stringify(obj, null, 2), 'utf8');
}

async function saveStockMessage(channelId, messageId) {
  const json = await readStockJson();
  json[channelId] = { channelId, messageId };
  await writeStockJson(json);
}

async function removeStockMessage(channelId) {
  const json = await readStockJson();
  delete json[channelId];
  await writeStockJson(json);
}



async function setupStockAutoUpdate(channel, message) {
  console.log(`[Stock Auto-Update] Setting up auto-update for channel ${channel.id}`);
  // Clear any previous interval
  const entry = stockMessageMap.get(channel.id);
  if (entry && entry.interval) {
    console.log(`[Stock Auto-Update] Clearing previous interval for channel ${channel.id}`);
    clearInterval(entry.interval);
  }
  // Set up periodic update every 5 seconds
  const WORLDLOCK = '<:wl:1237744867254472704>';
  const howToBuy =
    `${FAQ} **HOW TO BUY** ${FAQ}\n` +
    `${REDARROW} Click Button **Set GrowID**\n` +
    `${REDARROW} Click Button **My Info** To Check Your Information\n` +
    `${REDARROW} Click Button **Deposit** To See World Deposit\n` +
    `${REDARROW} Click Button **Buy** For Buying The Items`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('buy')
      .setLabel('Buy')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('set_growid')
      .setLabel('Set GrowID')
      .setEmoji('<:char:1239164095396319252>')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('my_info')
      .setLabel('My Info')
      .setEmoji(INFO)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('deposit')
      .setLabel('Deposit')
      .setEmoji('<:mcworld:1240203040317767739>')
      .setStyle(ButtonStyle.Danger)
  );
  const interval = setInterval(async () => {
    let updatedProducts;
    try {
      // console.log(`[Stock Auto-Update] Updating stock for channel ${channel.id}`);
      updatedProducts = await getAllProductsWithStock();
      if (!updatedProducts || updatedProducts.length === 0) {
        console.log(`[Stock Auto-Update] No products found for channel ${channel.id}`);
        await message.edit({ content: 'No products in stock.', embeds: [], components: [] });
        return;
      }
      // console.log(`[Stock Auto-Update] Found ${updatedProducts.length} products for channel ${channel.id}`);
      const currentTime = Math.floor(Date.now() / 1000);
      const now = new Date();
      const manilaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Manila"}));
      const updatedLastUpdate = `${manilaTime.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit', 
        second: '2-digit',
        hour12: true 
      })} (UTC+8)`;
      lastUpdateTimes.set(channel.id, currentTime);
      //console.log(`[Stock Auto-Update] Timestamp: ${currentTime} -> ${updatedLastUpdate} | Manila time: ${manilaTime.toLocaleTimeString()}`);
      const updatedProductLines = updatedProducts.map(p =>
        `${WHITECROWN} **${(p.name || '').toUpperCase()}** ${WHITECROWN}\n` +
        `${REDARROW} Code: \`${p.code || p.id}\`\n` +
        `${REDARROW} Stock: **${p.stock ?? 0}**\n` +
        `${REDARROW} Price: **${formatPriceWithEmojis(p.price ?? 0, WORLDLOCK)}**\n` +
        `${REDARROW} Description: ${p.description || 'No description'}\n` +
        '--------------------------------------------'
      ).join('\n');
      const updatedEmbed = new EmbedBuilder()
        .setTitle(`${WHITECROWN} PRODUCT LIST ${WHITECROWN}`)
        .setDescription(
          `Last Update: ${updatedLastUpdate}\n` +
          '--------------------------------------------\n' +
          updatedProductLines +
          '\n' +
          howToBuy
        )
        .setColor(RED);
        // .setImage('https://media.discordapp.net/attachments/1225818847672537139/1251395315697979393/standard.gif?ex=68787e35&is=68772cb5&hm=1c528e9fe3ec08dcb5fdb63c0534c91ba4a847363a6cbd1a297e17b8cd576309&=');
      await message.edit({ embeds: [updatedEmbed], components: [row], content: null });
      // console.log(`[Stock Auto-Update] Successfully updated stock for channel ${channel.id}`);
    } catch (err) {
      // Check if it's a network-related error
      const isNetworkError = err.message?.includes('fetch failed') || 
                            err.message?.includes('network') ||
                            err.message?.includes('ECONNRESET') ||
                            err.message?.includes('ETIMEDOUT') ||
                            err.message?.includes('ENOTFOUND');

      if (isNetworkError) {
        console.warn(`[Stock Auto-Update] Network error for channel ${channel.id}: ${err.message}. Will retry on next interval.`);
        return; // Don't log as error, just warn and continue
      }

      console.error(`[Stock Auto-Update] Error updating stock for channel ${channel.id}:`, {
        message: err.message,
        details: err.stack,
        hint: err.hint || '',
        code: err.code || '',
        timestamp: new Date().toISOString()
      });

      // If the error is Unknown Message, remove only this channel's entry and stop the interval
      if (err.code === 10008 || (err.rawError && err.rawError.code === 10008)) {
        await removeStockMessage(channel.id);
        clearInterval(interval);
        stockMessageMap.delete(channel.id);
        if (!interval._loggedMissing) {
          console.warn(`Stock message not found for channel ${channel.id}, removed entry and stopped auto-update.`);
          interval._loggedMissing = true;
        }
      } else {
        console.log(`[Stock Auto-Update] Non-critical error for channel ${channel.id}:`, {
          message: err.message,
          details: err.stack,
          hint: err.hint || '',
          code: err.code || ''
        });
      }
    }
  }, (process.env.STOCK_UPDATE_INTERVAL || 60) * 1000);
  stockMessageMap.set(channel.id, { message, interval });
  await saveStockMessage(channel.id, message.id);
  console.log(`[Stock Auto-Update] Auto-update setup complete for channel ${channel.id} (interval: ${process.env.STOCK_UPDATE_INTERVAL || 5}s)`);
}

// Helper to clear the entire JSON file
async function clearStockJson() {
  await writeStockJson({});
}

// Restore function to be called on bot startup
async function restoreStockAutoUpdate(client) {
  const json = await readStockJson();
  for (const channelId in json) {
    const { messageId } = json[channelId];
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) throw new Error('Channel not found');
      const message = await channel.messages.fetch(messageId);
      await setupStockAutoUpdate(channel, message);
    } catch (e) {
      // If message or channel is missing, clear the entire JSON file
      await clearStockJson();
      break;
    }
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stock')
    .setDescription('Show the current product stock list.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('health')
        .setDescription('Check Supabase connection health')),
  async execute(interaction) {
    if (!(isAdmin(interaction.member) && isAuthorizedUser(interaction.user.id))) {
      await replyAdminError(interaction);
      return;
    }

    const subcommand = interaction.options.getSubcommand(false);
    
    if (subcommand === 'health') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      
      try {
        const health = await checkSupabaseHealth();
        const embed = new EmbedBuilder()
          .setTitle(`${WHITECROWN} Supabase Health Check ${WHITECROWN}`)
          .setColor(health.status === 'healthy' ? '#00ff00' : '#ff0000')
          .addFields([
            { name: 'Status', value: health.status === 'healthy' ?  `${CHECK} Healthy` : `${ALERT} Error`, inline: true },
            { name: 'Response Time', value: health.responseTime ? `${health.responseTime}ms` : 'N/A', inline: true },
            { name: 'Message', value: health.message || 'No message', inline: false }
          ])
          .setTimestamp();
        
        if (health.code) {
          embed.addFields({ name: 'Error Code', value: health.code, inline: true });
        }
        if (health.hint) {
          embed.addFields({ name: 'Hint', value: health.hint, inline: true });
        }
        
        await interaction.editReply({ embeds: [embed], flags: MessageFlags.Ephemeral });
      } catch (error) {
        await interaction.editReply({ 
          content: `${ALERT} Health check failed: ${error.message}`, 
          flags: MessageFlags.Ephemeral 
        });
      }
      return;
    }
    
    // Default stock display command (when no subcommand is provided)
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = interaction.channel;
    let stockEntry = stockMessageMap.get(channel.id);
    let message;
    let products;
    try {
      products = await getAllProductsWithStock();
    } catch (err) {
      await interaction.editReply({ content: `${ALERT} Failed to fetch product stock.`, flags: MessageFlags.Ephemeral });
      return;
    }
    if (!products || products.length === 0) {
      await interaction.editReply({ content: 'No products in stock.', flags: MessageFlags.Ephemeral });
      return;
    }
    const WORLDLOCK = '<:wl:1237744867254472704>';
    const currentTime = Math.floor(Date.now() / 1000);
    const now = new Date();
    const manilaTime = new Date(now.toLocaleString("en-US", {timeZone: "Asia/Manila"}));
    const lastUpdate = `${manilaTime.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: true 
    })} (UTC+8)`;
    lastUpdateTimes.set(channel.id, currentTime);
    // console.log(`[Stock Command] Initial timestamp: ${currentTime} -> ${lastUpdate} | Manila time: ${manilaTime.toLocaleTimeString()}`);
    const productLines = products.map(p =>
      `${WHITECROWN} **${(p.name || '').toUpperCase()}** ${WHITECROWN}\n` +
      `${REDARROW} Code: \`${p.code || p.id}\`\n` +
      `${REDARROW} Stock: **${p.stock ?? 0}**\n` +
              `${REDARROW} Price: **${formatPriceWithEmojis(p.price ?? 0, WORLDLOCK)}**\n` +
      `${REDARROW} Description: ${p.description || 'No description'}\n` +
      '--------------------------------------------'
    ).join('\n');
    const howToBuy =
      `${FAQ} **HOW TO BUY** ${FAQ}\n` +
      `${REDARROW} Click Button **Set GrowID**\n` +
      `${REDARROW} Click Button **My Info** To Check Your Information\n` +
      `${REDARROW} Click Button **Deposit** To See World Deposit\n` +
      `${REDARROW} Click Button **Buy** For Buying The Items`;
    const embed = new EmbedBuilder()
      .setTitle(`${WHITECROWN} PRODUCT LIST ${WHITECROWN}`)
      .setDescription(
        `Last Update: ${lastUpdate}\n` +
        '--------------------------------------------\n' +
        productLines +
        '\n' +
        howToBuy
      )
      .setColor(RED);
      // .setImage('https://media.discordapp.net/attachments/1225818847672537139/1251395315697979393/standard.gif?ex=68787e35&is=68772cb5&hm=1c528e9fe3ec08dcb5fdb63c0534c91ba4a847363a6cbd1a297e17b8cd576309&=');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('buy')
        .setLabel('Buy')
        .setEmoji('🛒')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('set_growid')
        .setLabel('Set GrowID')
        .setEmoji('<:char:1239164095396319252>')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('my_info')
        .setLabel('My Info')
        .setEmoji(INFO)
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('deposit')
        .setLabel('Deposit')
        .setEmoji('<:mcworld:1240203040317767739>')
        .setStyle(ButtonStyle.Danger)
    );
    if (stockEntry && stockEntry.message) {
      message = stockEntry.message;
      await message.edit({ embeds: [embed], components: [row], content: null });
    } else {
      message = await channel.send({ embeds: [embed], components: [row] });
    }
    await setupStockAutoUpdate(channel, message);
    await interaction.deleteReply();
  },
  restoreStockAutoUpdate
};
