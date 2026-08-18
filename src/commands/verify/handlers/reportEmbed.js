// The actual implementation now lives in the features layer (src/features/verify/
// reportEmbed.js), so verifyManager can build/re-build the same embed for both the
// Discord command and the dashboard. This file just re-exports it, so any existing
// require('./reportEmbed') in this folder keeps working unchanged.
module.exports = require('../../../features/verify/reportEmbed');
