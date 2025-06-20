module.exports = {
    moduleDirectories: ['<rootDir>/node_modules', 'node_modules'],
    testPathIgnorePatterns: [],
    collectCoverage: false,
    transformIgnorePatterns: [],
    transform: {
      '^.+\\.(t|j)sx?$': '@swc/jest',
    },
    moduleNameMapper: {},
    reporters: ['default'],
};
