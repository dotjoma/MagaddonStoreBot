const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { getUserById } = require('../../services/supabaseService');
const { BLACK, CRIMSON_RED } = require('../../colors/discordColors');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('getuser')
    .setDescription('Get a user from Supabase')
    .addStringOption(option =>
      option.setName('id').setDescription('User ID').setRequired(true)),
  async execute(interaction) {
    const id = interaction.options.getString('id');
    try {
      const user = await getUserById(id);
      if (user) {
        // Exclude password field
        const { password, ...userWithoutPassword } = user;
        // Create embed fields from user data
        const fields = Object.entries(userWithoutPassword).map(([key, value]) => ({
          name: key.charAt(0).toUpperCase() + key.slice(1),
          value: value ? String(value) : 'N/A',
          inline: true
        }));
        const embed = new EmbedBuilder()
          .setTitle('User Information')
          .setColor(CRIMSON_RED)
          .addFields(fields);
        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply({ content: 'User not found.', flags: MessageFlags.Ephemeral });
      }
    } catch (error) {
      await interaction.reply({ content: 'Error fetching user.', flags: MessageFlags.Ephemeral });
    }
  },
};