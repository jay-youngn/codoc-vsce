import js from '@eslint/js';
import ts from 'typescript-eslint';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'out/**', 'node_modules/**', '.vscode-test/**', 'test/test-workspace/**'] },
  { files: ['**/*.mjs', '**/*.cjs'], languageOptions: { globals: globals.node }, rules: js.configs.recommended.rules },
  {
    files: ['src/**/*.ts'], languageOptions: { parser: ts.parser, globals: globals.node },
    rules: {
      'constructor-super': 'error', 'no-async-promise-executor': 'error', 'no-constant-condition': 'error',
      'no-dupe-else-if': 'error', 'no-duplicate-case': 'error', 'no-unreachable': 'error',
      'no-unsafe-finally': 'error', 'valid-typeof': 'error',
    },
  },
];
