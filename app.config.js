const appConfig = require('./app.json');

const easProjectId = process.env.EAS_PROJECT_ID || process.env.EXPO_PUBLIC_EAS_PROJECT_ID;

const config = {
  ...appConfig.expo,
  updates: {
    ...(appConfig.expo.updates || {}),
    fallbackToCacheTimeout: 0,
  },
};

if (easProjectId) {
  config.extra = {
    ...(config.extra || {}),
    eas: {
      projectId: easProjectId,
    },
  };

  config.updates = {
    ...config.updates,
    url: `https://u.expo.dev/${easProjectId}`,
  };
}

module.exports = {
  expo: config,
};
