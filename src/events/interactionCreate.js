const { Events, MessageFlags } = require('discord.js');
const { handleButtonInteraction } = require('../handlers/buttonHandlers');
const { handleModalInteraction } = require('../handlers/modalHandlers');
const { handleSelectMenuInteraction } = require('../handlers/selectMenuHandlers');

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		console.log('Interaction received:', interaction.type, interaction.customId || interaction.commandName);
		
		if (interaction.isButton()) {
			await handleButtonInteraction(interaction);
			return;
		}

		if (interaction.isModalSubmit()) {
			await handleModalInteraction(interaction);
			return;
		}

		if (interaction.isStringSelectMenu()) {
			await handleSelectMenuInteraction(interaction);
			return;
		}

		if (!interaction.isChatInputCommand()) return;

		const command = interaction.client.commands.get(interaction.commandName);

		if (!command) {
			console.error(`No command matching ${interaction.commandName} was found.`);
			return;
		}

		try {
			await command.execute(interaction);
		} catch (error) {
			console.error(error);
			if (interaction.replied || interaction.deferred) {
				await interaction.followUp({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
			} else {
				await interaction.reply({ content: 'There was an error while executing this command!', flags: MessageFlags.Ephemeral });
			}
		}
	},
};