const { XMLParser } = require('fast-xml-parser');

const { fetch } = require('./tools/fetch');
const { editor } = require('./tools/editor');

const TOOLS_MAP = {
  fetch: fetch,
  editor: editor,
};

/**
 * Extract XML tool blocks from AI response
 * @param {string} content The AI response content
 * @returns {Array<Object>} Array of parsed XML tool objects
 */
function extractXmlTools(content) {
  const toolBlocks = [];
  const xmlRegex = /```xml\s*<tools>([\s\S]*?)<\/tools>\s*```/g;

  let match;
  while ((match = xmlRegex.exec(content)) !== null) {
    try {
      const xmlStr = `<tools>${match[1].trim()}</tools>`;

      // Parse XML using fast-xml-parser
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '_',
        parseAttributeValue: true,
        processEntities: false,
        cdataPropName: '__cdata',
      });

      const parsedObj = parser.parse(xmlStr);

      if (parsedObj && parsedObj.tools && parsedObj.tools.tool) {
        // Handle both single tool and multiple tools cases
        const tools = Array.isArray(parsedObj.tools.tool) ? parsedObj.tools.tool : [parsedObj.tools.tool];

        for (const tool of tools) {
          const toolName = tool._name;

          // Use the tool's parseXmlResponse function if available
          if (TOOLS_MAP[toolName] && typeof TOOLS_MAP[toolName].parseXmlResponse === 'function') {
            const toolResult = TOOLS_MAP[toolName].parseXmlResponse(tool);
            toolResult.tool = toolName;
            toolBlocks.push(toolResult);
          } else {
            console.error(`No parser found for tool: ${toolName}`);
          }
        }
      }
    } catch (error) {
      console.error('Failed to parse XML block:', error.message);
    }
  }

  return toolBlocks;
}

/**
 * Process and execute tools from extracted XML blocks
 * @param {Array<Object>} toolBlocks Array of tool blocks to process
 * @returns {Promise<void>}
 */
async function processXmlTools(toolBlocks) {
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

/**
 * Generate system prompt with tool instructions
 * @param {Array<string>} toolNames Names of tools to include
 * @returns {string} The system prompt with tool instructions
 */
function generateToolsSystemPrompt(toolNames) {
  let systemPrompt = 'You can use tools by responding with XML blocks. Use the format:\n';
  systemPrompt += '```xml\n<tools>\n  <tool name="tool_name"><!-- tool parameters here --></tool>\n</tools>\n```\n\n';

  systemPrompt += 'Available tools:\n\n';

  for (const name of toolNames) {
    if (TOOLS_MAP[name] && TOOLS_MAP[name].markdownDocs) {
      systemPrompt += TOOLS_MAP[name].markdownDocs + '\n\n';
    }
  }

  // Add a note about CDATA sections
  systemPrompt += '## Important Notes\n';
  systemPrompt += '- Always wrap values in `<![CDATA[ ]]>` sections to preserve formatting and special characters.\n';
  systemPrompt += '- Multiple tools can be included in a single response.\n';
  systemPrompt += '- Always wrap tool response in xml code block.\n';

  return systemPrompt;
}

module.exports = {
  extractXmlTools,
  processXmlTools,
  generateToolsSystemPrompt,
};
