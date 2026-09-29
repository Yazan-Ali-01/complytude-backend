// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs', 'commitlint.config.js'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // Ban direct bullmq imports in apps — use @lib/queue abstractions instead
    files: ['apps/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'bullmq',
              message:
                'Import from @lib/queue instead. Direct bullmq usage is only allowed in libs/queue.',
            },
            {
              name: '@nestjs/bullmq',
              message:
                'Import from @lib/queue instead. Direct @nestjs/bullmq usage is only allowed in libs/queue.',
            },
          ],
        },
      ],
    },
  },
  {
    // User-facing error messages go through nestjs-i18n (en and ar): an exception takes a
    // translated message, never a literal one. The dev-only mock modules are exempt.
    files: ['apps/api/src/**/*.ts'],
    ignores: [
      'apps/api/src/**/*.spec.ts',
      'apps/api/src/modules/mock/**',
      'apps/api/src/modules/rag-mock/**',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "NewExpression[callee.name=/Exception$/][arguments.0.type=/^(Literal|TemplateLiteral)$/], NewExpression[callee.name=/Exception$/][arguments.0.type='BinaryExpression'][arguments.0.operator='+']",
          message:
            'Translate the message: this.i18n.t(<Module>I18n.errors.KEY) or I18nContext.current()?.t(...), with the key in locales/en and locales/ar.',
        },
      ],
    },
  },
  {
    files: ['**/test/**/*.ts', '**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/require-await': 'off',
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      // An unhandled rejection crashes the process (Node >= 15). `void` doesn't count as handling:
      // fire-and-forget calls need an explicit .catch().
      '@typescript-eslint/no-floating-promises': [
        'error',
        { ignoreVoid: false },
      ],
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/require-await': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },
);
