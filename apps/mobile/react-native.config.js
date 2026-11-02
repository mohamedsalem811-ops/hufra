// Firebase (crash reports, push) is Android-only until the iPhone app has a
// paid Apple account and its own Firebase config (plan 10.2). Keeping the
// native Firebase code out of the iPhone build avoids pulling in the Firebase
// iOS SDK, which would need a GoogleService-Info.plist and static frameworks.
module.exports = {
  dependencies: {
    '@react-native-firebase/app': { platforms: { ios: null } },
    '@react-native-firebase/crashlytics': { platforms: { ios: null } },
  },
};
