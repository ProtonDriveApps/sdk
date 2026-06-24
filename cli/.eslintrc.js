const { createConfig } = require('../config/js/.eslintrc.js');

module.exports = createConfig({
    tsconfigRootDir: __dirname,
    rules: {
        'no-console': 'off',
    },
});
