const { createConfig } = require('../../config/js/jest.config.js');

const config = createConfig({ rootDir: __dirname });

module.exports = {
    ...config,
    // @boltffi/runtime (used by src/search) is ESM-only and exports just an
    // `import` condition: point Jest at its entry and let SWC transform it.
    moduleNameMapper: {
        ...config.moduleNameMapper,
        '^@boltffi/runtime$': '<rootDir>/node_modules/@boltffi/runtime/dist/index.js',
    },
    transformIgnorePatterns: config.transformIgnorePatterns.map((pattern) =>
        pattern.replace('(?!(', '(?!(@boltffi|'),
    ),
};
