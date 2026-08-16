const birthdayManager = require('../../../features/birthday/birthdayManager');
const { celebrateBirthdayIfDue } = require('../../../features/birthday/birthdayScheduler');
const { isMod } = require('../../../utils/modRole');

async function handleEdit(interaction) {
  const day = interaction.options.getInteger('day');
  const month = interaction.options.getInteger('month');
  const year = interaction.options.getInteger('year'); // optional, can be null
  const targetUser = interaction.options.getUser('user'); // optional, mod-only

  const isForSomeoneElse = targetUser && targetUser.id !== interaction.user.id;

  if (isForSomeoneElse && !(await isMod(interaction.member))) {
    await interaction.reply({
      content: '❌ You need to be a Mod or Admin to edit someone else\'s birthday.',
      ephemeral: true,
    });
    return;
  }

  const user = targetUser || interaction.user;

  const existing = await birthdayManager.getBirthday(interaction.guildId, user.id);
  if (!existing) {
    await interaction.reply({
      content: isForSomeoneElse
        ? `⚠️ ${user} doesn't have a saved birthday yet — use \`/birthday add\` to set one.`
        : "⚠️ You don't have a saved birthday yet — use `/birthday add` to set one.",
      ephemeral: true,
    });
    return;
  }

  try {
    await birthdayManager.addBirthday(interaction.guildId, user.id, day, month, year);

    const dateStr = year ? `${day}/${month}/${year}` : `${day}/${month}`;
    let message = isForSomeoneElse
      ? `🎂 Birthday updated for ${user}: **${dateStr}**`
      : `🎂 Birthday updated: **${dateStr}**`;

    // If today happens to be the new birthday, celebrate it right away instead of
    // waiting for tonight's midnight check (which has already run today).
    const result = await celebrateBirthdayIfDue(interaction.client, interaction.guildId, user.id, day, month);

    if (result.isToday) {
      if (result.roleResult?.assigned) {
        message += isForSomeoneElse
          ? `\n🎉 It's their birthday today — I've given them the birthday role!`
          : "\n🎉 It's your birthday today — I've given you the birthday role!";
      } else if (result.roleResult?.reason === 'role_too_high') {
        message +=
          "\n⚠️ Today is the birthday, but I couldn't assign the role: my role needs to be moved higher in the server's role list.";
      }
    }

    await interaction.reply({ content: message, ephemeral: true });
  } catch (err) {
    if (err instanceof birthdayManager.ValidationError) {
      await interaction.reply({ content: `⚠️ ${err.message}`, ephemeral: true });
    } else {
      throw err;
    }
  }
}

module.exports = { handleEdit };
