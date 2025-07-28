const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { isAdmin } = require('../../middleware/adminCheck');
const { isAuthorizedUser } = require('../../middleware/authorizedUser');
const { getAllProductsWithStock } = require('../../services/productService');
const { createClient } = require('@supabase/supabase-js');
const { RED } = require('../../colors/discordColors');
const { replyAdminError } = require('../../utils/embedHelpers');
const { WHITECROWN, REDARROW, ALERT, CHECK, INFO, WORLDLOCK, CYANARROW } = require('../../emojis/discordEmojis');
const addStockFileCache = require('../../utils/addStockCache');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE);

module.exports = {
  data: new SlashCommandBuilder()
    .setName('addstock')
    .setDescription('Add stock to a product (admin only)')
    .addAttachmentOption(option =>
      option.setName('file')
        .setDescription('Text file with account details (one per line)')
        .setRequired(false)),

  async execute(interaction) {
    // Check if user is admin
    if (!(isAdmin(interaction.member) && isAuthorizedUser(interaction.user.id))) {
      await replyAdminError(interaction);
      return;
    }

    try {
      // Get all products for the select menu
      const products = await getAllProductsWithStock();
      
      if (!products || products.length === 0) {
        await interaction.reply({ 
          content: `${ALERT} No products found. Please create products first.`, 
          flags: MessageFlags.Ephemeral 
        });
        return;
      }

      // Check if a file was uploaded
      const fileAttachment = interaction.options.getAttachment('file');
      
      if (fileAttachment) {
        // Validate file type
        if (!fileAttachment.contentType?.includes('text/plain') && !fileAttachment.name?.endsWith('.txt')) {
          await interaction.reply({ 
            content: `${ALERT} Please upload a .txt file only.`, 
            flags: MessageFlags.Ephemeral 
          });
          return;
        }

        // Fetch file content
        try {
          const response = await fetch(fileAttachment.url);
          const fileContent = await response.text();
          
          if (!fileContent.trim()) {
            await interaction.reply({ 
              content: `${ALERT} The uploaded file is empty.`, 
              flags: MessageFlags.Ephemeral 
            });
            return;
          }

          // Parse the file content to validate format
          const lines = fileContent.trim().split('\n').filter(line => line.trim());
          const validAccounts = [];
          const invalidLines = [];

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine) {
              validAccounts.push({ data: trimmedLine });
            }
          }

          if (validAccounts.length === 0) {
            await interaction.reply({ 
              content: `${ALERT} No account details found in the file. Please add some content to the file.`, 
              flags: MessageFlags.Ephemeral 
            });
            return;
          }

          // Store file content in cache for this user
          addStockFileCache.set(interaction.user.id, {
            fileContent,
            validAccounts,
            filename: fileAttachment.name
          });

        } catch (error) {
          console.error('Error reading file:', error);
          await interaction.reply({ 
            content: `${ALERT} Failed to read the uploaded file. Please try again.`, 
            flags: MessageFlags.Ephemeral 
          });
          return;
        }
      }

      // Create product selection menu
      const productOptions = products.map(product => ({
        label: `${product.name} (${product.code})`,
        description: `Price: ${product.price} WL | Current Stock: ${product.stock}`,
        value: String(product.id),
        emoji: CYANARROW
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('addstock_product_select')
        .setPlaceholder('Select a product to add stock to')
        .addOptions(productOptions);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      const embed = new EmbedBuilder()
        .setTitle(`${WHITECROWN} Add Stock ${WHITECROWN}`)
        .setDescription(`${REDARROW} Select a product from the menu below to add stock.`)
        .setColor(RED)
        .addFields([
          {
            name: 'Available Products',
            value: `${products.length} products found`,
            inline: true
          },
          {
            name: 'Instructions',
            value: 'Select product → Enter account details → Confirm',
            inline: true
          }
        ])
        .setFooter({
          text: 'Admin Stock Management',
          iconURL: interaction.client.user.displayAvatarURL()
        })
        .setTimestamp();

      // Add file info if file was uploaded
      if (fileAttachment && interaction.validAccounts) {
        embed.addFields([
          {
            name: '📁 File Uploaded',
            value: `**File:** ${fileAttachment.name}\n**Account Lines:** ${interaction.validAccounts.length}`,
            inline: false
          },
          {
            name: 'What to do next',
            value: 'Select a product below to add all lines from your file as stock.',
            inline: false
          }
        ]);
      } else {
        embed.addFields([
          {
            name: `${INFO} Account Format`,
            value: 'Any text format (one per line)',
            inline: false
          }
        ]);
      }

      await interaction.reply({
        embeds: [embed],
        components: [row],
        flags: MessageFlags.Ephemeral
      });

    } catch (error) {
      console.error('Error in addstock command:', error);
      await interaction.reply({ 
        content: `${ALERT} An error occurred while loading products. Please try again.`, 
        flags: MessageFlags.Ephemeral 
      });
    }
  }
}; 