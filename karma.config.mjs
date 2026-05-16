export default function (config) {
  config.set({
    frameworks: ['mocha'],
    files: [{ pattern: 'test/**/*.test.js', watched: false }],
    preprocessors: {
      'test/**/*.test.js': ['webpack'],
    },
    webpack: {
      mode: 'development',
    },
    reporters: ['mocha'],
    port: 9876,
    colors: true,
    logLevel: config.LOG_INFO,
    browsers: ['ChromeHeadless'],
    autoWatch: false,
    singleRun: true,
    concurrency: Infinity,
  });
}
