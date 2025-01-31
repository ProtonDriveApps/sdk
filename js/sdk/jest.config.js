module.exports = {
    moduleDirectories: ['<rootDir>/node_modules', 'node_modules'],
    testPathIgnorePatterns: ['<rootDir>/tests'],
    collectCoverage: false,
    transformIgnorePatterns: [],
    transform: {
        '^.+\\.(m?js|tsx?)$': '<rootDir>/jest.transform.js',
    },
    moduleNameMapper: {},
    reporters: ['default'],
};
