const fs = require('fs');
const path = require('path');
const { convertCdataTags } = require('./utils');

/**
 * Editor Tool Documentation
 *
 * ## Description
 *
 * The Editor tool allows modifying files on the filesystem with edit operation.
 *
 * ## Usage
 *
 * To use the Editor tool, wrap your commands in XML format:
 *
 * ```xml
 * <tools>
 *   <tool name="editor">
 *     <action_type>add|replace|delete</action_type>
 *     <path><![CDATA[path/to/file]]></path>
 *     <start_line>10</start_line>
 *     <end_line>15</end_line>  <!-- Required for replace and delete -->
 *     <content><![CDATA[Your new content here]]></content>  <!-- Required for add and replace -->
 *   </tool>
 * </tools>
 * ```
 *
 * ## Action Types
 *
 * - `add`: Insert new content before the specified start_line
 * - `replace`: Replace content between start_line and end_line
 * - `delete`: Remove content between start_line and end_line
 *
 * ## XML Structure Reference
 *
 * - Always wrap content in CDATA sections to preserve formatting and special characters
 * - Multiple actions can be included for batch processing
 * - Line numbers are 1-indexed (first line is 1, not 0)
 */

module.exports = {
  editor: {
    markdownDocs: `
# Editor Tool

## Description
Edits files on the filesystem with operation.

## Usage
To use the Editor tool, format your request as XML:

\`\`\`xml
<tools>
  <tool name="editor">
    <action_type>add|replace|delete</action_type>
    <path><![CDATA[path/to/file]]></path>
    <start_line>10</start_line>
    <end_line>15</end_line>  <!-- Required for replace and delete -->
    <content><![CDATA[Your new content here]]></content>  <!-- Required for add and replace -->
  </tool>
</tools>
\`\`\`

## Parameters
- \`action_type\`: Action type (required)
- \`path\`: Path to the file to edit (required)
- \`start_line\`: Starting line number for the edit (required)
- \`end_line\`: Ending line number for the edit (inclusive, required for replace and delete)
- \`content\`: New content for the edit operation (required for add and replace)

## Action Types
- \`add\`: Insert new content before the specified start_line
- \`replace\`: Replace content between start_line and end_line
- \`delete\`: Remove content between start_line and end_line

## Notes
- Always wrap values in \`<![CDATA[ ]]>\` sections
- Line numbers are 1-indexed (first line is 1, not 0)
- Tool can be called multiple times for batch processing
`,
    schema: {
      type: 'function',
      function: {
        name: 'editor',
        description: 'Edits file on the filesystem',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to edit',
            },
            actionType: {
              type: 'string',
              enum: ['add', 'replace', 'delete'],
              description:
                'Edit action type: "add" inserts new content before startLine, "replace" replaces content between startLine and endLine, "delete" removes content between startLine and endLine.',
            },
            startLine: {
              type: 'number',
              description: 'Starting line number for the edit',
            },
            endLine: {
              type: 'number',
              description:
                'Ending line number for the edit (inclusive). Required for "replace" and "delete" action types.',
            },
            content: {
              type: 'string',
              description: 'New content for the edit operation. Required for "add" and "replace" action types.',
            },
          },
        },
        required: ['path', 'actionType', 'startLine'],
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

        let fileContent = '';
        if (fs.existsSync(filePath)) {
          fileContent = fs.readFileSync(filePath, 'utf8');
        }
        const lines = fileContent.split('\n');

        const { actionType, startLine, endLine, content } = params;
        const startIdx = startLine - 1;

        switch (actionType) {
          case 'add':
            if (!content) {
              throw new Error('Content is required for add action');
            }
            lines.splice(startIdx, 0, ...content.split('\n'));
            break;
          case 'replace':
            if (endLine === undefined || endLine === null || !content) {
              throw new Error('End line and content are required for replace action');
            }
            lines.splice(startIdx, endLine - startLine + 1, ...content.split('\n'));
            break;
          case 'delete':
            if (endLine === undefined || endLine === null) {
              throw new Error('End line is required for delete action');
            }
            lines.splice(startIdx, endLine - startLine + 1);
            break;
          default:
            throw new Error(`Invalid action action type: ${actionType}`);
        }

        fs.writeFileSync(filePath, lines.join('\n'));

        return {
          success: true,
          actions: params,
        };
      } catch (error) {
        return {
          error: true,
          message: error.message,
        };
      }
    },

    parseXmlResponse: function (action) {
      const params = {
        actionType: action.action_type,
      };

      if (action.path?.__cdata) {
        params.path = action.path.__cdata;
      }

      if (action.start_line?.__cdata) {
        params.startLine = parseInt(action.start_line.__cdata, 10);
      } else if (action.start_line) {
        params.startLine = parseInt(action.start_line, 10);
      }

      if (action.end_line?.__cdata) {
        params.endLine = parseInt(action.end_line.__cdata, 10);
      } else if (action.end_line) {
        params.endLine = parseInt(action.end_line, 10);
      }

      if (action.content?.__cdata) {
        params.content = convertCdataTags(action.content.__cdata);
      }

      return { params };
    },

    compare: function (param1, param2) {
      const pathResult = param1.path.localeCompare(param2.path);
      if (pathResult !== 0) {
        return pathResult;
      }
      return param2.startLine - param1.startLine;
    },
  },
};
