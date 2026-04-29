module.exports = {
    extends: [
        "plugin:@typescript-eslint/recommended"
    ],
    parser: "@typescript-eslint/parser",
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
                    ["^node:", "^bun:"],
                    ["^(?!@protontech/)@?\\w"],
                    ["^@protontech/"],
                    ["^\\."],
                ],
            },
        ],
        "simple-import-sort/exports": "error",
        "comma-spacing": ["error", { before: false, after: true }],
        "tsdoc/syntax": "warn",
        "no-console": "off",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/consistent-type-exports": "error",
        "@typescript-eslint/no-explicit-any": "warn",
    },
    plugins: [
        "@typescript-eslint/eslint-plugin",
        "eslint-plugin-tsdoc",
        "simple-import-sort",
    ]
};
