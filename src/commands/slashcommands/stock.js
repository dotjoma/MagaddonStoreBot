const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { getAllProductsWithStock } = require('../../services/productService');
const { RED } = require('../../colors/discordColors');
const { isAdmin } = require('../../middleware/adminCheck');
const { isAuthorizedUser } = require('../../middleware/authorizedUser');
const fs = require('fs/promises');
const path = require('path');
const { replyAdminError } = require('../../utils/embedHelpers');

const STOCK_JSON_PATH = path.join(__dirname, '../../../stockMessages.json');
const stockMessageMap = new Map();

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
  // Clear any previous interval
  const entry = stockMessageMap.get(channel.id);
  if (entry && entry.interval) clearInterval(entry.interval);
  // Set up periodic update every 5 seconds
  const FIRECHI = '<:firechi:1396706374322491473>';
  const ACROWN = '<:owner:1240203671548203049>';
  const WORLDLOCK = '<:wl:1237744867254472704>';
  const AWARN = ':warning:';
  const BULLET = '•';
  const howToBuy =
    `${AWARN} **HOW TO BUY** ${AWARN}\n` +
    `${BULLET} Click Button **Set GrowID**\n` +
    `${BULLET} Click Button **My Info** To Check Your Information\n` +
    `${BULLET} Click Button **Deposit** To See World Deposit\n` +
    `${BULLET} Click Button **Buy** For Buying The Items`;
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('buy')
      .setLabel('Buy')
      .setEmoji('🛒')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('set_growid')
      .setLabel('Set GrowID')
      .setEmoji('<:char:1239164095396319252>')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('my_info')
      .setLabel('My Info')
      .setEmoji('ℹ️')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('deposit')
      .setLabel('Deposit')
      .setEmoji('<:mcworld:1240203040317767739>')
      .setStyle(ButtonStyle.Secondary)
  );
  const interval = setInterval(async () => {
    let updatedProducts;
    try {
      updatedProducts = await getAllProductsWithStock();
      if (!updatedProducts || updatedProducts.length === 0) {
        await message.edit({ content: 'No products in stock.', embeds: [], components: [] });
        return;
      }
      const updatedLastUpdate = `<t:${Math.floor(Date.now() / 1000)}:R>`;
      const updatedProductLines = updatedProducts.map(p =>
        `${ACROWN} **${(p.name || '').toUpperCase()}** ${ACROWN}\n` +
        `${BULLET} Code: \`${p.code || p.id}\`\n` +
        `${BULLET} Stock: **${p.stock ?? 0}**\n` +
        `${BULLET} Price: **${p.price ?? 'N/A'}** ${WORLDLOCK}\n` +
        `${BULLET} Description: ${p.description || 'No description'}\n` +
        '--------------------------------------------'
      ).join('\n');
      const updatedEmbed = new EmbedBuilder()
        .setTitle('PRODUCT LIST')
        .setDescription(
          `Last Update: ${updatedLastUpdate}\n` +
          '--------------------------------------------\n' +
          updatedProductLines +
          '\n' +
          howToBuy
        )
        .setColor(RED)
        .setImage('https://media.discordapp.net/attachments/1225818847672537139/1251395315697979393/standard.gif?ex=68787e35&is=68772cb5&hm=1c528e9fe3ec08dcb5fdb63c0534c91ba4a847363a6cbd1a297e17b8cd576309&=');
      await message.edit({ embeds: [updatedEmbed], components: [row], content: null });
    } catch (err) {
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
        console.log(`Error: `, err);
      }
    }
  }, 5 * 1000);
  stockMessageMap.set(channel.id, { message, interval });
  await saveStockMessage(channel.id, message.id);
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
    .setDescription('Show the current product stock list.'),
  async execute(interaction) {
    if (!(isAdmin(interaction.member) && isAuthorizedUser(interaction.user.id))) {
      await replyAdminError(interaction);
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const channel = interaction.channel;
    let stockEntry = stockMessageMap.get(channel.id);
    let message;
    let products;
    try {
      products = await getAllProductsWithStock();
    } catch (err) {
      await interaction.editReply({ content: 'Failed to fetch product stock.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (!products || products.length === 0) {
      await interaction.editReply({ content: 'No products in stock.', flags: MessageFlags.Ephemeral });
      return;
    }
    const ACROWN = '<:owner:1240203671548203049>';
    const WORLDLOCK = '<:wl:1237744867254472704>';
    const AWARN = ':warning:';
    const BULLET = '•';
    const lastUpdate = `<t:${Math.floor(Date.now() / 1000)}:R>`;
    const productLines = products.map(p =>
      `${ACROWN} **${(p.name || '').toUpperCase()}** ${ACROWN}\n` +
      `${BULLET} Code: \`${p.code || p.id}\`\n` +
      `${BULLET} Stock: **${p.stock ?? 0}**\n` +
      `${BULLET} Price: **${p.price ?? 'N/A'}** ${WORLDLOCK}\n` +
      `${BULLET} Description: ${p.description || 'No description'}\n` +
      '--------------------------------------------'
    ).join('\n');
    const howToBuy =
      `${AWARN} **HOW TO BUY** ${AWARN}\n` +
      `${BULLET} Click Button **Set GrowID**\n` +
      `${BULLET} Click Button **My Info** To Check Your Information\n` +
      `${BULLET} Click Button **Deposit** To See World Deposit\n` +
      `${BULLET} Click Button **Buy** For Buying The Items`;
    const embed = new EmbedBuilder()
      .setTitle('PRODUCT LIST')
      .setDescription(
        `Last Update: ${lastUpdate}\n` +
        '--------------------------------------------\n' +
        productLines +
        '\n' +
        howToBuy
      )
      .setColor(RED)
      .setImage('https://media.discordapp.net/attachments/1225818847672537139/1251395315697979393/standard.gif?ex=68787e35&is=68772cb5&hm=1c528e9fe3ec08dcb5fdb63c0534c91ba4a847363a6cbd1a297e17b8cd576309&=');
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('buy')
        .setLabel('Buy')
        .setEmoji('🛒')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('set_growid')
        .setLabel('Set GrowID')
        .setEmoji('<:char:1239164095396319252>')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('my_info')
        .setLabel('My Info')
        .setEmoji('ℹ️')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('deposit')
        .setLabel('Deposit')
        .setEmoji('<:mcworld:1240203040317767739>')
        .setStyle(ButtonStyle.Secondary)
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
