const path = require('path');

const transform = {
    '^.+\\.(t|j)sx?$': '@swc/jest',
    '^.+\\.mjs$': '@swc/jest',
};

// npm does not apply the bun patch used elsewhere; allow transforming these packages.
const transformIgnorePatterns = [
    'node_modules/(?!(@openpgp|@protontech|openpgp|jsmimeparser)/)',
];

const moduleNameMapper = {
    '^@openpgp/web-stream-tools$':
        '<rootDir>/node_modules/@openpgp/web-stream-tools/lib/index.js',
    // @protontech/crypto imports openpgp/lightweight; npm does not apply the bun patch used elsewhere
    '^openpgp/lightweight$': 'openpgp',
};

const packageOverrides = {
    'proton-drive-cli': {
        moduleDirectories: [
            '<rootDir>/node_modules',
            '<rootDir>/../client/js/node_modules',
            'node_modules',
        ],
        moduleNameMapper: {
            '^@protontech/drive-sdk$': '<rootDir>/../client/js/src/index.ts',
            '^@protontech/drive-sdk/(.*)$': '<rootDir>/../client/js/src/$1',
        },
    },
    'proton-drive-sdk-account': {
        moduleDirectories: [
            '<rootDir>/node_modules',
            'node_modules',
        ],
    },
};

const defaultModuleDirectories = ['<rootDir>/node_modules', 'node_modules'];

module.exports.createConfig = function createConfig({ rootDir }) {
    const { name } = require(path.join(rootDir, 'package.json'));
    const overrides = packageOverrides[name] ?? {};

    return {
        moduleDirectories: overrides.moduleDirectories ?? defaultModuleDirectories,
        testPathIgnorePatterns: ['<rootDir>/dist'],
        collectCoverage: false,
        transformIgnorePatterns,
        transform,
        moduleNameMapper: {
            ...moduleNameMapper,
            ...overrides.moduleNameMapper,
        },
        reporters: ['default'],
        testEnvironment: 'node',
        setupFiles: [path.join(__dirname, 'jest.setup.ts')],
    };
};
