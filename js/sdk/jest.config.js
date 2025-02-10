module.exports = {
    moduleDirectories: ['<rootDir>/node_modules', 'node_modules'],
    testPathIgnorePatterns: [],
    collectCoverage: false,
    transformIgnorePatterns: [],
    transform: {
        '^.+\\.(m?js|tsx?)$': '<rootDir>/jest.transform.js',
    },
    moduleNameMapper: {},
    reporters: ['default'],
};
