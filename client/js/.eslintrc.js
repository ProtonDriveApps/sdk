const { createConfig } = require('../../config/js/.eslintrc.js');

module.exports = createConfig({
    tsconfigRootDir: __dirname,
    rules: {
        'no-restricted-properties': ['error', {
            object: 'CryptoProxy',
            message: '`CryptoProxy` is not meant to be used in the SDK. Use `OpenPGPCryptoWithCryptoProxy` instead.',
        }],
    },
});
