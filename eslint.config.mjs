import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
        ...globals.mocha,
      },
    },
    rules: {
      // Enforce consistent use of curly braces in control statements
      // --fix will add curly braces to all control statements
      curly: 'error',
    },
  },
];
