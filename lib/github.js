const axios = require('axios');
const { generateToolsSystemPrompt, extractXmlTools, processXmlTools } = require('./xml-tools');
const { getAndAuthorizeToken } = require('./auth');

/**
 * Get available GitHub Copilot models
 * @returns {Promise<Object>} Object with available models
 */
async function getModels() {
  const token = await getAndAuthorizeToken();
  if (!token) {
    throw new Error('Failed to authenticate with GitHub');
  }

  try {
    const url = 'https://api.githubcopilot.com/models';
    const headers = {
      Authorization: `Bearer ${token}`,
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
 * Run a prompt against a GitHub Copilot model
 * @param {Object} options Options for the prompt
 * @returns {Promise<void>}
 */
async function runPrompt(options) {
  const token = await getAndAuthorizeToken();
  if (!token) {
    throw new Error('Failed to authenticate with GitHub');
  }

  const url = 'https://api.githubcopilot.com/chat/completions';
  const headers = {
    Authorization: `Bearer ${token}`,
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
          await processXmlTools(toolBlocks);
        }
      }
    }
  } catch (error) {
    throw new Error(`Failed to get response: ${error.message}`);
  }
}

module.exports = {
  getModels,
  runPrompt,
};
