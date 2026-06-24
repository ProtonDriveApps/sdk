const plugins = [
    '@typescript-eslint/eslint-plugin',
    'eslint-plugin-tsdoc',
    'simple-import-sort',
];

const baseRules = {
    'simple-import-sort/imports': [
        'error',
        {
            groups: [
                ['^\u0000'],
                ['^node:', '^bun:'],
                ['^(?!@protontech/)@?\\w'],
                ['^@protontech/'],
                ['^proton-drive'],
                ['^\\.'],
            ],
        },
    ],
    'simple-import-sort/exports': 'error',
    'comma-spacing': ['error', { before: false, after: true }],
    'tsdoc/syntax': 'warn',
    'no-console': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/consistent-type-exports': 'error',
    '@typescript-eslint/no-explicit-any': 'error',
};

const overrides = [
    {
        files: [
            "*.test.ts",
        ],
        rules: {
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/no-unused-vars": "off",
        },
    },
];

module.exports.createConfig = function createConfig({ tsconfigRootDir, rules = {} }) {
    return {
        extends: ['plugin:@typescript-eslint/recommended'],
        parser: '@typescript-eslint/parser',
        parserOptions: {
            tsconfigRootDir,
            project: './tsconfig.json',
            sourceType: 'module',
        },
        plugins,
        rules: {
            ...baseRules,
            ...rules,
        },
        overrides,
    };
};
