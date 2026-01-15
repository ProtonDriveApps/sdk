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
    '^@openpgp/noble-hashes/esm/(.*)$': '<rootDir>/node_modules/@openpgp/noble-hashes/esm/$1.js',
    '^@openpgp/web-stream-tools$': '<rootDir>/node_modules/@openpgp/web-stream-tools/lib/index.js',
    '^openpgp/lightweight$': '<rootDir>/node_modules/openpgp/dist/lightweight/openpgp.min.mjs',
  },
  reporters: ['default'],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
