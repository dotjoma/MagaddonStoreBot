const { EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { getUserBalance, getUserWithRoleAndCreatedAt } = require('../services/userService');
const { getAllProductsWithStock } = require('../services/productService');
const { getWorldName, getOwnerName, getBotName } = require('../services/configService');
const { RED } = require('../colors/discordColors');
const { v5: uuidv5 } = require('uuid');
const DISCORD_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const { WORLDLOCK, CHAR, SHOPCART, STATUSONLINE, OWNER, DONATION, ALERT, WHITECROWN, INFO, REDARROW, MONEYBAG, CYANARROW, DIAMONDLOCK, BGL } = require('../emojis/discordEmojis');
const { getSetGrowIdRow, replyAdminError } = require('../utils/embedHelpers');

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

// Button cooldown configuration (in milliseconds)
const BUTTON_COOLDOWN = 5 * 1000; // 5 seconds
const PURCHASE_COOLDOWN = 10 * 1000; // 10 seconds for purchases

// Map to track button cooldowns per user
const buttonCooldowns = new Map();
// Map to track purchase cooldowns per user
const purchaseCooldowns = new Map();

// Function to check if button is on cooldown for a user
function isButtonOnCooldown(userId, buttonId) {
  const userCooldowns = buttonCooldowns.get(userId) || {};
  const lastClickTime = userCooldowns[buttonId];
  
  if (!lastClickTime) return false;
  
  const timeSinceLastClick = Date.now() - lastClickTime;
  return timeSinceLastClick < BUTTON_COOLDOWN;
}

// Function to set button cooldown for a user
function setButtonCooldown(userId, buttonId) {
  if (!buttonCooldowns.has(userId)) {
    buttonCooldowns.set(userId, {});
  }
  buttonCooldowns.get(userId)[buttonId] = Date.now();
  
  // Clean up cooldown after it expires
  setTimeout(() => {
    const userCooldowns = buttonCooldowns.get(userId);
    if (userCooldowns) {
      delete userCooldowns[buttonId];
      if (Object.keys(userCooldowns).length === 0) {
        buttonCooldowns.delete(userId);
      }
    }
  }, BUTTON_COOLDOWN);
}

// Function to get remaining cooldown time
function getRemainingCooldown(userId, buttonId) {
  const userCooldowns = buttonCooldowns.get(userId) || {};
  const lastClickTime = userCooldowns[buttonId];
  
  if (!lastClickTime) return 0;
  
  const timeSinceLastClick = Date.now() - lastClickTime;
  return Math.max(0, BUTTON_COOLDOWN - timeSinceLastClick);
}

// Function to check if purchase is on cooldown for a user
function isPurchaseOnCooldown(userId) {
  const lastPurchaseTime = purchaseCooldowns.get(userId);
  
  if (!lastPurchaseTime) return false;
  
  const timeSinceLastPurchase = Date.now() - lastPurchaseTime;
  return timeSinceLastPurchase < PURCHASE_COOLDOWN;
}

// Function to set purchase cooldown for a user
function setPurchaseCooldown(userId) {
  purchaseCooldowns.set(userId, Date.now());
  
  // Clean up cooldown after it expires
  setTimeout(() => {
    purchaseCooldowns.delete(userId);
  }, PURCHASE_COOLDOWN);
}

// Function to get remaining purchase cooldown time
function getRemainingPurchaseCooldown(userId) {
  const lastPurchaseTime = purchaseCooldowns.get(userId);
  
  if (!lastPurchaseTime) return 0;
  
  const timeSinceLastPurchase = Date.now() - lastPurchaseTime;
  return Math.max(0, PURCHASE_COOLDOWN - timeSinceLastPurchase);
}

const buttonHandlers = {};

buttonHandlers['buy'] = async (interaction) => {
  try {
    let user;
    try {
      user = await getUserBalance(interaction.user.id);
    } catch (error) {
      if (error.code === 'PGRST116') {
        const notRegisteredEmbed = new EmbedBuilder()
          .setTitle(`${ALERT} Registration Required`)
          .setDescription('It looks like you haven\'t registered yet. Let\'s get you started!')
          .setColor(RED)
          .addFields([
            {
              name: `${INFO} What to do next:`,
              value: [
                `${REDARROW} Click the button below to set your GrowID`,
                `${REDARROW} Make sure your GrowID is correct`,
                `${REDARROW} Then you can access product purchases`
              ].join('\n'),
              inline: false
            }
          ])
          .setFooter({
            text: 'Need help? Contact our support team',
            iconURL: interaction.client.user.displayAvatarURL()
          })
          .setTimestamp();
        await interaction.reply({
          embeds: [notRegisteredEmbed],
          components: [getSetGrowIdRow()],
          flags: MessageFlags.Ephemeral
        });
        return;
      }
      throw error;
    }
    const products = await getAllProductsWithStock();
    if (!products || products.length === 0) {
      await interaction.reply({ content: `${ALERT} No products available.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const options = products.map(p => ({
      label: `${p.name.toUpperCase()}`,
      value: String(p.id),
      description: `${p.price} WorldLock | Code: ${p.code} | Stock: ${p.stock}`,
      emoji: CYANARROW
    })).slice(0, 25);
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('buy_product_select')
      .setPlaceholder('Select a product to buy')
      .addOptions(options);
    const row = new ActionRowBuilder().addComponents(selectMenu);
    const buyEmbed = new EmbedBuilder()
      .setTitle(`${WHITECROWN} Product Selection ${WHITECROWN}`)
      .setDescription(`${REDARROW} Choose a product from the menu below to start your purchase.`)
      .setColor(RED)
      .addFields([
        {
          name: 'Available Products',
          value: String(products.length),
          inline: true
        },
        {
          name: 'Your Balance',
          value: `${formatPriceWithEmojis(user.world_lock || 0, WORLDLOCK)}`,
          inline: true
        }
      ])
      .setFooter({
        text: 'Magaddon Store • Select your product',
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();
    await interaction.reply({
      embeds: [buyEmbed],
      components: [row],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.error('Error in buy button handler:', error);
    await interaction.reply({ content: `${ALERT} An error occurred while starting your purchase. Please try again or contact support.`, flags: MessageFlags.Ephemeral });
  }
};

buttonHandlers['set_growid'] = async (interaction) => {
  const discordId = interaction.user.id;
  const uuidId = uuidv5(String(discordId), DISCORD_NAMESPACE);
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, email')
    .eq('id', uuidId)
    .single();

  const { ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
  const modal = new ModalBuilder()
    .setCustomId('set_growid_modal')
    .setTitle('Set GrowID');

  const growidInput = new TextInputBuilder()
    .setCustomId('growid')
    .setLabel('GrowID')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  if (!existingUser || !existingUser.email) {
    const emailInput = new TextInputBuilder()
      .setCustomId('email')
      .setLabel('Email (optional, for website login)')
      .setStyle(TextInputStyle.Short)
      .setRequired(false);
    modal.addComponents(
      new ActionRowBuilder().addComponents(growidInput),
      new ActionRowBuilder().addComponents(emailInput)
    );
  } else {
    modal.addComponents(
      new ActionRowBuilder().addComponents(growidInput)
    );
  }
  await interaction.showModal(modal);
};

buttonHandlers['my_info'] = async (interaction) => {
  try {
    const user = await getUserWithRoleAndCreatedAt(interaction.user.id);
    if (!user || !user.username) {
      const notRegisteredEmbed = new EmbedBuilder()
        .setTitle(`${ALERT} Not Registered`)
        .setDescription(`${REDARROW} You need to set your GrowID to access your information.`)
        .setColor(RED)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setFooter({
          text: 'Click the button below to get started',
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();
      await interaction.reply({
        embeds: [notRegisteredEmbed],
        components: [getSetGrowIdRow()],
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const formatNumber = (num) => new Intl.NumberFormat('en-US').format(num || 0);
    const getStatusBadge = (totalSpent) => {
      if (totalSpent >= 10000) return '👑 VIP Customer';
      if (totalSpent >= 5000) return '💎 Premium User';
      if (totalSpent >= 1000) return '⭐ Valued Customer';
      return '🌱 New Customer';
    };
    const statusBadge = getStatusBadge(user.total_spent || 0);
    const worldLockCount = formatNumber(user.world_lock || 0);
    const totalSpent = formatNumber(user.total_spent || 0);
    const accountType = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Unknown';
    const memberSince = user.created_at ? `<t:${Math.floor(new Date(user.created_at).getTime() / 1000)}:R>` : 'Unknown';
    const userInfoEmbed = new EmbedBuilder()
      .setTitle(`${WHITECROWN} ${interaction.user.displayName}'s Information ${WHITECROWN}`)
      .setColor(RED)
      .addFields([
        {
          name: `${CHAR} GrowID`,
          value: `${user.growid || 'Not Set'}`,
          inline: true
        },
        {
          name: `${MONEYBAG} BALANCE`,
          value: `${formatPriceWithEmojis(user.world_lock || 0, WORLDLOCK)}`,
          inline: true
        },
        {
          name: `${SHOPCART} Total Spent`,
          value: `${formatPriceWithEmojis(user.total_spent || 0, WORLDLOCK)}`,
          inline: true
        },
        {
          name: '',
          value: `${REDARROW} **Member Since:** ${memberSince}`,
          inline: false
        }
      ])
      .setFooter({
        text: 'Magaddon Store • Your trusted marketplace',
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();
    await interaction.reply({
      embeds: [userInfoEmbed],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.error('User info fetch error:', error);
    const isRegistrationError = (
      (error.message && (
        error.message.includes('No rows') ||
        error.message.includes('multiple (or no) rows') ||
        error.message.includes('Results contain 0 rows')
      )) ||
      error.code === 'PGRST116'
    );
    if (isRegistrationError) {
      const registrationErrorEmbed = new EmbedBuilder()
        .setTitle(`${ALERT} Registration Required`)
        .setDescription(`${REDARROW} It looks like you haven't registered yet. Let's get you started!`)
        .setColor(RED)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .addFields([
          {
            name: `${INFO} What to do next:`,
            value: [
              `${REDARROW} Click the button below to set your GrowID`,
              `${REDARROW} Make sure your GrowID is correct`,
              `${REDARROW} Start enjoying our services!`
            ].join('\n'),
            inline: false
          }
        ])
        .setFooter({
          text: 'Need help? Contact our support team',
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();
      await interaction.reply({
        embeds: [registrationErrorEmbed],
        components: [getSetGrowIdRow()],
        flags: MessageFlags.Ephemeral
      });
    } else {
      const systemErrorEmbed = new EmbedBuilder()
        .setTitle(`${ALERT} System Error`)
        .setDescription(`${REDARROW} We encountered an issue while fetching your information.`)
        .setColor(RED)
        .addFields([
          {
            name: `${INFO} What you can try:`,
            value: [
              `${REDARROW} Wait a moment and try again`,
              `${REDARROW} Check your internet connection`,
              `${REDARROW} Contact support if the issue persists`
            ].join('\n'),
            inline: false
          }
        ])
        .setFooter({
          text: 'Error ID: ' + Date.now(),
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();
      await interaction.reply({
        embeds: [systemErrorEmbed],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

buttonHandlers['deposit'] = async (interaction) => {
  try {
    const user = await getUserWithRoleAndCreatedAt(interaction.user.id);
    if (!user || !user.username) {
      const notRegisteredEmbed = new EmbedBuilder()
        .setTitle(`${ALERT} Not Registered`)
        .setDescription(`${REDARROW} You need to set your GrowID to access deposit information.`)
        .setColor(RED)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .setFooter({
          text: 'Click the button below to get started',
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();
      await interaction.reply({
        embeds: [notRegisteredEmbed],
        components: [getSetGrowIdRow()],
        flags: MessageFlags.Ephemeral
      });
      return;
    }
    const [worldName, ownerName, botName] = await Promise.all([
      getWorldName(),
      getOwnerName(),
      getBotName()
    ]);
    const depositEmbed = new EmbedBuilder()
      .setTitle(`${WHITECROWN} ${interaction.user.displayName}'s Deposit Instructions ${WHITECROWN}`)
      .setDescription(
        `${REDARROW} **Depo World**: \`${worldName || 'Not set'}\`\n` +
        `${REDARROW} **Owner Name**: \`${ownerName || 'Not set'}\`\n` +
        `${REDARROW} **Bot Name**: \`${botName || 'Not set'}\``
      )
      .setColor(RED)
      .addFields([
        {
          name: `${INFO} Important Notes ${INFO}`,
          value: [
            `${REDARROW} **Always screenshot** your deposit for proof.`,
            `${REDARROW} Processing time: Usually within **1-5 seconds.**`,
            `${REDARROW} Contact support if your deposit isn't processed.`,
            `${REDARROW} Only deposit World Locks, other items won't be credited.`
          ].join('\n'),
          inline: false
        }
      ])
      .setFooter({
        text: 'Magaddon Store • Your trusted marketplace',
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTimestamp();
    await interaction.reply({
      embeds: [depositEmbed],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.error('Deposit info fetch error:', error);
    const isRegistrationError = (
      (error.message && (
        error.message.includes('No rows') ||
        error.message.includes('multiple (or no) rows') ||
        error.message.includes('Results contain 0 rows')
      )) ||
      error.code === 'PGRST116'
    );
    if (isRegistrationError) {
      const registrationErrorEmbed = new EmbedBuilder()
        .setTitle(`${ALERT} Registration Required`)
        .setDescription(`${REDARROW} It looks like you haven't registered yet. Let's get you started!`)
        .setColor(RED)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .addFields([
          {
            name: `${INFO} What to do next:`,
            value: [
              `${REDARROW} Click the button below to set your GrowID`,
              `${REDARROW} Make sure your GrowID is correct`,
              `${REDARROW} Then you can access deposit information`
            ].join('\n'),
            inline: false
          }
        ])
        .setFooter({
          text: 'Need help? Contact our support team',
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();
      await interaction.reply({
        embeds: [registrationErrorEmbed],
        components: [getSetGrowIdRow()],
        flags: MessageFlags.Ephemeral
      });
    } else {
      const systemErrorEmbed = new EmbedBuilder()
        .setTitle(`${ALERT} System Error`)
        .setDescription(`${REDARROW} We encountered an issue while fetching deposit information.`)
        .setColor(RED)
        .addFields([
          {
            name: `${INFO} What you can try:`,
            value: [
              `${REDARROW} Wait a moment and try again`,
              `${REDARROW} Check your internet connection`,
              `${REDARROW} Contact support if the issue persists`
            ].join('\n'),
            inline: false
          }
        ])
        .setFooter({
          text: 'Error ID: ' + Date.now(),
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();
      await interaction.reply({
        embeds: [systemErrorEmbed],
        flags: MessageFlags.Ephemeral
      });
    }
  }
};

async function handleButtonInteraction(interaction) {
  // Check if button is disabled (expired)
  if (interaction.component.disabled) {
    await interaction.reply({ 
      content: `${ALERT} This button has expired. Please use a fresh stock message.`, 
      flags: MessageFlags.Ephemeral 
    });
    return;
  }

  // Check button cooldown
  const buttonId = interaction.customId;
  const userId = interaction.user.id;
  
  if (isButtonOnCooldown(userId, buttonId)) {
    const remainingTime = getRemainingCooldown(userId, buttonId);
    const remainingSeconds = Math.ceil(remainingTime / 1000);
    await interaction.reply({ 
      content: `${ALERT} Please wait **${remainingSeconds} seconds** before using this button again.`, 
      flags: MessageFlags.Ephemeral 
    });
    return;
  }
  
  // Set cooldown for this button
  setButtonCooldown(userId, buttonId);

  const handler = buttonHandlers[interaction.customId];
  if (handler) {
    await handler(interaction);
  } else {
    await interaction.reply({ content: `${ALERT} Unknown button.`, flags: MessageFlags.Ephemeral });
  }
}

module.exports = { buttonHandlers, handleButtonInteraction, isPurchaseOnCooldown, setPurchaseCooldown, getRemainingPurchaseCooldown };
