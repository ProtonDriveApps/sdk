module.exports = {
    moduleDirectories: ['<rootDir>/node_modules', 'node_modules'],
    testPathIgnorePatterns: ['<rootDir>/dist'],
    collectCoverage: false,
    transformIgnorePatterns: [],
    transform: {
      '^.+\\.(t|j)sx?$': '@swc/jest',
    },
    moduleNameMapper: {},
    reporters: ['default'],
    setupFiles: ['<rootDir>/src/polyfill.ts']
};
