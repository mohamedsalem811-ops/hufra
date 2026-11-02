// Extends app.json. Android push needs the Firebase config of the HUFRA
// project (google-services.json). CI writes it from the GOOGLE_SERVICES_JSON
// repository secret; it is never committed. Without it the app still builds,
// just without push.
const fs = require('node:fs');
const path = require('node:path');

module.exports = ({ config }) => {
  const file = './google-services.json';
  if (fs.existsSync(path.join(__dirname, file))) {
    config.android = { ...config.android, googleServicesFile: file };
  }
  return config;
};
