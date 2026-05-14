import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  // `Front_End/collab/` is vendored design-handoff reference (HTML+Babel
  // script-tag style prototypes that load React from a CDN). They're not
  // imported anywhere in the actual app, don't share our module conventions,
  // and shouldn't gate CI.
  globalIgnores(['dist', 'Front_End/**']),
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
    rules: {
      // We intentionally co-export helpers/constants from a few component
      // files (e.g. `TYPE_META` in Poster.jsx, `getFileType` in DocPreview.jsx).
      // Downgrade to warn with `allowConstantExport` so HMR-incompatible
      // exports surface as a hint instead of failing CI.
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // Allow `_`-prefixed args/vars to remain in destructured signatures
      // (used for "intentionally received but unused" props/handlers).
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
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
