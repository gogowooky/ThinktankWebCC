// ESLint flat config — Phase 3（PROJECT_REVIEW_REPORT.md D-6 / D-8 / F1-7）
//
// Phase 2 は「recommended セットは採用せず error 2 本だけ」だった。
// Phase 3 で recommended（eslint + typescript-eslint）を土台に採用し、
// 既存コードに大量に出るもの（any 111 / unused-vars 40）は warn に固定、
// ノイズがなく自動修正済みのもの（prefer-const / no-useless-escape /
// no-irregular-whitespace / no-empty-object-type）を error に格上げした。
//
// error に上げる判断基準: (1) バグに直結する or (2) 件数 0（自動修正済み）で
// 今後の新規混入だけを止めたい。warn: 既存の負債を可視化するが当面ブロックしない。

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'dist-server/**',
      'release/**',
      'release2/**',
      'coverage/**',
      'node_modules/**',
      'docs/**',
      'scripts/**',
      'public/**',
      'electron/**', // CJS。別途対応
      '.agent/**', // 過去の agent セッションの git worktree（.gitignore 済み）
      '.claude/**', // 同上
      'reference2/**',
      'reference4/**',
      '**/*.cjs',
      'eslint.config.js',
      'vite.config.ts',
    ],
  },

  // recommended を土台に（rules は下のブロックで調整）
  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'react-hooks': reactHooks },
    linterOptions: {
      // 未使用の eslint-disable コメントを検出（誤った抑制の温床対策 — Phase 2 で一旦 off にしていた）
      reportUnusedDisableDirectives: 'warn',
    },
    rules: {
      // TS が担当するため無効化
      'no-undef': 'off',

      // ── error ────────────────────────────────────────────────
      '@typescript-eslint/no-floating-promises': 'error', // 保存 Promise の握り漏れ
      'react-hooks/rules-of-hooks': 'error',
      'prefer-const': 'error',
      'no-irregular-whitespace': [
        'error',
        { skipComments: true, skipStrings: true, skipTemplates: true, skipJSXText: true },
      ],
      '@typescript-eslint/no-empty-object-type': 'error',

      // ── warn（既存の負債の可視化・当面ブロックしない）───────
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // 正規表現の不要エスケープ。ESLint は誤修正リスクのため自動修正しない仕様なので
      // 既存 5 件は手動で潰すまで warn に留める。
      'no-useless-escape': 'warn',
      'no-useless-assignment': 'warn',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  // テストコードは any / 非 null アサーションを許容
  {
    files: ['src/**/*.test.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
