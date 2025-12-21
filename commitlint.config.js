module.exports = {
  extends: ['@commitlint/config-conventional'],
  rules: {
    // Only allow your specific types
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'test', 'docs', 'chore'],
    ],

    // Scope is required
    'scope-empty': [2, 'never'],

    // Subject must not end with period
    'subject-full-stop': [1, 'never', '.'],

    // Subject must not be uppercase
    'subject-case': [1, 'never', ['upper-case']],

    // Body must be present (for bullet points)
    'body-empty': [0, 'never'],

    // Body must start with blank line
    'body-leading-blank': [1, 'always'],

    // Footer must start with blank line
    'footer-leading-blank': [1, 'always'],

    // Max line length for header (type(scope): description (COM-4))
    'header-max-length': [2, 'always', 100],

    // Max line length for body (bullet points)
    'body-max-line-length': [2, 'always', 160],
  },
};
