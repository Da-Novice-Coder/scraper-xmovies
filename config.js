const fs = require('fs-extra');
const path = require('path');

const configDir = path.join(__dirname, 'config');
const proxyFilePath = path.join(configDir, 'proxies.txt');
const userAgentFilePath = path.join(configDir, 'userAgents.txt');
const queueFilePath = path.join(configDir, 'queue.json');
const crawledFilePath = path.join(configDir, 'crawled.json');
const moviesFilePath = path.join(configDir, 'movies.json');

if (!fs.existsSync(configDir)) {
  fs.mkdirSync(configDir);
}

const defaultProxies = ['45.94.47.66:8110', '38.154.227.167:5868'];
const defaultUserAgents = [
  'Mozilla/5.0 (Windows NT 10.0; WOW64; rv:40.0) Gecko/20100101 Firefox/40.0',
  'Mozilla/5.0 (Windows NT 5.1; rv:40.0) Gecko/20100101 Firefox/40.0',
];

if (!fs.existsSync(proxyFilePath)) {
  fs.writeFileSync(proxyFilePath, defaultProxies.join('\n'));
}

if (!fs.existsSync(userAgentFilePath)) {
  fs.writeFileSync(userAgentFilePath, defaultUserAgents.join('\n'));
}

module.exports = {
  baseUrl: 'https://www.xvideos.com/', // new/1/
  maxRetries: 3,
  proxyFilePath,
  userAgentFilePath,
  queueFilePath,
  crawledFilePath,
  moviesFilePath,
};
