const birthdayManager = require('../../../features/birthday/birthdayManager');
const { celebrateBirthdayIfDue } = require('../../../features/birthday/birthdayScheduler');
const { isMod } = require('../../../utils/modRole');

async function handleAdd(interaction) {
  const day = interaction.options.getInteger('day');
  const month = interaction.options.getInteger('month');
  const year = interaction.options.getInteger('year'); // optional, can be null
  const targetUser = interaction.options.getUser('user'); // optional, admin-only

  const isForSomeoneElse = targetUser && targetUser.id !== interaction.user.id;

  if (isForSomeoneElse && !(await isMod(interaction.member))) {
    await interaction.reply({
      content: '❌ You need to be a Mod or Admin to set someone else\'s birthday.',
      ephemeral: true,
    });
    return;
  }

  const user = targetUser || interaction.user;

  try {
    await birthdayManager.addBirthday(interaction.guildId, user.id, day, month, year);

    const dateStr = year ? `${day}/${month}/${year}` : `${day}/${month}`;
    let message = isForSomeoneElse
      ? `🎂 Birthday saved for ${user}: **${dateStr}**`
      : `🎂 Birthday saved: **${dateStr}**`;

    // If today happens to be the birthday just saved, celebrate it right away
    // instead of waiting for tonight's midnight check (which has already run today).
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

module.exports = { handleAdd };
