import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...obsidianmd.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      'no-console': ['error', { allow: ['error', 'warn'] }],
    },
  },
  {
    // node:test suites run under Node, never inside Obsidian.
    files: ['src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-floating-promises': 'off',
      'obsidianmd/no-nodejs-modules': 'off',
      '@typescript-eslint/no-restricted-imports': 'off',
      'import/no-nodejs-modules': 'off',
    },
  },
  {
    ignores: ['main.js', 'node_modules/**', '*.mjs'],
  },
);
