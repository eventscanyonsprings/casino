const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const CONFIG_PATH = path.join(__dirname, 'config.yaml');

let config = null;

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  config = yaml.load(raw);
  return config;
}

function getConfig() {
  if (!config) {
    loadConfig();
  }
  return config;
}

// Export both the config accessor and the loaded config directly for convenience
const loaded = getConfig();
module.exports = loaded;
module.exports.getConfig = getConfig;
module.exports.reload = function() {
  config = null;
  return getConfig();
};