const fs = require('fs');
const path = require('path');

module.exports = {
  editor: {
    schema: {
      type: 'function',
      function: {
        name: 'editor',
        description: 'Edits files on the filesystem with multiple edit operations on different paths',
        parameters: {
          type: 'object',
          properties: {
            edits: {
              type: 'array',
              description:
                'A list of edit operations where each edit specifies its own file path. Edits on the same file must not overlap and are applied from the bottom up (highest startLine first).',
              items: {
                type: 'object',
                properties: {
                  path: {
                    type: 'string',
                    description: 'Path to the file to edit',
                  },
                  mode: {
                    type: 'string',
                    enum: ['add', 'replace', 'delete'],
                    description:
                      'Edit mode: "add" inserts new content before startLine, "replace" replaces content between startLine and endLine, "delete" removes content between startLine and endLine.',
                  },
                  startLine: {
                    type: 'number',
                    description: 'Starting line number for the edit',
                  },
                  endLine: {
                    type: 'number',
                    description:
                      'Ending line number for the edit (inclusive). Required for "replace" and "delete" modes.',
                  },
                  content: {
                    type: 'string',
                    description: 'New content for the edit operation. Required for "add" and "replace" modes.',
                  },
                },
                required: ['path', 'mode', 'startLine'],
              },
            },
          },
          required: ['edits'],
        },
      },
    },
    execute: async (params) => {
      try {
        // Group edits by file path
        const editsByFile = {};
        params.edits.forEach((edit) => {
          if (!editsByFile[edit.path]) {
            editsByFile[edit.path] = [];
          }
          editsByFile[edit.path].push(edit);
        });

        // Process each file's edits individually
        Object.keys(editsByFile).forEach((file) => {
          const filePath = path.resolve(file);
          // Create directory if it doesn't exist
          const dirPath = path.dirname(filePath);
          if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
          }

          let fileContent = '';
          if (fs.existsSync(filePath)) {
            fileContent = fs.readFileSync(filePath, 'utf8');
          }
          const lines = fileContent.split('\n');
          const fileEdits = editsByFile[file];
          // Sort edits in descending order of startLine
          fileEdits.sort((a, b) => b.startLine - a.startLine);

          fileEdits.forEach((edit) => {
            const { mode, startLine, endLine, content } = edit;
            const startIdx = startLine - 1;
            switch (mode) {
              case 'add':
                if (content === undefined) {
                  throw new Error('Content is required for add mode');
                }
                lines.splice(startIdx, 0, ...content.split('\n'));
                break;
              case 'replace':
                if (endLine === undefined || content === undefined) {
                  throw new Error('endLine and content are required for replace mode');
                }
                lines.splice(startIdx, endLine - startLine + 1, ...content.split('\n'));
                break;
              case 'delete':
                if (endLine === undefined) {
                  throw new Error('endLine is required for delete mode');
                }
                lines.splice(startIdx, endLine - startLine + 1);
                break;
              default:
                throw new Error('Invalid mode');
            }
          });

          fs.writeFileSync(filePath, lines.join('\n'));
        });

        return {
          success: true,
          edits: params.edits,
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
