module.exports = {
  mongodbMemoryServerOptions: {
    instance: {
      dbName: 'jest'
    },
    binary: {
      version: '4.0.12',
      skipMD5: false
    },
    autoStart: false,
  },
};
