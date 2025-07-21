require('dotenv').config();
const { REST, Routes } = require('discord.js');
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID;
const token = process.env.BOT_TOKEN;

const fs = require('node:fs');
const path = require('node:path');

const commands = [];
// Grab all the command folders from the commands directory you created earlier
const foldersPath = path.join(__dirname, 'commands');
const commandFolders = fs.readdirSync(foldersPath);

for (const folder of commandFolders) {
	// Grab all the command files from the commands directory you created earlier
	const commandsPath = path.join(foldersPath, folder);
	const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
	// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
	for (const file of commandFiles) {
		const filePath = path.join(commandsPath, file);
		const command = require(filePath);
		if ('data' in command && 'execute' in command) {
			commands.push(command.data.toJSON());
		} else {
			console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
		}
	}
}

// Construct and prepare an instance of the REST module
const rest = new REST().setToken(token);

// Remove all global and guild commands before deploying new ones
async function clearAllCommands() {
	try {
		// Remove all global commands
		await rest.put(Routes.applicationCommands(clientId), { body: [] });
		console.log('Cleared all global commands.');
	} catch (e) {
		console.warn('No global commands to clear or error clearing global commands:', e.message);
	}
	try {
		// Remove all guild commands
		await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
		console.log('Cleared all guild commands.');
	} catch (e) {
		console.warn('No guild commands to clear or error clearing guild commands:', e.message);
	}
}

// and deploy your commands!
(async () => {
	try {
		await clearAllCommands();
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(
			Routes.applicationGuildCommands(clientId, guildId),
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();