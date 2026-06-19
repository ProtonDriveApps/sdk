module.exports = {
    moduleDirectories: ['<rootDir>/node_modules', 'node_modules'],
    testPathIgnorePatterns: ['<rootDir>/dist'],
    collectCoverage: false,
    transformIgnorePatterns: ['node_modules/(?!(@openpgp|@protontech|openpgp|jsmimeparser)/)'],
    transform: {
        '^.+\\.(t|j)sx?$': '@swc/jest',
        '^.+\\.mjs$': '@swc/jest',
    },
    moduleNameMapper: {
        '^@openpgp/web-stream-tools$': '<rootDir>/node_modules/@openpgp/web-stream-tools/lib/index.js',
        // @protontech/crypto imports openpgp/lightweight; npm does not apply the bun patch used elsewhere
        '^openpgp/lightweight$': 'openpgp',
    },
    reporters: ['default'],
    setupFiles: ['./jest.setup.ts'],
};
