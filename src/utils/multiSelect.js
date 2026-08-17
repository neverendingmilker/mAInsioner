// Express's urlencoded body parser doesn't normalize a <select multiple>/checkbox-group
// field: it comes through as undefined (nothing picked), a string (exactly one picked), or
// an array (more than one picked) depending on how many were ticked. Every dashboard route
// that reads one of these needs the same normalization to a plain array.
function pickedValues(value) {
  return [].concat(value || []);
}

module.exports = { pickedValues };
