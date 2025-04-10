const fs = require('fs');
const path = require('path');
const { convertCdataTags } = require('./utils');

/**
 * Editor Tool Documentation
 *
 * ## Description
 *
 * The Editor tool allows modifying files on the filesystem with multiple edit operations.
 *
 * ## Usage
 *
 * To use the Editor tool, wrap your commands in XML format:
 *
 * ```xml
 * <tools>
 *   <tool name="editor">
 *     <action type="add|update|delete">
 *       <path><![CDATA[path/to/file]]></path>
 *       <start_line>10</start_line>
 *       <end_line>15</end_line>  <!-- Required for update and delete -->
 *       <code><![CDATA[Your new content here]]></code>  <!-- Required for add and update -->
 *     </action>
 *   </tool>
 * </tools>
 * ```
 *
 * ## Action Types
 *
 * - `add`: Insert new content before the specified start_line
 * - `update`: Replace content between start_line and end_line
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
Edits files on the filesystem with multiple operations across different paths.

## Usage
To use the Editor tool, format your request as XML:

\`\`\`xml
<tools>
  <tool name="editor">
    <action type="add|update|delete">
      <path><![CDATA[path/to/file]]></path>
      <start_line>10</start_line>
      <end_line>15</end_line>  <!-- Required for update and delete -->
      <code><![CDATA[Your new content here]]></code>  <!-- Required for add and update -->
    </action>
  </tool>
</tools>
\`\`\`

## Action Types
- \`add\`: Insert new content before the specified start_line
- \`update\`: Replace content between start_line and end_line
- \`delete\`: Remove content between start_line and end_line

## Parameters
- \`path\`: Path to the file to edit (required)
- \`start_line\`: Starting line number for the edit (required)
- \`end_line\`: Ending line number for the edit (inclusive, required for update and delete)
- \`code\`: New content for the edit operation (required for add and update)

## Notes
- Always wrap values in \`<![CDATA[ ]]>\` sections
- Line numbers are 1-indexed (first line is 1, not 0)
- Multiple actions can be included for batch processing
`,

    execute: async (params) => {
      try {
        // Group edits by file path
        const editsByFile = {};
        params.actions.forEach((action) => {
          const filePath = action.path;
          if (!editsByFile[filePath]) {
            editsByFile[filePath] = [];
          }
          editsByFile[filePath].push(action);
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
          fileEdits.sort((a, b) => b.start_line - a.start_line);

          fileEdits.forEach((action) => {
            const { type, start_line, end_line, code } = action;
            const startIdx = start_line - 1;

            switch (type) {
              case 'add':
                if (!code) {
                  throw new Error('Code content is required for add action');
                }
                lines.splice(startIdx, 0, ...code.split('\n'));
                break;
              case 'update':
                if (end_line === undefined || end_line === null || !code) {
                  throw new Error('End line and code content are required for update action');
                }
                lines.splice(startIdx, end_line - start_line + 1, ...code.split('\n'));
                break;
              case 'delete':
                if (end_line === undefined || end_line === null) {
                  throw new Error('End line is required for delete action');
                }
                lines.splice(startIdx, end_line - start_line + 1);
                break;
              default:
                throw new Error(`Invalid action type: ${type}`);
            }
          });

          fs.writeFileSync(filePath, lines.join('\n'));
        });

        return {
          success: true,
          actions: params.actions.length,
        };
      } catch (error) {
        return {
          error: true,
          message: error.message,
        };
      }
    },

    parseXmlResponse: function (toolXml) {
      const result = { params: {} };
      result.params.actions = [];

      // Handle both single action and multiple actions cases
      const actions = Array.isArray(toolXml.action) ? toolXml.action : [toolXml.action];

      for (const action of actions) {
        const actionObj = {
          type: action._type,
        };

        if (action.path?.__cdata) {
          actionObj.path = action.path.__cdata;
        }

        if (action.start_line?.__cdata) {
          actionObj.start_line = parseInt(action.start_line.__cdata, 10);
        } else if (action.start_line) {
          actionObj.start_line = parseInt(action.start_line, 10);
        }

        if (action.end_line?.__cdata) {
          actionObj.end_line = parseInt(action.end_line.__cdata, 10);
        } else if (action.end_line) {
          actionObj.end_line = parseInt(action.end_line, 10);
        }

        if (action.code?.__cdata) {
          actionObj.code = convertCdataTags(action.code.__cdata);
        }

        result.params.actions.push(actionObj);
      }

      return result;
    },
  },
};
