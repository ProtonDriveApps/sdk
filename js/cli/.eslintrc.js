module.exports = {
    extends: [
        'plugin:@typescript-eslint/recommended'
    ],
    parser: '@typescript-eslint/parser',
    parserOptions: {
        tsconfigRootDir: __dirname,
        project: "./tsconfig.json",
        ecmaVersion: 2018,
        sourceType: "module"
    },
    rules: {
        "tsdoc/syntax": "warn",
        "no-console": "off",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/consistent-type-exports": "error",
        "@typescript-eslint/no-explicit-any": "warn",
    },
    overrides: [
        // Crypto module is copy-paste from clients monorepo.
        {
            files: [
                "src/crypto/**/*",
                "src/srp/**/*",
            ],
            rules: {
                "@typescript-eslint/ban-ts-comment": "off",
                "@typescript-eslint/consistent-type-exports": "off",
                "@typescript-eslint/no-empty-object-type": "off",
                "@typescript-eslint/no-explicit-any": "off",
                "@typescript-eslint/no-unused-expressions": "off",
                "@typescript-eslint/no-unused-vars": "off",
                "@typescript-eslint/no-wrapper-object-types": "off",
                "prefer-spread": "off",
                "tsdoc/syntax": "off",
            },
        },
    ],
    plugins: [
        "@typescript-eslint/eslint-plugin",
        "eslint-plugin-tsdoc"
    ]
};
