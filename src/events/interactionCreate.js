const { Events, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const { createUser, setGrowID, getUserBalance, getUserWithRoleAndCreatedAt } = require('../services/userService');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { BLACK, RED } = require('../colors/discordColors');
const { v5: uuidv5, v4: uuidv4 } = require('uuid');
const DISCORD_NAMESPACE = '6ba7b810-9dad-11d1-80b4-00c04fd430c8';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);
const { getWorldName, getOwnerName, getBotName, setWorldName, setOwnerName, setBotName } = require('../services/configService');
const { WORLDLOCK, DIAMONDLOCK, CHAR, SHOPCART, STATUSONLINE, OWNER, DONATION } = require('../emojis/discordEmojis');
const { isAdmin } = require('../middleware/adminCheck');
const { getAllProductsWithStock, getTotalProducts, getActiveListings, getRevenueToday } = require('../services/productService');
const { getAvailableInventoryItems, markInventoryItemsAsSold } = require('../services/inventoryService');
const { deductWorldLocksAndAddSpent } = require('../services/userService');

const setGrowIdRow = new ActionRowBuilder().addComponents(
	new ButtonBuilder()
		.setCustomId('set_growid')
		.setLabel('Set GrowID')
		.setStyle(ButtonStyle.Secondary)
		.setEmoji('<:char:1239164095396319252>')
);

