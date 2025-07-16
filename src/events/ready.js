const { Events, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getAllProductsWithStock } = require('../services/productService');
const { BLACK, RED } = require('../colors/discordColors');
const { setBotStatusAndActivity } = require('../status/botStatus');

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute: async function(client) {
		console.log(`Ready! Logged in as ${client.user.tag}`);

		// Set bot status and activity
		setBotStatusAndActivity(client);

		const channelId = process.env.BUYHERE_CHANNEL_ID;
		if (!channelId) {
			console.error('BUYHERE_CHANNEL_ID is not set in .env');
			return;
		}
		const channel = await client.channels.fetch(channelId).catch(() => null);
		if (!channel || !channel.isTextBased()) {
			console.error('BUYHERE_CHANNEL_ID is invalid or not a text channel');
			return;
		}

		// Bulk delete messages (Discord only allows up to 100 at a time)
		let messages;
		do {
			messages = await channel.messages.fetch({ limit: 100 });
			if (messages.size > 0) {
				await channel.bulkDelete(messages, true).catch(() => {});
			}
		} while (messages.size === 100);

		// Fetch product stock from inventory
		let products;
		try {
			products = await getAllProductsWithStock();
		} catch (err) {
			console.error('Failed to fetch products:', err);
			await channel.send('Failed to fetch product stock.');
			return;
		}

		if (!products || products.length === 0) {
			await channel.send('No products in stock.');
			return;
		}

		// Emoji placeholders (replace with custom emoji IDs if available)
		const ACROWN = ':crown:';
		const WORLDLOCK = ':gem:';
		const ONLINE = ':green_circle:';
		const AWARN = ':warning:';
		const BULLET = '•';

		// Get current time for last update (Discord relative timestamp)
		const lastUpdate = `<t:${Math.floor(Date.now() / 1000)}:R>`;

		const productLines = products.map(p =>
		  `${ACROWN} **${(p.name || '').toUpperCase()}** ${ACROWN}\n` +
		  `${BULLET} Code: \`${p.code || p.id}\`\n` +
		  `${BULLET} Stock: **${p.stock ?? 0}**\n` +
		  `${BULLET} Price: **${p.price ?? 'N/A'}**\n` +
		  '--------------------------------------------'
		).join('\n');

		const howToBuy =
		  `${AWARN} **HOW TO BUY** ${AWARN}\n` +
		  `${BULLET} Click Button **Set GrowID**\n` +
		  `${BULLET} Click Button **My Info** To Check Your Information\n` +
		  `${BULLET} Click Button **Deposit** To See World Deposit\n` +
		  `${BULLET} Click Button **Buy** For Buying The Items`;

		const embed = new EmbedBuilder()
			.setTitle(`${ACROWN} PRODUCT LIST ${ACROWN}`)
			.setDescription(
				`Last Update: ${lastUpdate}\n` +
				'--------------------------------------------\n' +
				productLines +
				'\n' +
				howToBuy
			)
			.setColor(RED)
			.setImage('https://media.discordapp.net/attachments/1225818847672537139/1251395315697979393/standard.gif?ex=68787e35&is=68772cb5&hm=1c528e9fe3ec08dcb5fdb63c0534c91ba4a847363a6cbd1a297e17b8cd576309&=');

		const row = new ActionRowBuilder().addComponents(
			new ButtonBuilder()
				.setCustomId('buy')
				.setLabel('Buy')
				.setEmoji('🛒')
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId('set_growid')
				.setLabel('Set GrowID')
				.setEmoji('🌱')
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId('my_balance')
				.setLabel('My Info')
				.setEmoji('ℹ️')
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId('deposit')
				.setLabel('Deposit')
				.setEmoji('➕')
				.setStyle(ButtonStyle.Secondary)
		);

		await channel.send({ embeds: [embed], components: [row] });
	}
};