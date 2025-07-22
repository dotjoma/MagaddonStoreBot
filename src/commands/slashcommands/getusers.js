const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getAllUsers } = require('../../services/supabaseService');
const { isAdmin } = require('../../middleware/adminCheck');
const { isAuthorizedUser } = require('../../middleware/authorizedUser');
const { BLACK, CRIMSON_RED, RED } = require('../../colors/discordColors');
const { replyAdminError } = require('../../utils/embedHelpers');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('getusers')
    .setDescription('Retrieve all users from the Supabase users table'),
  async execute(interaction) {
    if (!(isAdmin(interaction.member) && isAuthorizedUser(interaction.user.id))) {
      await replyAdminError(interaction);
      return;
    }
    try {
      const users = await getAllUsers();
      if (!users || users.length === 0) {
        await interaction.reply('No users found.');
      } else {
        // Prepare embed fields for up to 10 users
        const fields = users.slice(0, 10).map(u => ({
          name: u.username ? u.username : u.id,
          value: `ID: ${u.id}\nName: ${u.username || 'N/A'}`,
          inline: false
        }));
        const embed = new EmbedBuilder()
          .setTitle('User List')
          .setColor(RED)
          .addFields(fields)
          .setFooter({ text: users.length > 10 ? `Showing 10 of ${users.length} users` : `Total users: ${users.length}` });
        await interaction.reply({ embeds: [embed] });
      }
    } catch (error) {
      await interaction.reply('Error fetching users.');
    }
  },
};