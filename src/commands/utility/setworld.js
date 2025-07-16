const { SlashCommandBuilder } = require('discord.js');
const { isAdmin } = require('../../middleware/adminCheck');
const { setWorldName } = require('../../services/configService');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setworld')
    .setDescription('Set the global world name (admin only)')
    .addStringOption(option =>
      option.setName('name').setDescription('World name').setRequired(true)),
  async execute(interaction) {
    if (!isAdmin(interaction.member)) {
      await interaction.reply({ content: 'You do not have permission to use this command.', flags: 64 });
      return;
    }
    const worldName = interaction.options.getString('world_name');
    if (!worldName || worldName.trim() === '') {
      await interaction.reply({ content: 'World name cannot be empty.', flags: 64 });
      return;
    }
    const worldNameUpper = worldName.toUpperCase();
    try {
      await setWorldName(worldNameUpper);
      await interaction.reply({ content: `Depo world set to: \`${worldNameUpper}\``, flags: 64 });
    } catch (error) {
      await interaction.reply({ content: 'Failed to set depo world.', flags: 64 });
    }
  },
}; 