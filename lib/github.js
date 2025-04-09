const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');
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
 * Extract JSON tool blocks from AI response
 * @param {string} content The AI response content
 * @returns {Array<Object>} Array of parsed JSON tool objects
 */
function extractJsonTools(content) {
  const jsonBlocks = [];
  const jsonRegex = /```(?:json)?\s*({[\s\S]*?})\s*```/g;

  let match;
  while ((match = jsonRegex.exec(content)) !== null) {
    try {
      const jsonStr = match[1].trim();
      const jsonObj = JSON.parse(jsonStr);
      if (jsonObj.tool && jsonObj.params) {
        jsonBlocks.push(jsonObj);
      }
    } catch (error) {
      console.error('Failed to parse JSON block:', error.message);
    }
  }

  return jsonBlocks;
}

/**
 * Process and execute tools from extracted JSON blocks
 * @param {Array<Object>} toolBlocks Array of tool blocks to process
 * @returns {Promise<void>}
 */
async function processJsonTools(toolBlocks) {
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
  let systemPrompt = 'You can use tools by responding with JSON blocks. Use the format:\n';
  systemPrompt += '```json\n{\n  "tool": "tool_name",\n  "params": { "param1": "value" }\n}\n```\n\n';

  systemPrompt += 'Available tools:\n\n';

  for (const name of toolNames) {
    if (TOOLS_MAP[name]) {
      const tool = TOOLS_MAP[name].schema.function;
      systemPrompt += `## ${tool.name}\n${tool.description}\n\n`;

      // Add parameter details
      systemPrompt += 'Parameters:\n';
      const props = tool.parameters.properties;
      for (const [key, param] of Object.entries(props)) {
        const isRequired = tool.parameters.required && tool.parameters.required.includes(key);
        systemPrompt += `- \`${key}\`${isRequired ? ' (required)' : ''}: ${param.description}`;
        if (param.enum) systemPrompt += ` [${param.enum.join('|')}]`;
        if (param.default) systemPrompt += ` (default: ${param.default})`;
        systemPrompt += '\n';
      }
      systemPrompt += '\n';
    }
  }

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

        // Extract and process JSON tool blocks
        if (options.tools && options.tools.length > 0) {
          const toolBlocks = extractJsonTools(message.content);
          if (toolBlocks.length > 0) {
            await processJsonTools(toolBlocks);
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
};
