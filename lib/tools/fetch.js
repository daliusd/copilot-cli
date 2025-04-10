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
 *     <method>GET</method>
 *     <headers>
 *       <header>
 *         <name><![CDATA[Content-Type]]></name>
 *         <value><![CDATA[application/json]]></value>
 *       </header>
 *     </headers>
 *     <body><![CDATA[{"key": "value"}]]></body>
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
    <method>GET</method>
    <headers>
      <header>
        <name><![CDATA[Content-Type]]></name>
        <value><![CDATA[application/json]]></value>
      </header>
    </headers>
    <body><![CDATA[{"key": "value"}]]></body>
  </tool>
</tools>
\`\`\`

## Parameters
- \`url\`: The URL to fetch (required)
- \`method\`: HTTP method to use (GET, POST, PUT, DELETE) - defaults to GET
- \`headers\`: HTTP headers to include (optional)
- \`body\`: Request body for POST or PUT requests (optional)

## Notes
- Always wrap values in \`<![CDATA[ ]]>\` sections for URLs, header names/values, and body
- The response will include status, headers, and data
`,

    execute: async (params) => {
      try {
        const axios = require('axios');

        // Process headers from XML structure to object
        const headers = {};
        if (params.headers && params.headers.header) {
          const headerList = Array.isArray(params.headers.header) ? params.headers.header : [params.headers.header];

          headerList.forEach((h) => {
            headers[h.name] = h.value;
          });
        }

        const config = {
          method: params.method || 'GET',
          url: params.url,
          headers: headers,
        };

        if (params.body && (config.method === 'POST' || config.method === 'PUT')) {
          config.data = params.body;
        }

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

      // Extract method
      if (toolXml.method) result.params.method = toolXml.method;

      // Extract headers
      if (toolXml.headers && toolXml.headers.header) {
        const headers = Array.isArray(toolXml.headers.header) ? toolXml.headers.header : [toolXml.headers.header];

        result.params.headers = { header: [] };

        for (const header of headers) {
          if (header.name && header.value) {
            result.params.headers.header.push({
              name: header.name.__cdata || header.name,
              value: header.value.__cdata || header.value,
            });
          }
        }
      }

      // Extract body
      if (toolXml.body && toolXml.body.__cdata) result.params.body = toolXml.body.__cdata;

      return result;
    },
  },
};
