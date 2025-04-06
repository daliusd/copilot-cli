const fs = require('fs');
const path = require('path');

module.exports = {
  editor: {
    tool: {
      type: 'function',
      function: {
        name: 'editor',
        description: 'Edits files on the filesystem',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to edit',
            },
            content: {
              type: 'string',
              description: 'New content for the file',
            },
            mode: {
              type: 'string',
              enum: ['write', 'append'],
              description: 'Write mode: overwrite or append',
              default: 'write',
            },
          },
          required: ['path', 'content'],
        },
      },
    },
    execute: async (params) => {
      try {
        const filePath = path.resolve(params.path);

        // Create directory if it doesn't exist
        const dirPath = path.dirname(filePath);
        if (!fs.existsSync(dirPath)) {
          fs.mkdirSync(dirPath, { recursive: true });
        }

        if (params.mode === 'append' && fs.existsSync(filePath)) {
          fs.appendFileSync(filePath, params.content);
        } else {
          fs.writeFileSync(filePath, params.content);
        }

        return {
          success: true,
          path: filePath,
          mode: params.mode,
        };
      } catch (error) {
        return {
          error: true,
          message: error.message,
        };
      }
    },
  },
};
