module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(interaction) {
    if (interaction.isAutocomplete()) {
      const command = interaction.client.commands.get(interaction.commandName);
      if (command?.autocomplete) {
        try {
          await command.autocomplete(interaction);
        } catch (err) {
          console.error(`Error in autocomplete for "${interaction.commandName}":`, err);
        }
      }
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('sticky:edit-modal:')) {
      try {
        const channelId = interaction.customId.slice('sticky:edit-modal:'.length);
        const stickyManager = require('../features/sticky/stickyManager');
        const content = interaction.fields.getTextInputValue('content');

        const channel = await interaction.guild.channels.fetch(channelId).catch(() => null);
        if (!channel) {
          await interaction.reply({ content: "⚠️ That channel doesn't seem to exist anymore.", ephemeral: true });
          return;
        }

        // Preserve whatever repost delay was already configured — this modal only
        // edits the text, same as the "channel" option being omitted on /sticky edit.
        const existing = stickyManager.getStickyByChannel(channelId);
        const delaySeconds = existing?.repostDelaySeconds ?? stickyManager.DEFAULT_REPOST_DELAY_SECONDS;

        await interaction.deferReply({ ephemeral: true });
        await stickyManager.setSticky(channel, content, interaction.user.id, delaySeconds);
        await interaction.editReply({ content: `✅ Sticky message updated in ${channel} — reposted right away with the new text.` });
      } catch (err) {
        console.error('Error handling sticky edit modal submit:', err);
        const errorReply = { content: '⚠️ An error occurred while updating the sticky message.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorReply).catch(() => null);
        } else {
          await interaction.reply(errorReply).catch(() => null);
        }
      }
      return;
    }

    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('vfedit:select:')) {
      try {
        const { handleEditSelect } = require('../commands/verify/handlers/editInteractions');
        await handleEditSelect(interaction);
      } catch (err) {
        console.error('Error handling verify edit select menu:', err);
        await interaction
          .update({ content: '⚠️ An error occurred while handling this selection.', components: [] })
          .catch(() => null);
      }
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId.startsWith('vfedit:modal:')) {
      try {
        const { handleEditModalSubmit } = require('../commands/verify/handlers/editInteractions');
        await handleEditModalSubmit(interaction);
      } catch (err) {
        console.error('Error handling verify edit modal submit:', err);
        const errorReply = { content: '⚠️ An error occurred while saving this change.', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(errorReply).catch(() => null);
        } else {
          await interaction.reply(errorReply).catch(() => null);
        }
      }
      return;
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === 'starboard:lookback:channels') {
      try {
        const { handleChannelSelect } = require('../commands/starboard/handlers/lookbackInteractions');
        await handleChannelSelect(interaction);
      } catch (err) {
        console.error('Error handling starboard lookback channel select:', err);
        await interaction
          .update({ content: '⚠️ An error occurred while starting the scan.', components: [] })
          .catch(() => null);
      }
      return;
    }

    if (interaction.isButton() && interaction.customId === 'starboard:lookback:run') {
      try {
        const { handleRunButton } = require('../commands/starboard/handlers/lookbackInteractions');
        await handleRunButton(interaction);
      } catch (err) {
        console.error('Error handling starboard lookback run button:', err);
        await interaction
          .update({ content: '⚠️ An error occurred while starting the scan.', components: [] })
          .catch(() => null);
      }
      return;
    }

    if (
      interaction.isChannelSelectMenu() &&
      (interaction.customId === 'goosepizza:create:channels' || interaction.customId === 'goosepizza:edit:channels')
    ) {
      try {
        const { handleChannelSelect } = require('../commands/goosepizza/handlers/channelInteractions');
        await handleChannelSelect(interaction);
      } catch (err) {
        console.error('Error handling GoosePizza channel select:', err);
        await interaction
          .update({ content: '⚠️ An error occurred while saving the channel selection.', components: [] })
          .catch(() => null);
      }
      return;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'rolelink:add:roles') {
      try {
        const { handleRoleSelect } = require('../commands/rolelinks/handlers/roleInteractions');
        await handleRoleSelect(interaction);
      } catch (err) {
        console.error('Error handling rolelink role select:', err);
        await interaction
          .update({ content: '⚠️ An error occurred while saving the role selection.', components: [] })
          .catch(() => null);
      }
      return;
    }

    if (!interaction.isChatInputCommand() && !interaction.isMessageContextMenuCommand()) return;

    const command = interaction.client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`Error executing command "${interaction.commandName}":`, err);

      const errorReply = {
        content: '⚠️ An error occurred while executing this command.',
        ephemeral: true,
      };

      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errorReply).catch(() => null);
      } else {
        await interaction.reply(errorReply).catch(() => null);
      }
    }
  },
};
