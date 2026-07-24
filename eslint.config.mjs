import coreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypescript from 'eslint-config-next/typescript'

// Flat config (ESLint 9 / Next.js 16). eslint-config-next@16 SUDAH flat-native
// (tiap entry mengekspor Linter.Config[]), jadi di-spread langsung — TANPA
// @eslint/eslintrc FlatCompat (kombinasi itu melempar "circular structure to
// JSON" di validator config lama). `next lint` sudah deprecated; lint via CLI
// `eslint .` (lihat script "lint").
const eslintConfig = [
  // Global ignores — artefak generate/output & tooling terpasang, bukan source
  // aplikasi. ESLint flat config TIDAK membaca .gitignore, jadi disebut eksplisit.
  { ignores: ['.next/**', 'graphify-out/**', '.claude/**', 'next-env.d.ts'] },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // set-state-in-effect (rule baru react-hooks v7 / React 19): 17 kasus di 8
      // file inti adalah pola konvensional yang benar (init dari localStorage,
      // reset on-nav, reset loading sebelum fetch, cleanup object-URL). DI-DEFER
      // jadi `warn` — bukan di-refactor massal cuma demi lolos gate; file-file
      // itu baru divalidasi live end-to-end. Daftar lengkap dicatat di ROADMAP
      // sebagai known tech debt utk direview nanti.
      'react-hooks/set-state-in-effect': 'warn',
      // Hormati konvensi prefix `_` untuk nilai yang sengaja dibuang
      // (mis. `{ updatedAt: _omit, ...rest }`).
      '@typescript-eslint/no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      }],
    },
  },
]

export default eslintConfig
