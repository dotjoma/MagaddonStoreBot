const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../../middleware/adminCheck');
const { isAuthorizedUser } = require('../../middleware/authorizedUser');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const { v5: uuidv5 } = require('uuid');
const DISCORD_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const { RED } = require('../../colors/discordColors');
const { WORLDLOCK, CHECK, REDARROW, ALERT, DIAMONDLOCK, BGL } = require('../../emojis/discordEmojis');
const { replyAdminError } = require('../../utils/embedHelpers');

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

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addbalance')
    .setDescription('Add world locks to a user (admin only)')
    .addUserOption(option =>
      option.setName('user').setDescription('User to add balance to').setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount').setDescription('Amount to add').setRequired(true)),
  async execute(interaction) {
    if (!(isAdmin(interaction.member) && isAuthorizedUser(interaction.user.id))) {
      await replyAdminError(interaction);
      return;
    }
    const userObj = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    if (amount <= 0) {
      await interaction.reply({ content: `${ALERT} Amount must be greater than 0.`, flags: MessageFlags.Ephemeral });
      return;
    }
    // Find user by Discord ID (UUID v5)
    const uuidId = uuidv5(String(userObj.id), DISCORD_NAMESPACE);
    const { data: user, error: fetchError } = await supabase
      .from('users')
      .select('id, username, world_lock')
      .eq('id', uuidId)
      .single();
    if (fetchError || !user) {
      await interaction.reply({ content: `${ALERT} User not found in database.`, flags: MessageFlags.Ephemeral });
      return;
    }
    const newBalance = (user.world_lock || 0) + amount;
    const { error } = await supabase
      .from('users')
      .update({ world_lock: newBalance })
      .eq('id', uuidId);
    if (error) {
      await interaction.reply({ content: `${ALERT} Failed to add balance.`, flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ content: `${REDARROW} Added ${formatPriceWithEmojis(amount, WORLDLOCK)} to <@${userObj.id}>. New balance: ${formatPriceWithEmojis(newBalance, WORLDLOCK)}.`, flags: MessageFlags.Ephemeral });
    // Send embed to the channel
    const embed = new EmbedBuilder()
      .setTitle(`${CHECK} Balance Added`)
      .setDescription(`${REDARROW} Successfully added **${formatPriceWithEmojis(amount, WORLDLOCK)}** to <@${userObj.id}>.\n${REDARROW} New Balance: **${formatPriceWithEmojis(newBalance, WORLDLOCK)}**`)
      .setColor(RED);
    await interaction.channel.send({ embeds: [embed] });
  },
}; 