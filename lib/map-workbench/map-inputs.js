'use strict';

const path = require('path');

const {
  motionScoutDir,
  reconDir,
  staticMapDir,
} = require('./artifacts');

function mapWorkbenchRequiredInputFiles(runDir) {
  return [
    path.join(reconDir(runDir), 'page-state.json'),
    path.join(staticMapDir(runDir), 'measurements.json'),
    path.join(staticMapDir(runDir), 'assertions.json'),
    path.join(staticMapDir(runDir), 'coverage.md'),
    path.join(motionScoutDir(runDir), 'motion-candidates.json'),
    path.join(motionScoutDir(runDir), 'assertions.json'),
    path.join(motionScoutDir(runDir), 'coverage.md'),
    path.join(runDir, 'page-model.json'),
  ];
}

module.exports = {
  mapWorkbenchRequiredInputFiles,
};
