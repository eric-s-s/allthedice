import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import globals from 'globals';

export default [
    {
        ignores: ['node_modules/'],
    },
    js.configs.recommended,
    {
        plugins: {'@stylistic': stylistic},
        rules: {
            '@stylistic/max-len': ['error', {code: 120}],
            // `const {range, ...rest} = object` is how a field is left out of a copy
            'no-unused-vars': ['error', {ignoreRestSiblings: true}],
        },
    },
    {
        // the app's scripts are loaded by script tags and share one global scope, so a function defined in one
        // file is used in another. tsc (make typecheck) already reports undefined names across files.
        files: ['js/**/*.js'],
        languageOptions: {
            sourceType: 'script',
            globals: globals.browser,
        },
        rules: {
            'no-undef': 'off',
            'no-unused-vars': ['error', {vars: 'local', ignoreRestSiblings: true}],
        },
    },
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            sourceType: 'commonjs',
            globals: globals.node,
        },
    },
];
