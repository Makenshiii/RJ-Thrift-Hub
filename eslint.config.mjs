import react from 'eslint-plugin-react';

export default [
  {
    files: ['client/src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    plugins: { react },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/no-danger': 'error'
    }
  },
  {
    files: ['backend/src/**/*.js', 'backend/test/**/*.js', 'shared/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module'
    }
  }
];
