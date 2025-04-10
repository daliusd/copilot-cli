const fs = require('fs');
const path = require('path');
const os = require('os');
const axios = require('axios');

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
 * @returns {Promise<string | null>} authorization token if success
 */
async function getAndAuthorizeToken() {
  oauthToken = getToken();
  if (!oauthToken) {
    console.error('No GitHub token found. Please install GitHub Copilot extension.');
    return null;
  }

  githubToken = await authorizeToken();
  if (!githubToken || Object.keys(githubToken).length === 0) {
    console.error('Could not authorize your GitHub Copilot token.');
    return null;
  }

  return githubToken.token;
}

module.exports = {
  getToken,
  getAndAuthorizeToken,
};
