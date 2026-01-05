const parser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');
const js = require('@eslint/js');

module.exports = [
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parser: parser,
            ecmaVersion: 2020,
            sourceType: "module"
        },
        plugins: {
            "@typescript-eslint": tsPlugin,
        },
        rules: {
            // Manually include recommended rules since we aren't using the full typescript-eslint config helper package
            ...tsPlugin.configs.recommended.rules,
            "no-console": "off",
            "@typescript-eslint/no-explicit-any": "warn",
            "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }]
        }
    }
];
