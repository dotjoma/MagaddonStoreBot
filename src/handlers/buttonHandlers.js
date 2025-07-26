const { EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { getUserBalance, getUserWithRoleAndCreatedAt } = require('../services/userService');
const { getAllProductsWithStock } = require('../services/productService');
const { getWorldName, getOwnerName, getBotName } = require('../services/configService');
const { RED } = require('../colors/discordColors');
const { v5: uuidv5 } = require('uuid');
const DISCORD_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const { WORLDLOCK, CHAR, SHOPCART, STATUSONLINE, OWNER, DONATION, ALERT } = require('../emojis/discordEmojis');
const { getSetGrowIdRow, replyAdminError } = require('../utils/embedHelpers');

// Button cooldown configuration (in milliseconds)
const BUTTON_COOLDOWN = 5 * 1000; // 5 seconds

// Map to track button cooldowns per user
const buttonCooldowns = new Map();

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

const buttonHandlers = {};

buttonHandlers['buy'] = async (interaction) => {
  try {
    let user;
    try {
      user = await getUserBalance(interaction.user.id);
    } catch (error) {
      if (error.code === 'PGRST116') {
        const notRegisteredEmbed = new EmbedBuilder()
          .setTitle('❌ Registration Required')
          .setDescription('It looks like you haven\'t registered yet. Let\'s get you started!')
          .setColor(RED)
          .addFields([
            {
              name: '🔧 What to do next:',
              value: [
                '• Click the button below to set your GrowID',
                '• Make sure your GrowID is correct',
                '• Then you can access product purchases'
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
      await interaction.reply({ content: 'No products available.', flags: MessageFlags.Ephemeral });
      return;
    }
    const options = products.map(p => ({
      label: `${p.name} (${p.stock} in stock)` + (p.price ? ` - ${p.price} WL` : ''),
      value: String(p.id),
      description: p.code ? `Code: ${p.code}` : undefined
    })).slice(0, 25);
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('buy_product_select')
      .setPlaceholder('Select a product to buy')
      .addOptions(options);
    const row = new ActionRowBuilder().addComponents(selectMenu);
    await interaction.reply({
      content: 'Select a product to buy:',
      components: [row],
      flags: MessageFlags.Ephemeral
    });
  } catch (error) {
    console.error('Error in buy button handler:', error);
    await interaction.reply({ content: 'An error occurred while starting your purchase. Please try again or contact support.', flags: MessageFlags.Ephemeral });
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

  if (!existingUser) {
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
        .setTitle('🚫 Not Registered')
        .setDescription('You need to set your GrowID to access your information.')
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
      .setTitle(`${interaction.user.displayName}'s Information`)
      .setColor(RED)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields([
        {
          name: `${CHAR} GrowID`,
          value: `\
\
yaml\n${user.growid || 'Not Set'}\
\
`,
          inline: true
        },
        {
          name: `${WORLDLOCK} World Locks`,
          value: `\
\
css\n${worldLockCount} WL\
\
`,
          inline: true
        },
        {
          name: `${SHOPCART} Total Spent`,
          value: `\
\
css\n${totalSpent} WL\
\
`,
          inline: true
        },
        {
          name: `${STATUSONLINE} Account Stats`,
          value: [
            `• **Registration Status:** Verified`,
            `• **Account Type:** ${accountType}`,
            `• **Member Since:** ${memberSince}`
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
        .setTitle('❌ Registration Required')
        .setDescription('It looks like you haven\'t registered yet. Let\'s get you started!')
        .setColor(RED)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .addFields([
          {
            name: '🔧 What to do next:',
            value: [
              '• Click the button below to set your GrowID',
              '• Make sure your GrowID is correct',
              '• Start enjoying our services!'
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
        .setTitle('⚠️ System Error')
        .setDescription('We encountered an issue while fetching your information.')
        .setColor(RED)
        .addFields([
          {
            name: '🔄 What you can try:',
            value: [
              '• Wait a moment and try again',
              '• Check your internet connection',
              '• Contact support if the issue persists'
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
        .setTitle('🚫 Not Registered')
        .setDescription('You need to set your GrowID to access deposit information.')
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
      .setTitle(`${interaction.user.displayName}'s Deposit Instructions`)
      .setDescription(
        `• **Depo World**: \`${worldName || 'Not set'}\` ${DONATION}\n` +
        `• **Owner Name**: \`${ownerName || 'Not set'}\` ${OWNER}\n` +
        `• **Bot Name**: \`${botName || 'Not set'}\` ${CHAR}`
      )
      .setColor(RED)
      .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
      .addFields([
        {
          name: `${SHOPCART} Deposit Instructions`,
          value: [
            `• **Step 1:** Visit the world \`${worldName}\``,
            `• **Step 2:** Place your World Locks to donation box`,
            `• **Step 3:** Take a screenshot as proof`,
            `• **Step 4:** Wait for automatic processing`
          ].join('\n'),
          inline: false
        },
        {
          name: `⚠️ Important Notes`,
          value: [
            `• **Always screenshot** your deposit for proof`,
            `• Processing time: Usually within **5-10 minutes**`,
            `• Contact support if your deposit isn't processed`,
            `• Only deposit World Locks, other items won't be credited`
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
        .setTitle('❌ Registration Required')
        .setDescription('It looks like you haven\'t registered yet. Let\'s get you started!')
        .setColor(RED)
        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
        .addFields([
          {
            name: '🔧 What to do next:',
            value: [
              '• Click the button below to set your GrowID',
              '• Make sure your GrowID is correct',
              '• Then you can access deposit information'
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
        .setTitle('⚠️ System Error')
        .setDescription('We encountered an issue while fetching deposit information.')
        .setColor(RED)
        .addFields([
          {
            name: '🔄 What you can try:',
            value: [
              '• Wait a moment and try again',
              '• Check your internet connection',
              '• Contact support if the issue persists'
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
      content: '❌ This button has expired. Please use a fresh stock message.', 
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
    await interaction.reply({ content: 'Unknown button.', flags: MessageFlags.Ephemeral });
  }
}

module.exports = { buttonHandlers, handleButtonInteraction };
