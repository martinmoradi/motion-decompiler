'use strict';

const fs = require('fs');
const path = require('path');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

function configPath(runDir) {
  return path.join(runDir, '00-config.json');
}

function pageModelPath(runDir) {
  return path.join(runDir, 'page-model.json');
}

function reconDir(runDir) {
  return path.join(runDir, '01-recon');
}

function loadRunConfig(runDir) {
  return readJson(configPath(runDir));
}

function loadPageModel(runDir) {
  return readJson(pageModelPath(runDir));
}

function savePageModel(runDir, pageModel) {
  writeJson(pageModelPath(runDir), pageModel);
}

module.exports = {
  configPath,
  loadPageModel,
  loadRunConfig,
  pageModelPath,
  readJson,
  reconDir,
  savePageModel,
  writeJson,
};
