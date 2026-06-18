module.exports =  {
    extends:  [
        'plugin:@typescript-eslint/recommended'
    ],
    parser:  '@typescript-eslint/parser',
    parserOptions: {
        tsconfigRootDir: __dirname,
        project: "./tsconfig.json",
        ecmaVersion: 2018,
        sourceType: "module"
    },
    rules: {
        "simple-import-sort/imports": [
            "error",
            {
                groups: [
                    ["^\u0000"],
                    ["^node:"],
                    ["^(?!@protontech/)@?\\w"],
                    ["^@protontech/"],
                    ["^\\."],
                ],
            },
        ],
        "simple-import-sort/exports": "error",
        "comma-spacing": ["error", { before: false, after: true }],
        "tsdoc/syntax": "warn",
        "no-console": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/consistent-type-exports": "error",
        'no-restricted-properties': ['error', {
            object: 'CryptoProxy',
            message: '`CryptoProxy` is not meant to be used in the SDK. Use `OpenPGPCryptoWithCryptoProxy` instead.'
        }],
    },
    overrides: [
        {
            files: [
                "*.test.ts",
            ],
            rules: {
                // Any is used during prototyping - remove once all the types are available to fix all the places.
                "@typescript-eslint/no-explicit-any": "off",
                // Many variables are unused during prototyping - remove later once more modules are implemented.
                "@typescript-eslint/no-unused-vars": "off",
            },
        },
    ],
    plugins: [
        "@typescript-eslint/eslint-plugin",
        "eslint-plugin-tsdoc",
        "simple-import-sort",
    ]
};
