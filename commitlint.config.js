export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        'credentialing',
        'ui',
        'electron',
        'shared',
        'core',
        'deps',
      ],
    ],
    'scope-empty': [1, 'never'],
  },
}
