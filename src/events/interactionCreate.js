const { Events, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { createUser, setGrowID, getUserBalance } = require('../services/userService');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { RED } = require('../colors/discordColors');
const { v5: uuidv5 } = require('uuid');
const DISCORD_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const { getWorldName } = require('../services/configService');

const setGrowIdRow = new ActionRowBuilder().addComponents(
	new ButtonBuilder()
		.setCustomId('set_growid')
		.setLabel('Set GrowID')
		.setStyle(ButtonStyle.Secondary)
		.setEmoji('🌱')
);

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		if (interaction.isButton()) {
			switch (interaction.customId) {
				case 'buy':
					try {
						const user = await getUserBalance(interaction.user.id);
						if (!user || !user.username) {
							await interaction.reply({
								content: 'You are not registered. Please set your GrowID first.',
								components: [setGrowIdRow],
								flags: MessageFlags.Ephemeral
							});
							return;
						}
						await interaction.reply({ content: 'Buy button clicked! (To be implemented)', flags: MessageFlags.Ephemeral });
					} catch (error) {
						await interaction.reply({
							content: 'You are not registered. Please set your GrowID first.',
							components: [setGrowIdRow],
							flags: MessageFlags.Ephemeral
						});
					}
					break;
				case 'set_growid': {
					const discordId = interaction.user.id;
					const uuidId = uuidv5(String(discordId), DISCORD_NAMESPACE);
					const { data: existingUser } = await supabase
						.from('users')
						.select('id, email')
						.eq('id', uuidId)
						.single();

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
					break;
				}
				case 'my_info':
				case 'my_balance': {
					try {
						const user = await getUserBalance(interaction.user.id);
						if (!user || !user.username) {
							await interaction.reply({
								content: 'You are not registered. Please set your GrowID first.',
								components: [setGrowIdRow],
								flags: MessageFlags.Ephemeral
							});
							return;
						}
						const embed = new EmbedBuilder()
							.setTitle('Your Info')
							.setColor(RED)
							.setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
							.addFields([
								{ name: 'GrowID', value: user.growid ? '```' + user.growid + '```' : '*(not set)*', inline: false },
								{ name: 'World Lock', value: '```' + String(user.world_lock ?? 0) + '```', inline: false },
								{ name: 'Total Spent', value: '```' + String(user.total_spent ?? 0) + '```', inline: false }
							]);
						await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
					} catch (error) {
						if (
							(error.message && (
								error.message.includes('No rows') ||
								error.message.includes('multiple (or no) rows') ||
								error.message.includes('Results contain 0 rows')
							)) ||
							error.code === 'PGRST116'
						) {
							await interaction.reply({
								content: 'You are not registered. Please set your GrowID first.',
								components: [setGrowIdRow],
								flags: MessageFlags.Ephemeral
							});
						} else {
							console.error('Balance fetch error:', error);
							await interaction.reply({ content: 'Could not fetch your info. Please try again later.', flags: MessageFlags.Ephemeral });
						}
					}
					break;
				}
				case 'deposit': {
					try {
						const user = await getUserBalance(interaction.user.id);
						if (!user || !user.username) {
							await interaction.reply({
								content: 'You are not registered. Please set your GrowID first.',
								components: [setGrowIdRow],
								flags: MessageFlags.Ephemeral
							});
							return;
						}
						const worldName = await getWorldName();
						if (!worldName) {
							await interaction.reply({ content: 'No world name is set for deposit.', flags: MessageFlags.Ephemeral });
							return;
						}
						const embed = new EmbedBuilder()
							.setTitle('Deposit World')
							.setDescription('Please deposit to the following world:')
							.setColor(RED)
							.addFields([
								{ name: 'World Name', value: '```' + worldName + '```', inline: false }
							]);
						await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
					} catch (error) {
						await interaction.reply({
							content: 'You are not registered. Please set your GrowID first.',
							components: [setGrowIdRow],
							flags: MessageFlags.Ephemeral
						});
					}
					break;
				}
				default:
					await interaction.reply({ content: 'Unknown button.', flags: MessageFlags.Ephemeral });
			}
			return;
		}

		if (interaction.isModalSubmit() && interaction.customId === 'set_growid_modal') {
			const growid = interaction.fields.getTextInputValue('growid').toLowerCase();
			const emailInput = interaction.fields.fields.get('email')?.value;
			const email = emailInput || 'not set';
			const username = interaction.user.username;
			const discordId = interaction.user.id;
			const uuidId = uuidv5(String(discordId), DISCORD_NAMESPACE);
			const password = crypto.randomBytes(16).toString('base64url');

			// Email validation (only if provided)
			if (emailInput && !/^\S+@\S+\.\S+$/.test(emailInput)) {
				await interaction.reply({ content: 'Invalid email address. Please enter a valid email (e.g., user@example.com).', flags: MessageFlags.Ephemeral });
				return;
			}

			const { data: existingUser } = await supabase
				.from('users')
				.select('id, email')
				.eq('id', uuidId)
				.single();

			try {
				if (!existingUser) {
					await createUser({
						id: discordId,
						email,
						username,
						password,
						growid
					});
					await interaction.reply({ content: 'Registration successful! Check your DMs for your credentials.', flags: MessageFlags.Ephemeral });

					const embed = new EmbedBuilder()
						.setTitle('Your Account Credentials')
						.setDescription('You can use these credentials to log in to the Magaddon store website.')
						.setColor(RED)
						.addFields([
							{ name: 'Username', value: '```' + username + '```', inline: false },
							{ name: 'Email', value: email === 'not set' ? '*(not set)*' : '```' + email + '```', inline: false },
							{ name: 'GrowID', value: '```' + growid + '```', inline: false },
							{ name: 'Password', value: `||${password}||`, inline: false }
						]);

					await interaction.user.send({ embeds: [embed] });

				} else {
					await setGrowID(discordId, growid);
					await interaction.reply({ content: 'Your GrowID has been updated!', flags: MessageFlags.Ephemeral });
				}
			} catch (error) {
				console.error('Registration error:', error);
				let errorMsg = 'Registration or update failed. Please try again or contact support.';
				if (error.message === 'Email is already registered.') {
					errorMsg = 'That email is already registered. Please use a different email.';
				} else if (error.message === 'Username is already taken.') {
					errorMsg = 'That username is already taken. Please change your Discord username and try again.';
				}
				await interaction.reply({ content: errorMsg, flags: MessageFlags.Ephemeral });
			}
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