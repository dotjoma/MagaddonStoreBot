const { Events } = require('discord.js');
const { setBotStatusAndActivity } = require('../status/botStatus');
const { restoreStockAutoUpdate } = require('../commands/slashcommands/stock');

module.exports = {
	name: Events.ClientReady,
	once: true,
	execute: async function(client) {
		console.log(`Ready! Logged in as ${client.user.tag}`);
		// Set bot status and activity
		setBotStatusAndActivity(client);
		// Restore and start auto-updating stock messages
		await restoreStockAutoUpdate(client);
	}
};