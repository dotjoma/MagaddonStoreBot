const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { getWorldName } = require('../../services/configService');
const { RED } = require('../../colors/discordColors');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('depo')
    .setDescription('Show the current world name for deposit.'),
  async execute(interaction) {
    try {
      const worldName = await getWorldName();
      if (!worldName) {
        await interaction.reply({ content: 'No world name is set for deposit.', flags: 64 });
        return;
      }
      const embed = new EmbedBuilder()
        .setTitle('Deposit World')
        .setDescription(`Please deposit to the following world:`)
        .setColor(RED)
        .addFields([
          { name: 'World Name', value: '```' + worldName + '```', inline: false }
        ]);
      await interaction.reply({ embeds: [embed], flags: 64 });
    } catch (error) {
      await interaction.reply({ content: 'Failed to fetch the world name.', flags: 64 });
    }
  },
}; 