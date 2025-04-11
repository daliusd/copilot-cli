const { TOOLS_MAP } = require('./tools-map');
const { convertCdataTags } = require('./utils');

/**
 * Process and execute tools
 * @param {Array<Object>} toolBlocks Array of tool blocks to process
 * @returns {Promise<void>}
 */
async function processTools(toolBlocks) {
  toolBlocks.sort((a, b) => {
    if (a.tool === b.tool) {
      return TOOLS_MAP[a.tool].compare(a.params, b.params);
    }
    return 0;
  });

  for (const block of toolBlocks) {
    if (TOOLS_MAP[block.tool]) {
      const tool = TOOLS_MAP[block.tool];
      try {
        const result = await tool.execute(block.params);
        console.log(`Tool ${block.tool} executed:`, result);
      } catch (error) {
        console.error(`Error executing tool ${block.tool}:`, error.message);
      }
    } else {
      console.error(`Unknown tool: ${block.tool}`);
    }
  }
}

module.exports = {
  processTools,
};
