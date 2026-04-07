module.exports = {
  moduleDirectories: ['<rootDir>/node_modules', '<rootDir>/../sdk/node_modules', 'node_modules'],
  testPathIgnorePatterns: [],
  collectCoverage: false,
  transformIgnorePatterns: [
    'node_modules/(?!(@openpgp|@protontech|openpgp|jsmimeparser)/)'
  ],
  transform: {
    '^.+\\.(t|j)sx?$': '@swc/jest',
    '^.+\\.mjs$': '@swc/jest',
  },
  moduleNameMapper: {
    '^@openpgp/web-stream-tools$': '<rootDir>/node_modules/@openpgp/web-stream-tools/lib/index.js',
    '^@protontech/drive-sdk$': '<rootDir>/../sdk/src/index.ts',
    '^@protontech/drive-sdk/(.*)$': '<rootDir>/../sdk/src/$1',
  },
  reporters: ['default'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
