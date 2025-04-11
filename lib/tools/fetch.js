/**
 * Fetch Tool Documentation
 *
 * ## Description
 *
 * The Fetch tool allows making HTTP requests to external services.
 *
 * ## Usage
 *
 * To use the Fetch tool, wrap your commands in XML format:
 *
 * ```xml
 * <tools>
 *   <tool name="fetch">
 *     <url><![CDATA[https://api.example.com/data]]></url>
 *   </tool>
 * </tools>
 * ```
 */

module.exports = {
  fetch: {
    markdownDocs: `
# Fetch Tool

## Description
Makes HTTP requests to external services and returns the response.

## Usage
To use the Fetch tool, format your request as XML:

\`\`\`xml
<tools>
  <tool name="fetch">
    <url><![CDATA[https://api.example.com/data]]></url>
  </tool>
</tools>
\`\`\`

## Parameters
- \`url\`: The URL to fetch (required)

## Notes
- Always wrap values in \`<![CDATA[ ]]>\` sections for URLs, header names/values, and body
- The response will include status, headers, and data
`,

    execute: async (params) => {
      try {
        const axios = require('axios');

        const config = {
          method: 'GET',
          url: params.url,
        };

        const response = await axios(config);
        return {
          status: response.status,
          headers: response.headers,
          data: response.data,
        };
      } catch (error) {
        return {
          error: true,
          message: error.message,
          status: error.response?.status,
        };
      }
    },

    parseXmlResponse: function (toolXml) {
      const result = { params: {} };

      // Extract URL
      if (toolXml.url && toolXml.url.__cdata) result.params.url = toolXml.url.__cdata;

      return result;
    },
  },
};
