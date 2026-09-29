// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    ignores: ['dist/*', 'dist-ios/*', 'node_modules/*', '.expo/*', 'android/*', 'ios/*', 'coverage/*'],
  },
  {
    rules: {
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['src/utils/logger.ts', '**/__tests__/**', 'jest.setup.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // Script Node eseguiti da npm e dalla CI
    files: ['scripts/**/*.js', 'plugins/**/*.js'],
    languageOptions: { globals: { __dirname: 'readonly', __filename: 'readonly' } },
  },
  {
    files: ['scripts/**/*.js'],
    rules: { 'no-console': 'off' },
  },
  {
    // I mock di jest.mock() vanno caricati con require
    files: ['jest.setup.ts'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    files: ['**/__tests__/**', 'jest.setup.ts'],
    languageOptions: { globals: { jest: 'readonly', describe: 'readonly', it: 'readonly', expect: 'readonly' } },
  },
]);
