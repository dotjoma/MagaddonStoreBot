const { SlashCommandBuilder, MessageFlags, EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../../middleware/adminCheck');
const { isAuthorizedUser } = require('../../middleware/authorizedUser');
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const { v5: uuidv5 } = require('uuid');
const DISCORD_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const { RED } = require('../../colors/discordColors');
const { WORLDLOCK } = require('../../emojis/discordEmojis');

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
      await interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
      return;
    }
    const userObj = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');
    if (amount <= 0) {
      await interaction.reply({ content: 'Amount must be greater than 0.', flags: MessageFlags.Ephemeral });
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
      await interaction.reply({ content: 'User not found in database.', flags: MessageFlags.Ephemeral });
      return;
    }
    const newBalance = (user.world_lock || 0) + amount;
    const { error } = await supabase
      .from('users')
      .update({ world_lock: newBalance })
      .eq('id', uuidId);
    if (error) {
      await interaction.reply({ content: 'Failed to add balance.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ content: `Added ${amount} WL to user ${userObj.tag}. New balance: ${newBalance} WL.`, flags: MessageFlags.Ephemeral });
    // Send embed to the channel
    const member = await interaction.guild.members.fetch(userObj.id).catch(() => null);
    const displayName = member ? member.displayName : userObj.tag;
    const embed = new EmbedBuilder()
      .setTitle('Balance Added')
      .setDescription(`• Successfully added **${amount}** ${WORLDLOCK} to **${displayName}**.\n• New Balance: **${newBalance}** ${WORLDLOCK}`)
      .setColor(RED);
    await interaction.channel.send({ embeds: [embed] });
  },
}; 