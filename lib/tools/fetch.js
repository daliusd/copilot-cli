module.exports = {
  fetch: {
    schema: {
      type: 'function',
      function: {
        name: 'fetch',
        description: 'Fetches data from a URL',
        parameters: {
          type: 'object',
          properties: {
            url: {
              type: 'string',
              description: 'The URL to fetch',
            },
            method: {
              type: 'string',
              enum: ['GET', 'POST', 'PUT', 'DELETE'],
              description: 'HTTP method to use',
              default: 'GET',
            },
            headers: {
              type: 'object',
              description: 'HTTP headers to include',
            },
            body: {
              type: 'string',
              description: 'Request body for POST or PUT requests',
            },
          },
          required: ['url'],
        },
      },
    },
    execute: async (params) => {
      try {
        const axios = require('axios');
        const config = {
          method: params.method || 'GET',
          url: params.url,
          headers: params.headers || {},
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
  },
};
