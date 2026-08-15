const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// Central registry of every toggleable feature: the value passed by the "feature"
// option maps to the manager that actually owns the enabled/disabled state for it.
// Adding a new toggleable feature to the bot just means adding one line here.
const FEATURES = {
  animenight: { label: 'Anime Night', manager: require('../../features/animenight/animeNightManager') },
  autoresponder: { label: 'Autoresponder', manager: require('../../features/autoresponder/autoresponderManager') },
  birthday: { label: 'Birthday', manager: require('../../features/birthday/birthdayManager') },
  boosterlink: { label: 'Booster Links', manager: require('../../features/boosterlinks/boosterLinkManager') },
  comboroles: { label: 'Combined Role Search', manager: require('../../features/comboroles/comboRolesManager') },
  goosepizza: { label: 'GoosePizza', manager: require('../../features/goosepizza/goosepizzaManager') },
  highlight: { label: 'Highlight', manager: require('../../features/highlight/highlightManager') },
  honeypot: { label: 'Honeypot', manager: require('../../features/honeypot/honeypotManager') },
  incident: { label: 'Incident Counter', manager: require('../../features/incident/incidentManager') },
  invitetracker: { label: 'Invite Tracker', manager: require('../../features/invitetracker/inviteTrackerManager') },
  reactionlimit: { label: 'Reaction Limit', manager: require('../../features/reactionlimit/reactionLimitManager') },
  rolelink: { label: 'Role Links', manager: require('../../features/rolelinks/roleLinkManager') },
  serverbackup: { label: 'Server Backup', manager: require('../../features/serverbackup/serverBackupManager') },
  slowmode: { label: 'Slowmode', manager: require('../../features/slowmode/slowModeManager') },
  starboard: { label: 'Starboard', manager: require('../../features/starboard/starboardManager') },
  sticky: { label: 'Sticky Messages', manager: require('../../features/sticky/stickyManager') },
  suggestion: { label: 'Suggestions', manager: require('../../features/suggestion/suggestionManager') },
  verify: { label: 'Verification', manager: require('../../features/verify/verifyManager') },
  waifuwarlr: { label: 'WaifuWar LR', manager: require('../../features/waifuwarlr/waifuWarLRManager') },
  warning: { label: 'Warnings', manager: require('../../features/warning/warningManager') },
};

const data = new SlashCommandBuilder()
  .setName('disablefeature')
  .setDescription('[Admin] Enable or disable one of the bot\'s features for this server')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption((opt) =>
    opt
      .setName('feature')
      .setDescription('The feature to enable/disable')
      .setRequired(true)
      .addChoices(...Object.entries(FEATURES).map(([value, { label }]) => ({ name: label, value })))
  )
  .addBooleanOption((opt) =>
    opt.setName('enabled').setDescription('true to enable, false to disable').setRequired(true)
  );

async function execute(interaction) {
  const featureKey = interaction.options.getString('feature');
  const enabled = interaction.options.getBoolean('enabled');

  const feature = FEATURES[featureKey];
  if (!feature) {
    await interaction.reply({ content: '⚠️ Unknown feature.', ephemeral: true });
    return;
  }

  await feature.manager.setEnabled(interaction.guildId, enabled);

  await interaction.reply({
    content: enabled
      ? `✅ **${feature.label}** is now **enabled** for this server.`
      : `✅ **${feature.label}** is now **disabled** for this server. Existing data is kept, but the feature's automatic behavior and commands will stay off until you re-enable it.`,
    ephemeral: true,
  });
}

module.exports = { data, execute };
