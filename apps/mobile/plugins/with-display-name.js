// Keeps the native project names ASCII ("HUFRA") while the name under the
// icon stays Arabic on both platforms, whatever the phone's language.
const { withInfoPlist, withStringsXml, AndroidConfig } = require('expo/config-plugins');

module.exports = function withDisplayName(config, { displayName }) {
  config = withInfoPlist(config, (c) => {
    c.modResults.CFBundleDisplayName = displayName;
    return c;
  });
  config = withStringsXml(config, (c) => {
    c.modResults = AndroidConfig.Strings.setStringItem(
      [{ $: { name: 'app_name', translatable: 'false' }, _: displayName }],
      c.modResults,
    );
    return c;
  });
  return config;
};
