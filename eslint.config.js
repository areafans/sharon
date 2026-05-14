import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Node-side code (Vercel functions, build scripts, vite config). Without
  // this scope, references to `process` and `Buffer` would be flagged as
  // undefined under the browser-globals lint config above.
  {
    files: ['api/**/*.{js,jsx}', 'scripts/**/*.{js,jsx}', 'vite.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
])
