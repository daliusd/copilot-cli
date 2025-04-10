const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
const { XMLParser } = require('fast-xml-parser');

const { fetch } = require('./tools/fetch');
const { editor } = require('./tools/editor');

const TOOLS_MAP = {
  fetch: fetch,
  editor: editor,
};

// Cache variables
let oauthToken = null;
let githubToken = null;

/**
 * Find the configuration path where GitHub Copilot tokens are stored
 * @returns {string|null} The configuration path
 */
function findConfigPath() {
  if (process.env.XDG_CONFIG_HOME) {
    return process.env.XDG_CONFIG_HOME;
  }

  if (process.platform === 'win32') {
    const appDataPath = path.join(os.homedir(), 'AppData', 'Local');
    if (fs.existsSync(appDataPath)) {
      return appDataPath;
    }
  } else {
    const configPath = path.join(os.homedir(), '.config');
    if (fs.existsSync(configPath)) {
      return configPath;
    }
  }

  return null;
}

/**
 * Get the GitHub OAuth token from environment or config files
 * @returns {string|null} The GitHub OAuth token
 */
function getToken() {
  if (oauthToken) {
    return oauthToken;
  }

  // Try environment variables first
  const token = process.env.GITHUB_TOKEN;
  const codespaces = process.env.CODESPACES;
  if (token && codespaces) {
    oauthToken = token;
    return token;
  }

  // Try to find in config files
  const configPath = findConfigPath();
  if (!configPath) {
    return null;
  }

  const filePaths = [
    path.join(configPath, 'github-copilot', 'hosts.json'),
    path.join(configPath, 'github-copilot', 'apps.json'),
  ];

  for (const filePath of filePaths) {
    if (fs.existsSync(filePath)) {
      try {
        const userData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        for (const [key, value] of Object.entries(userData)) {
          if (key.includes('github.com')) {
            oauthToken = value.oauth_token;
            return oauthToken;
          }
        }
      } catch (error) {
        console.error(`Error reading/parsing ${filePath}:`, error.message);
      }
    }
  }

  return null;
}

/**
 * Authorize the GitHub OAuth token
 * @returns {Promise<Object|null>} The GitHub token object
 */
async function authorizeToken() {
  if (githubToken && githubToken.expires_at > Math.floor(Date.now() / 1000)) {
    return githubToken;
  }

  try {
    const response = await axios.get('https://api.github.com/copilot_internal/v2/token', {
      headers: {
        Authorization: `Bearer ${oauthToken}`,
        Accept: 'application/json',
      },
    });

    githubToken = response.data;
    return githubToken;
  } catch (error) {
    console.error('Error authorizing token:', error.message);
    return null;
  }
}

/**
 * Get and authorize GitHub Copilot token
 * @returns {Promise<boolean>} Whether authorization was successful
 */
async function getAndAuthorizeToken() {
  oauthToken = getToken();
  if (!oauthToken) {
    console.error('No GitHub token found. Please install GitHub Copilot extension.');
    return false;
  }

  githubToken = await authorizeToken();
  if (!githubToken || Object.keys(githubToken).length === 0) {
    console.error('Could not authorize your GitHub Copilot token.');
    return false;
  }

  return true;
}

/**
 * Get available GitHub Copilot models
 * @returns {Promise<Object>} Object with available models
 */
async function getModels() {
  if (!(await getAndAuthorizeToken())) {
    throw new Error('Failed to authenticate with GitHub');
  }

  try {
    const url = 'https://api.githubcopilot.com/models';
    const headers = {
      Authorization: `Bearer ${githubToken.token}`,
      'Content-Type': 'application/json',
      'Copilot-Integration-Id': 'vscode-chat',
      'Editor-Version': `copilot-cli/${require('../package.json').version}`,
    };

    const response = await axios.get(url, { headers });
    const models = {};

    for (const model of response.data.data) {
      if (model.model_picker_enabled && model.capabilities.type === 'chat') {
        const choiceOpts = {};

        if (model.capabilities.supports.parallel_tool_calls) {
          choiceOpts.can_call_tools_parallel = true;
        }
        if (model.capabilities.supports.tool_calls) {
          choiceOpts.can_call_tools = true;
        }

        models[model.id] = { opts: choiceOpts };
      }
    }

    return models;
  } catch (error) {
    throw new Error(`Failed to fetch models: ${error.message}`);
  }
}

/**
 * Extract XML tool blocks from AI response
 * @param {string} content The AI response content
 * @returns {Array<Object>} Array of parsed XML tool objects
 */
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

/**
 * Run a prompt against a GitHub Copilot model
 * @param {Object} options Options for the prompt
 * @returns {Promise<void>}
 */
async function runPrompt(options) {
  if (!(await getAndAuthorizeToken())) {
    throw new Error('Failed to authenticate with GitHub');
  }

  const url = 'https://api.githubcopilot.com/chat/completions';
  const headers = {
    Authorization: `Bearer ${githubToken.token}`,
    'Content-Type': 'application/json',
    'Copilot-Integration-Id': 'vscode-chat',
    'Editor-Version': `copilot-cli/${require('../package.json').version}`,
  };

  const messages = [...options.messages];

  // Add tool description to system prompt if tools are enabled
  if (options.tools && options.tools.length > 0) {
    const toolsSystemPrompt = generateToolsSystemPrompt(options.tools);

    // If there's already a system message, append to it, otherwise create new one
    const systemMessageIndex = messages.findIndex((m) => m.role === 'system');
    if (systemMessageIndex >= 0) {
      messages[systemMessageIndex].content += '\n\n' + toolsSystemPrompt;
    } else {
      messages.unshift({ role: 'system', content: toolsSystemPrompt });
    }
  }

  const payload = {
    model: options.model,
    messages: messages,
    temperature: options.temperature || 0,
    stream: false,
  };

  try {
    const response = await axios.post(url, payload, { headers });

    for (const choice of response.data.choices) {
      const message = choice.message;
      if (message.content) {
        console.log(message.content);

        // Extract and process XML tool blocks
        if (options.tools && options.tools.length > 0) {
          const toolBlocks = extractXmlTools(message.content);
          console.log(JSON.stringify(toolBlocks, null, 2));
          if (toolBlocks.length > 0) {
            await processXmlTools(toolBlocks);
          }
        }
      }
    }
  } catch (error) {
    throw new Error(`Failed to get response: ${error.message}`);
  }
}

module.exports = {
  getToken,
  getAndAuthorizeToken,
  getModels,
  runPrompt,
  extractXmlTools,
  processXmlTools,
  generateToolsSystemPrompt,
};
