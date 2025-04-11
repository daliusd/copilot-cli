const { fetch } = require('./fetch');
const { editor } = require('./editor');

const TOOLS_MAP = {
  fetch: fetch,
  editor: editor,
};

module.exports = {
  TOOLS_MAP,
};
