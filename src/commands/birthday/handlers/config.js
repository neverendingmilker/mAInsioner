const { PermissionFlagsBits } = require('discord.js');
const birthdayManager = require('../../../features/birthday/birthdayManager');
const { celebrateDueTodayForGuild } = require('../../../features/birthday/birthdayScheduler');
const { formatSeconds } = require('../../../utils/duration');
const { isMod } = require('../../../utils/modRole');

// Merges the old /birthday role, /birthday removerole and /birthday channel subcommands
// into one: all three settings are optional, provide any combination.
async function handleConfig(interaction) {
  if (!isMod(interaction.member)) {
    await interaction.reply({
      content: '❌ You need to be a Mod or Admin to use this command.',
      ephemeral: true,
    });
    return;
  }

  const role = interaction.options.getRole('role');
  const removeAfter = interaction.options.getString('removeafter');
  const channel = interaction.options.getChannel('channel');

  if (!role && !removeAfter && !channel) {
    await interaction.reply({
      content: '⚠️ Provide at least one setting to change (`role`, `removeafter` and/or `channel`).',
      ephemeral: true,
    });
    return;
  }

  // Validate/apply removeafter first — it's the only option that can be malformed (a typo
  // in the duration string). Fail before touching role/channel so a bad value doesn't
  // leave the command half-applied.
  if (removeAfter) {
    try {
      await birthdayManager.setRemoveAfterDuration(interaction.guildId, removeAfter);
    } catch (err) {
      if (err instanceof birthdayManager.ValidationError) {
        await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
        return;
      }
      throw err;
    }
  }

  const messages = [];
  const botMember = interaction.guild.members.me;
  let needCelebrateCheck = false;

  if (role) {
    await birthdayManager.setBirthdayRole(interaction.guildId, role.id);
    if (botMember && botMember.roles.highest.position <= role.position) {
      messages.push(
        `✅ Birthday role set to ${role}\n` +
          `⚠️ Heads up: my own role is currently **not** higher than ${role} in the server's role list, so I won't actually be able to assign or remove it. Please move my role above it in Server Settings → Roles.`
      );
    } else {
      messages.push(`✅ Birthday role set to ${role}`);
      needCelebrateCheck = true;
    }
  }

  if (removeAfter) {
    const guildConfig = await birthdayManager.getGuildConfig(interaction.guildId);
    messages.push(
      `✅ The birthday role will now be removed after **${formatSeconds(guildConfig.remove_after_seconds)}**.`
    );
  }

  if (channel) {
    await birthdayManager.setBirthdayChannel(interaction.guildId, channel.id);
    const canSend = botMember && channel.permissionsFor(botMember)?.has(PermissionFlagsBits.SendMessages);
    if (!canSend) {
      messages.push(
        `✅ Birthday greetings will now be posted in ${channel}\n` +
          `⚠️ Heads up: I don't currently have permission to send messages in ${channel}. Please grant me "Send Messages" there.`
      );
    } else {
      messages.push(`✅ Birthday greetings will now be posted in ${channel}`);
      needCelebrateCheck = true;
    }
  }

  // If the role and/or channel just got configured, catch up anyone already celebrating
  // today whose role/greeting was missed because the setting wasn't there yet this morning.
  if (needCelebrateCheck) {
    const results = await celebrateDueTodayForGuild(interaction.client, interaction.guildId);
    const assignedCount = results.filter((r) => r.roleResult?.assigned).length;
    const greetedCount = results.filter((r) => r.greetingResult?.sent).length;
    if (assignedCount > 0) {
      messages.push(`🎉 Also assigned it right away to ${assignedCount} member(s) celebrating today.`);
    }
    if (greetedCount > 0) {
      messages.push(`🎉 Also sent a birthday greeting right away for ${greetedCount} member(s) celebrating today.`);
    }
  }

  await interaction.reply({ content: messages.join('\n'), ephemeral: true });
}

module.exports = { handleConfig };
