import tsParser from '@typescript-eslint/parser';

export default [
  { ignores: ['dist/**', 'coverage/**', '**/*.spec.ts', '**/*.test.ts'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
    },
    rules: {
      complexity: ['warn', { max: 15 }],
      'max-lines': ['warn', { max: 500, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 150, skipBlankLines: true, skipComments: true }],
      'max-statements': ['warn', 150],
    },
  },
];