module.exports = {
	name: Events.InteractionCreate,
	async execute(interaction) {
		console.log('Interaction received:', interaction.type, interaction.customId || interaction.commandName);
		if (interaction.isButton()) {
			switch (interaction.customId) {
				case 'buy':
					try {
						let user;
						try {
							user = await getUserBalance(interaction.user.id);
						} catch (error) {
							if (error.code === 'PGRST116') {
								const notRegisteredEmbed = new EmbedBuilder()
									.setTitle('❌ Registration Required')
									.setDescription('It looks like you haven\'t registered yet. Let\'s get you started!')
									.setColor(RED)
									.addFields([
										{
											name: '🔧 What to do next:',
											value: [
												'• Click the button below to set your GrowID',
												'• Make sure your GrowID is correct',
												'• Then you can access product purchases'
											].join('\n'),
											inline: false
										}
									])
									.setFooter({
										text: 'Need help? Contact our support team',
										iconURL: interaction.client.user.displayAvatarURL()
									})
									.setTimestamp();
								await interaction.reply({
									embeds: [notRegisteredEmbed],
									components: [setGrowIdRow],
									flags: MessageFlags.Ephemeral
								});
								return;
							}
							throw error;
						}
						
						// Fetch all products with stock and price
						const products = await getAllProductsWithStock();
						if (!products || products.length === 0) {
							await interaction.reply({ content: 'No products available.', flags: MessageFlags.Ephemeral });
							return;
						}
						// Build select menu options
						const options = products.map(p => ({
							label: `${p.name} (${p.stock} in stock)` + (p.price ? ` - ${p.price} WL` : ''),
							value: String(p.id),
							description: p.code ? `Code: ${p.code}` : undefined
						})).slice(0, 25); // Discord max 25 options
						const selectMenu = new StringSelectMenuBuilder()
							.setCustomId('buy_product_select')
							.setPlaceholder('Select a product to buy')
							.addOptions(options);
						const row = new ActionRowBuilder().addComponents(selectMenu);
						await interaction.reply({
							content: 'Select a product to buy:',
							components: [row],
							flags: MessageFlags.Ephemeral
						});
					} catch (error) {
						console.error('Error in buy button handler:', error);
						await interaction.reply({ content: 'An error occurred while starting your purchase. Please try again or contact support.', flags: MessageFlags.Ephemeral });
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
				case 'my_info': {
					try {
						const user = await getUserWithRoleAndCreatedAt(interaction.user.id);
						
						if (!user || !user.username) {
							const notRegisteredEmbed = new EmbedBuilder()
								.setTitle('🚫 Not Registered')
								.setDescription('You need to set your GrowID to access your information.')
								.setColor(RED)
								.setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
								.setFooter({ 
									text: 'Click the button below to get started',
									iconURL: interaction.client.user.displayAvatarURL()
								})
								.setTimestamp();
				
							await interaction.reply({
								embeds: [notRegisteredEmbed],
								components: [setGrowIdRow],
								flags: MessageFlags.Ephemeral
							});
							return;
						}
				
						// Format numbers with thousand separators
						const formatNumber = (num) => {
							return new Intl.NumberFormat('en-US').format(num || 0);
						};
				
						// Create status badge based on spending
						const getStatusBadge = (totalSpent) => {
							if (totalSpent >= 10000) return '👑 VIP Customer';
							if (totalSpent >= 5000) return '💎 Premium User';
							if (totalSpent >= 1000) return '⭐ Valued Customer';
							return '🌱 New Customer';
						};
				
						const statusBadge = getStatusBadge(user.total_spent || 0);
						const worldLockCount = formatNumber(user.world_lock || 0);
						const totalSpent = formatNumber(user.total_spent || 0);
						// Use role and created_at from DB
						const accountType = user.role ? user.role.charAt(0).toUpperCase() + user.role.slice(1) : 'Unknown';
						const memberSince = user.created_at ? `<t:${Math.floor(new Date(user.created_at).getTime() / 1000)}:R>` : 'Unknown';
						const userInfoEmbed = new EmbedBuilder()
							.setTitle(`${interaction.user.displayName}'s Information`)
							.setDescription(`${statusBadge}\n\nWelcome back to Magaddon Store!\n`)
							.setColor(RED)
							.setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
							.addFields([
								{
									name: `${CHAR} GrowID`,
									value: `\`\`\`yaml\n${user.growid || 'Not Set'}\`\`\``,
									inline: true
								},
								{
									name: `${WORLDLOCK} World Locks`,
									value: `\`\`\`css\n${worldLockCount} WL\`\`\``,
									inline: true
								},
								{
									name: `${SHOPCART} Total Spent`,
									value: `\`\`\`css\n${totalSpent} WL\`\`\``,
									inline: true
								},
								{
									name: `${STATUSONLINE} Account Stats`,
									value: [
										`• **Registration Status:** Verified`,
										`• **Account Type:** ${accountType}`,
										`• **Member Since:** ${memberSince}`
									].join('\n'),
									inline: false
								}
							])
							// .setImage("https://media.discordapp.net/attachments/1225818847672537139/1396541495380807690/magaddonstore.gif?ex=687e761e&is=687d249e&hm=ad61091f4373909101dab8b50ff02bee137a57d205d0228f63ca5d91cb20fcd4&=")
							.setFooter({ 
								text: 'Magaddon Store • Your trusted marketplace',
								iconURL: interaction.client.user.displayAvatarURL()
							})
							.setTimestamp();
				
						await interaction.reply({ 
							embeds: [userInfoEmbed],
							flags: MessageFlags.Ephemeral 
						});
				
					} catch (error) {
						console.error('User info fetch error:', error);
				
						// Enhanced error handling with specific error types
						const isRegistrationError = (
							(error.message && (
								error.message.includes('No rows') ||
								error.message.includes('multiple (or no) rows') ||
								error.message.includes('Results contain 0 rows')
							)) ||
							error.code === 'PGRST116'
						);
				
						if (isRegistrationError) {
							const registrationErrorEmbed = new EmbedBuilder()
								.setTitle('❌ Registration Required')
								.setDescription('It looks like you haven\'t registered yet. Let\'s get you started!')
								.setColor(RED)
								.setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
								.addFields([
									{
										name: '🔧 What to do next:',
										value: [
											'• Click the button below to set your GrowID',
											'• Make sure your GrowID is correct',
											'• Start enjoying our services!'
										].join('\n'),
										inline: false
									}
								])
								.setFooter({ 
									text: 'Need help? Contact our support team',
									iconURL: interaction.client.user.displayAvatarURL()
								})
								.setTimestamp();
				
							await interaction.reply({
								embeds: [registrationErrorEmbed],
								components: [setGrowIdRow],
								flags: MessageFlags.Ephemeral
							});
						} else {
							const systemErrorEmbed = new EmbedBuilder()
								.setTitle('⚠️ System Error')
								.setDescription('We encountered an issue while fetching your information.')
								.setColor(RED)
								.addFields([
									{
										name: '🔄 What you can try:',
										value: [
											'• Wait a moment and try again',
											'• Check your internet connection',
											'• Contact support if the issue persists'
										].join('\n'),
										inline: false
									}
								])
								.setFooter({ 
									text: 'Error ID: ' + Date.now(),
									iconURL: interaction.client.user.displayAvatarURL()
								})
								.setTimestamp();
				
							await interaction.reply({ 
								embeds: [systemErrorEmbed], 
								flags: MessageFlags.Ephemeral 
							});
						}
					}
					break;
				}
				case 'deposit': {
					try {
						const user = await getUserWithRoleAndCreatedAt(interaction.user.id);
						
						if (!user || !user.username) {
							const notRegisteredEmbed = new EmbedBuilder()
								.setTitle('🚫 Not Registered')
								.setDescription('You need to set your GrowID to access deposit information.')
								.setColor(RED)
								.setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
								.setFooter({ 
									text: 'Click the button below to get started',
									iconURL: interaction.client.user.displayAvatarURL()
								})
								.setTimestamp();
				
							await interaction.reply({
								embeds: [notRegisteredEmbed],
								components: [setGrowIdRow],
								flags: MessageFlags.Ephemeral
							});
							return;
						}
				
						const [worldName, ownerName, botName] = await Promise.all([
							getWorldName(),
							getOwnerName(),
							getBotName()
						]);
						const depositEmbed = new EmbedBuilder()
							.setTitle(`${interaction.user.displayName}'s Deposit Instructions`)
							.setDescription(
								`• **Depo World**: \`${worldName || 'Not set'}\` ${DONATION}\n` +
								`• **Owner Name**: \`${ownerName || 'Not set'}\` ${OWNER}\n` +
								`• **Bot Name**: \`${botName || 'Not set'}\` ${CHAR}`
							)
							.setColor(RED)
							.setThumbnail(interaction.user.displayAvatarURL({ dynamic: true, size: 256 }))
							.addFields([
								{
									name: `${SHOPCART} Deposit Instructions`,
									value: [
										`• **Step 1:** Visit the world \`${worldName}\``,
										`• **Step 2:** Place your World Locks to donation box`,
										`• **Step 3:** Take a screenshot as proof`,
										`• **Step 4:** Wait for automatic processing`
									].join('\n'),
									inline: false
								},
								{
									name: `⚠️ Important Notes`,
									value: [
										`• **Always screenshot** your deposit for proof`,
										`• Processing time: Usually within **5-10 minutes**`,
										`• Contact support if your deposit isn't processed`,
										`• Only deposit World Locks, other items won't be credited`
									].join('\n'),
									inline: false
								}
							])
							.setFooter({ 
								text: 'Magaddon Store • Your trusted marketplace',
								iconURL: interaction.client.user.displayAvatarURL()
							})
							.setTimestamp();
				
						await interaction.reply({ 
							embeds: [depositEmbed], 
							flags: MessageFlags.Ephemeral 
						});
				
					} catch (error) {
						console.error('Deposit info fetch error:', error);
						const isRegistrationError = (
							(error.message && (
								error.message.includes('No rows') ||
								error.message.includes('multiple (or no) rows') ||
								error.message.includes('Results contain 0 rows')
							)) ||
							error.code === 'PGRST116'
						);
				
						if (isRegistrationError) {
							const registrationErrorEmbed = new EmbedBuilder()
								.setTitle('❌ Registration Required')
								.setDescription('It looks like you haven\'t registered yet. Let\'s get you started!')
								.setColor(RED)
								.setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
								.addFields([
									{
										name: '🔧 What to do next:',
										value: [
											'• Click the button below to set your GrowID',
											'• Make sure your GrowID is correct',
											'• Then you can access deposit information'
										].join('\n'),
										inline: false
									}
								])
								.setFooter({ 
									text: 'Need help? Contact our support team',
									iconURL: interaction.client.user.displayAvatarURL()
								})
								.setTimestamp();
				
							await interaction.reply({
								embeds: [registrationErrorEmbed],
								components: [setGrowIdRow],
								flags: MessageFlags.Ephemeral
							});
						} else {
							const systemErrorEmbed = new EmbedBuilder()
								.setTitle('⚠️ System Error')
								.setDescription('We encountered an issue while fetching deposit information.')
								.setColor(RED)
								.addFields([
									{
										name: '🔄 What you can try:',
										value: [
											'• Wait a moment and try again',
											'• Check your internet connection',
											'• Contact support if the issue persists'
										].join('\n'),
										inline: false
									}
								])
								.setFooter({ 
									text: 'Error ID: ' + Date.now(),
									iconURL: interaction.client.user.displayAvatarURL()
								})
								.setTimestamp();
				
							await interaction.reply({ 
								embeds: [systemErrorEmbed], 
								flags: MessageFlags.Ephemeral 
							});
						}
					}
					break;
				}
				default:
					await interaction.reply({ content: 'Unknown button.', flags: MessageFlags.Ephemeral });
			}
			return;
		}

		if (interaction.isModalSubmit()) {
			switch (interaction.customId) {
				case 'set_growid_modal':
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
				case 'setdepo_modal':
					if (!isAdmin(interaction.member)) {
						await interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
						return;
					}
					const world = interaction.fields.getTextInputValue('world');
					const owner = interaction.fields.getTextInputValue('owner');
					const bot = interaction.fields.getTextInputValue('bot');
					try {
						await setWorldName(world);
						await setOwnerName(owner);
						await setBotName(bot);
						const embed = new EmbedBuilder()
							.setTitle('Depo Info Updated!')
							.setDescription(
								`**World:** ${world}\n` +
								`**Owner:** ${owner}\n` +
								`**Bot:** ${bot}`
							)
							.setColor(RED);
						await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
					} catch (error) {
						await interaction.reply({ content: 'Failed to update depo info.', flags: MessageFlags.Ephemeral });
					}
					return;
				case 'create_product_modal': {
					if (!isAdmin(interaction.member)) {
						await interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
						return;
					}

					const name = interaction.fields.getTextInputValue('name');
					const code = interaction.fields.getTextInputValue('code');
					const description = interaction.fields.getTextInputValue('description');
					const price = parseInt(interaction.fields.getTextInputValue('price'), 10);

					if (isNaN(price) || price < 0) {
						await interaction.reply({ content: 'Invalid price. Please enter a valid number.', flags: MessageFlags.Ephemeral });
						return;
					}

					try {
						const { data: product, error } = await supabase
							.from('products')
							.insert([
								{
									name,
									code,
									description,
									price
								}
							])
							.select()
							.single();

						if (error) throw error;

						const embed = new EmbedBuilder()
							.setTitle('🎉 Product Created')
							.setDescription('• A new product has been added successfully!')
							.setColor(RED)
							.setThumbnail('https://cdn-icons-png.flaticon.com/512/3081/3081559.png')
							.addFields([
								{ name: 'Name', value: `\`${name}\``, inline: true },
								{ name: 'Code', value: `\`${code}\``, inline: true },
								{ name: 'Price', value: `\`${price} ${WORLDLOCK}\``, inline: true },
								{ name: 'Description', value: description, inline: false }
							])
							.setFooter({
								text: 'Magaddon Store • Product Management',
								iconURL: interaction.client.user.displayAvatarURL()
							})
							.setTimestamp();

						await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
					} catch (error) {
						console.error('Error creating product:', error);
						await interaction.reply({ 
							content: 'Failed to create product. Please try again or contact support.', 
							flags: MessageFlags.Ephemeral 
						});
					}
					break;
				}
				case 'update_product_modal_': {
					if (!isAdmin(interaction.member)) {
						await interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
						return;
					}

					const productId = interaction.customId.split('_').pop();
					const name = interaction.fields.getTextInputValue('name');
					const code = interaction.fields.getTextInputValue('code');
					const description = interaction.fields.getTextInputValue('description');
					const price = parseInt(interaction.fields.getTextInputValue('price'), 10);

					if (isNaN(price) || price < 0) {
						await interaction.reply({ content: 'Invalid price. Please enter a valid number.', flags: MessageFlags.Ephemeral });
						return;
					}

					try {
						const { data: product, error } = await supabase
							.from('products')
							.update({
								name,
								code,
								description,
								price
							})
							.eq('id', productId)
							.select()
							.single();

						if (error) throw error;

						const embed = new EmbedBuilder()
							.setTitle('Product Updated')
							.setDescription('Product has been updated successfully!')
							.setColor(RED)
							.addFields([
								{ name: 'Name', value: name, inline: true },
								{ name: 'Code', value: code, inline: true },
								{ name: 'Price', value: `${price} WL`, inline: true },
								{ name: 'Description', value: description }
							]);

						if (product.image) {
							embed.setThumbnail(product.image);
						}

						await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
					} catch (error) {
						console.error('Error updating product:', error);
						await interaction.reply({ 
							content: 'Failed to update product. Please try again or contact support.', 
							flags: MessageFlags.Ephemeral 
						});
					}
					break;
				}
			}
			if (interaction.isModalSubmit() && interaction.customId.startsWith('buy_quantity_modal_')) {
				console.log('buy_quantity_modal_triggered');
				try {
					console.log('Extracting productId from customId');
					const productId = interaction.customId.replace('buy_quantity_modal_', '');
					const quantityStr = interaction.fields.getTextInputValue('quantity');
					console.log('Parsing quantity:', quantityStr);
					const quantity = parseInt(quantityStr, 10);
					if (isNaN(quantity) || quantity < 1 || quantity > 999999) {
						console.log('Invalid quantity');
						if (interaction.replied || interaction.deferred) {
							await interaction.followUp({ content: 'Invalid quantity. Please enter a number between 1 and 999999.', flags: MessageFlags.Ephemeral });
						} else {
							await interaction.reply({ content: 'Invalid quantity. Please enter a number between 1 and 999999.', flags: MessageFlags.Ephemeral });
						}
						return;
					}
					console.log('Fetching products and user balance');
					const [products, user] = await Promise.all([
						getAllProductsWithStock(),
						getUserBalance(interaction.user.id)
					]);
					console.log('Products fetched:', products.length);
					console.log('User fetched:', user);
					const product = products.find(p => String(p.id) === productId);
					if (!product) {
						console.log('Product not found');
						if (interaction.replied || interaction.deferred) {
							await interaction.followUp({ content: 'Product not found.', flags: MessageFlags.Ephemeral });
						} else {
							await interaction.reply({ content: 'Product not found.', flags: MessageFlags.Ephemeral });
						}
						return;
					}
					if (quantity > product.stock) {
						console.log('Not enough stock');
						if (interaction.replied || interaction.deferred) {
							await interaction.followUp({ content: `Not enough stock. Only ${product.stock} available.`, flags: MessageFlags.Ephemeral });
						} else {
							await interaction.reply({ content: `Not enough stock. Only ${product.stock} available.`, flags: MessageFlags.Ephemeral });
						}
						return;
					}
					const totalPrice = (product.price || 0) * quantity;
					if ((user.world_lock || 0) < totalPrice) {
						console.log('Not enough World Locks');
						if (interaction.replied || interaction.deferred) {
							await interaction.followUp({ content: `You do not have enough World Locks. You need ${totalPrice} WL, but you have ${user.world_lock || 0} WL.`, flags: MessageFlags.Ephemeral });
						} else {
							await interaction.reply({ content: `You do not have enough World Locks. You need ${totalPrice} WL, but you have ${user.world_lock || 0} WL.`, flags: MessageFlags.Ephemeral });
						}
						return;
					}
					console.log('Fetching inventory items');
					const inventoryItems = await getAvailableInventoryItems(productId, quantity);
					console.log('Inventory items fetched:', inventoryItems.length);
					if (!inventoryItems || inventoryItems.length < quantity) {
						console.log('Not enough inventory');
						if (interaction.replied || interaction.deferred) {
							await interaction.followUp({ content: `Not enough inventory. Only ${inventoryItems.length} available.`, flags: MessageFlags.Ephemeral });
						} else {
							await interaction.reply({ content: `Not enough inventory. Only ${inventoryItems.length} available.`, flags: MessageFlags.Ephemeral });
						}
						return;
					}
					// Prepare DM content as a txt file
					const now = Date.now();
					const safeProductName = product.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
					const filename = `purchased_from_MagaddonStore_${safeProductName}_${now}.txt`;
					const fileContent = inventoryItems.map(item => item.data || 'No details').join('\n');
					const file = Buffer.from(fileContent, 'utf-8');
					const attachment = new AttachmentBuilder(file, { name: filename });
					try {
						console.log('Attempting to send DM to user');
						await interaction.user.send({
							content: `Thank you for your purchase! Here are your items for ${product.name}:`,
							files: [attachment]
						});
						console.log('DM sent successfully');
					} catch (err) {
						console.log('Failed to send DM:', err);
						if (interaction.replied || interaction.deferred) {
							await interaction.followUp({ content: 'Failed to send you a DM. Please make sure your DMs are open and try again. No World Locks were deducted.', flags: MessageFlags.Ephemeral });
						} else {
							await interaction.reply({ content: 'Failed to send you a DM. Please make sure your DMs are open and try again. No World Locks were deducted.', flags: MessageFlags.Ephemeral });
						}
						return;
					}
					console.log('Marking inventory as sold');
					const ids = inventoryItems.map(item => item.id);
					await markInventoryItemsAsSold(ids);
					console.log('Deducting world locks and adding spent');
					await deductWorldLocksAndAddSpent(interaction.user.id, totalPrice);

					// Insert order into database
					console.log('Inserting order into database');
					const orderNumber = `ORD-${now}-${uuidv4().slice(0, 10)}`;
					const { data: order, error: orderError } = await supabase
						.from('orders')
						.insert([{
							user_id: uuidv5(String(interaction.user.id), DISCORD_NAMESPACE),
							product_id: product.id,
							inventory_id: inventoryItems[0]?.id || null, // or null if multiple
							order_number: orderNumber,
							quantity,
							unit_price: product.price,
							total_amount: totalPrice,
							status: 'completed',
							payment_method: 'world_lock',
							notes: `Inventory data sent: ${fileContent}`
						}])
						.select()
						.single();
					if (orderError) {
						// Log the error and the data being inserted
						console.error('Order insert error:', orderError);
						console.error('Order insert data:', {
							user_id: uuidv5(String(interaction.user.id), DISCORD_NAMESPACE),
							product_id: product.id,
							inventory_id: inventoryItems[0]?.id || null,
							order_number: orderNumber,
							quantity,
							unit_price: product.price,
							total_amount: totalPrice,
							status: 'completed',
							payment_method: 'world_lock',
							notes: `Inventory data sent: ${fileContent}`
						});
						// Reply to the user with a truncated error message
						const errMsg = orderError.message || orderError.details || JSON.stringify(orderError);
						if (interaction.replied || interaction.deferred) {
							await interaction.followUp({ content: `Order error: ${errMsg.slice(0, 300)}`, flags: MessageFlags.Ephemeral });
						} else {
							await interaction.reply({ content: `Order error: ${errMsg.slice(0, 300)}`, flags: MessageFlags.Ephemeral });
						}
						return;
					}
					console.log('Order inserted successfully');
					if (interaction.replied || interaction.deferred) {
						await interaction.followUp({ content: `Purchase successful! You bought ${quantity}x ${product.name} for ${totalPrice} WL. Check your DMs for your items.`, flags: MessageFlags.Ephemeral });
					} else {
						await interaction.reply({ content: `Purchase successful! You bought ${quantity}x ${product.name} for ${totalPrice} WL. Check your DMs for your items.`, flags: MessageFlags.Ephemeral });
					}

					// Send purchase log to PURCHASE_HISTORY_CHANNEL
					const purchaseHistoryChannelId = process.env.PURCHASE_HISTORY_CHANNEL;
					const purchaseHistoryChannel = interaction.client.channels.cache.get(purchaseHistoryChannelId);
					const realOrderNumber = order ? order.order_number : orderNumber;
					const purchaseEmbed = new EmbedBuilder()
						.setTitle(`#Order Number: ${realOrderNumber}`)
						.setColor(RED)
						.addFields(
							{ name: '• Buyer', value: `<@${interaction.user.id}>`, inline: true },
							{ name: '• Product', value: product.name, inline: true },
							{ name: '• Total Price', value: `\`${totalPrice} ${WORLDLOCK}\``, inline: true },
							{ name: '\u200B', value: 'Thank you for purchasing our product!' }
						)
						.setFooter({ 
							text: 'Magaddon Store • Your trusted marketplace',
							iconURL: interaction.client.user.displayAvatarURL()
						})
						.setTimestamp();
					if (purchaseHistoryChannel) {
						purchaseHistoryChannel.send({ embeds: [purchaseEmbed] });
					}
					console.log('Purchase log sent to channel');
					return;
				} catch (error) {
					console.error('Error in buy_quantity_modal_:', error);
					if (interaction.replied || interaction.deferred) {
						await interaction.followUp({ content: 'An error occurred while processing your purchase. Please try again or contact support.', flags: MessageFlags.Ephemeral });
					} else {
						await interaction.reply({ content: 'An error occurred while processing your purchase. Please try again or contact support.', flags: MessageFlags.Ephemeral });
					}
					return;
				}
			}
			return;
		}

		if (interaction.isStringSelectMenu()) {
			switch (interaction.customId) {
				case 'buy_product_select':
					try {
						const productId = interaction.values[0];
						const product = await getAllProductsWithStock().then(products => products.find(p => String(p.id) === productId));

						if (!product) {
							await interaction.reply({ content: 'Product not found.', flags: MessageFlags.Ephemeral });
							return;
						}

						const modal = new ModalBuilder()
							.setCustomId(`buy_quantity_modal_${product.id}`)
							.setTitle(`Buy: ${product.name}`);

						const quantityInput = new TextInputBuilder()
							.setCustomId('quantity')
							.setLabel(`How many would you like to buy? Stock: ${product.stock}`)
							.setStyle(TextInputStyle.Short)
							.setMinLength(1)
							.setMaxLength(6)
							.setRequired(true)
							.setValue('1');

						modal.addComponents(
							new ActionRowBuilder()
								.addComponents(quantityInput)
						);

						await interaction.showModal(modal);
					} catch (error) {
						console.error('Error in buy_product_select:', error);
						await interaction.reply({ content: 'An error occurred while processing your product selection.', flags: MessageFlags.Ephemeral });
					}
					break;
				case 'view_product_select': {
					if (!isAdmin(interaction.member)) {
						await interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
						return;
					}

					const productId = interaction.values[0];
					try {
						const products = await getAllProductsWithStock();
						const product = products.find(p => String(p.id) === productId);
						if (!product) throw new Error('Product not found');

						const embed = new EmbedBuilder()
							.setTitle('Product Details')
							.setColor(RED)
							.addFields([
								{ name: 'Name', value: product.name, inline: true },
								{ name: 'Code', value: product.code, inline: true },
								{ name: 'Price', value: `${product.price} ${WORLDLOCK}`, inline: true },
								{ name: 'Stock', value: String(product.stock), inline: true },
								{ name: 'Description', value: product.description || 'No description', inline: false }
							]);
						if (product.image) {
							embed.setThumbnail(product.image);
						}

						await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
					} catch (error) {
						console.error('Error fetching product:', error);
						await interaction.reply({ 
							content: 'Failed to fetch product details. Please try again or contact support.', 
							flags: MessageFlags.Ephemeral 
						});
					}
					break;
				}
				case 'update_product_select': {
					if (!isAdmin(interaction.member)) {
						await interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
						return;
					}

					const productId = interaction.values[0];
					try {
						const products = await getAllProductsWithStock();
						const product = products.find(p => String(p.id) === productId);
						if (!product) throw new Error('Product not found');

						const modal = new ModalBuilder()
							.setCustomId(`update_product_modal_${product.id}`)
							.setTitle('Update Product');

						const nameInput = new TextInputBuilder()
							.setCustomId('name')
							.setLabel('Product Name')
							.setStyle(TextInputStyle.Short)
							.setValue(product.name)
							.setRequired(true);

						const codeInput = new TextInputBuilder()
							.setCustomId('code')
							.setLabel('Product Code')
							.setStyle(TextInputStyle.Short)
							.setValue(product.code)
							.setRequired(true);

						const descriptionInput = new TextInputBuilder()
							.setCustomId('description')
							.setLabel('Product Description')
							.setStyle(TextInputStyle.Paragraph)
							.setValue(product.description || '')
							.setRequired(true);

						const priceInput = new TextInputBuilder()
							.setCustomId('price')
							.setLabel('Price (in World Locks)')
							.setStyle(TextInputStyle.Short)
							.setValue(String(product.price))
							.setRequired(true);

						modal.addComponents(
							new ActionRowBuilder().addComponents(nameInput),
							new ActionRowBuilder().addComponents(codeInput),
							new ActionRowBuilder().addComponents(descriptionInput),
							new ActionRowBuilder().addComponents(priceInput)
						);

						await interaction.showModal(modal);
					} catch (error) {
						console.error('Error fetching product for update:', error);
						await interaction.reply({ 
							content: 'Failed to fetch product details. Please try again or contact support.', 
							flags: MessageFlags.Ephemeral 
						});
					}
					break;
				}
				case 'delete_product_select': {
					if (!isAdmin(interaction.member)) {
						await interaction.reply({ content: 'You do not have permission to use this command.', flags: MessageFlags.Ephemeral });
						return;
					}

					const productId = interaction.values[0];
					try {
						const products = await getAllProductsWithStock();
						const product = products.find(p => String(p.id) === productId);
						if (!product) throw new Error('Product not found');

						const { error } = await supabase
							.from('products')
							.delete()
							.eq('id', productId);

						if (error) throw error;

						await interaction.reply({ 
							content: `Product '${product.name}' (Stock: ${product.stock}) has been deleted successfully!`, 
							flags: MessageFlags.Ephemeral 
						});
					} catch (error) {
						console.error('Error deleting product:', error);
						await interaction.reply({ 
							content: 'Failed to delete product. Please try again or contact support.', 
							flags: MessageFlags.Ephemeral 
						});
					}
					break;
				}
				case 'product_action':
					if (!isAdmin(interaction.member)) {
						await interaction.reply({ 
							content: 'You do not have permission to use this command.', 
							flags: MessageFlags.Ephemeral 
						});
						return;
					}

					const action = interaction.values[0];
					switch (action) {
						case 'create': {
							const modal = new ModalBuilder()
								.setCustomId('create_product_modal')
								.setTitle('Create New Product');

							const nameInput = new TextInputBuilder()
								.setCustomId('name')
								.setLabel('Product Name')
								.setStyle(TextInputStyle.Short)
								.setRequired(true);

							const codeInput = new TextInputBuilder()
								.setCustomId('code')
								.setLabel('Product Code')
								.setStyle(TextInputStyle.Short)
								.setRequired(true);

							const descriptionInput = new TextInputBuilder()
								.setCustomId('description')
								.setLabel('Product Description')
								.setStyle(TextInputStyle.Paragraph)
								.setRequired(true);

							const priceInput = new TextInputBuilder()
								.setCustomId('price')
								.setLabel('Price (in World Locks)')
								.setStyle(TextInputStyle.Short)
								.setRequired(true);

							modal.addComponents(
								new ActionRowBuilder().addComponents(nameInput),
								new ActionRowBuilder().addComponents(codeInput),
								new ActionRowBuilder().addComponents(descriptionInput),
								new ActionRowBuilder().addComponents(priceInput)
							);

							await interaction.showModal(modal);
							break;
						}
						case 'read': {
							const products = await getAllProductsWithStock();
							if (!products || products.length === 0) {
								await interaction.reply({ 
									content: 'No products available.', 
									flags: MessageFlags.Ephemeral 
								});
								return;
							}

							const selectMenu = new StringSelectMenuBuilder()
								.setCustomId('view_product_select')
								.setPlaceholder('Select a product to view')
								.addOptions(
									products.map(p => ({
										label: p.name,
										value: String(p.id),
										description: `Code: ${p.code || p.id}`
									}))
								);

							const row = new ActionRowBuilder().addComponents(selectMenu);
							await interaction.reply({
								content: 'Select a product to view:',
								components: [row],
								flags: MessageFlags.Ephemeral
							});
							break;
						}
						case 'update': {
							const products = await getAllProductsWithStock();
							if (!products || products.length === 0) {
								await interaction.reply({ 
									content: 'No products available to update.', 
									flags: MessageFlags.Ephemeral 
								});
								return;
							}

							const selectMenu = new StringSelectMenuBuilder()
								.setCustomId('update_product_select')
								.setPlaceholder('Select a product to update')
								.addOptions(
									products.map(p => ({
										label: `${p.name} (Stock: ${p.stock})`,
										value: String(p.id),
										description: `Code: ${p.code || p.id}`
									}))
								);

							const row = new ActionRowBuilder().addComponents(selectMenu);
							await interaction.reply({
								content: 'Select a product to update:',
								components: [row],
								flags: MessageFlags.Ephemeral
							});
							break;
						}
						case 'delete': {
							const products = await getAllProductsWithStock();
							if (!products || products.length === 0) {
								await interaction.reply({ 
									content: 'No products available to delete.', 
									flags: MessageFlags.Ephemeral 
								});
								return;
							}

							const selectMenu = new StringSelectMenuBuilder()
								.setCustomId('delete_product_select')
								.setPlaceholder('Select a product to delete')
								.addOptions(
									products.map(p => ({
										label: p.name,
										value: String(p.id),
										description: `Code: ${p.code || p.id}`
									}))
								);

							const row = new ActionRowBuilder().addComponents(selectMenu);
							await interaction.reply({
								content: '⚠️ **Warning**: This action cannot be undone. Select a product to delete:',
								components: [row],
								flags: MessageFlags.Ephemeral
							});
							break;
						}
					}
					break;
				default:
					await interaction.reply({ content: 'Unknown menu interaction.', flags: MessageFlags.Ephemeral });
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