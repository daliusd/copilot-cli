const { XMLParser } = require('fast-xml-parser');
const { TOOLS_MAP } = require('./tools/tools-map');

function processXmlCdata(xmlString) {
  let result = '';
  let i = 0;

  while (i < xmlString.length) {
    // Look for CDATA start
    if (i + 9 <= xmlString.length && xmlString.substring(i, i + 9) === '<![CDATA[') {
      // Found the start of a CDATA section
      result += '<![CDATA[';
      i += 9;

      // Process content inside CDATA
      let cdataContent = '';
      let cdataDepth = 1;

      while (i < xmlString.length && cdataDepth > 0) {
        // Check for CDATA closing
        if (i + 3 <= xmlString.length && xmlString.substring(i, i + 3) === ']]>') {
          cdataDepth--;
          if (cdataDepth === 0) {
            // This is the closing of our main CDATA section
            result += cdataContent;
            result += ']]>';
            i += 3;
          } else {
            // This is a nested CDATA closing - transform it
            cdataContent += '</__CDATA__>';
            i += 3;
          }
        }
        // Check for nested CDATA opening
        else if (i + 9 <= xmlString.length && xmlString.substring(i, i + 9) === '<![CDATA[') {
          cdataDepth++;
          cdataContent += '<__CDATA__>';
          i += 9;
        }
        // Regular character inside CDATA
        else {
          cdataContent += xmlString[i];
          i++;
        }
      }
    }
    // Regular XML content
    else {
      result += xmlString[i];
      i++;
    }
  }

  return result;
}

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

      const parsedObj = parser.parse(processXmlCdata(xmlStr));

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
  generateToolsSystemPrompt,
};
