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
            '<rootDir>/../../../cli/node_modules',
            'node_modules',
        ],
        // TODO: We do not want to depend on the CLI's node_modules, but
        // for now it's the only way to get the single version of crypto
        // proxy used by both the account module and CLI.
        // SRP module requires Account API and also crypto proxy dierctly,
        // which must be however initialized in the CLI.
        moduleNameMapper: {
            '^@protontech/crypto$': '<rootDir>/../../../cli/node_modules/@protontech/crypto/src/index.ts',
            '^@protontech/crypto/(.*)$': '<rootDir>/../../../cli/node_modules/@protontech/crypto/src/$1',
        },
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
