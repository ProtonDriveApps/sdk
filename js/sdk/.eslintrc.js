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
        "tsdoc/syntax": "warn",
        "no-console": "error",
        "@typescript-eslint/no-floating-promises": "error",
        "@typescript-eslint/consistent-type-exports": "error",
    },
    overrides: [
        {
            files: [
                "*.test.ts",
                "**/photos/**/*",
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
        "eslint-plugin-tsdoc"
    ]
};
