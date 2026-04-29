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
    // this rewrite affects pmcrypto and it's also covered by a bun patch, but in the CI integration tests
    // npm is used instead of bun for now, hence the patch is not applied, and we also manually apply
    // the change this way instead
    '^openpgp/lightweight$': 'openpgp'
  },
  reporters: ['default'],
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/src/tests/polyfill.ts']
};
