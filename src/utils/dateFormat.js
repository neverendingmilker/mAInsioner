// Converts an ISO "YYYY-MM-DD" (what an <input type="date"> reads/writes) into "DD/MM/YYYY"
// (what the various *Manager.parseXDate helpers across the dashboard routes accept).
function isoToDMY(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

module.exports = { isoToDMY };
