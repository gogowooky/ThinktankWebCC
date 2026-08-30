// ESLint flat config（最小構成 — PROJECT_REVIEW_REPORT.md D-6 / F1-7 の Phase 2）
//
// 方針: eslint / typescript-eslint の "recommended" セットは、この既存コードに対して
// 数千件の指摘（no-undef, no-explicit-any, prefer-const 等）を出すため採用しない。
// 「データ損失・バグに直結する書き方」だけを error にして CI を止める。
//
// 有効にしているルールはこれだけ:
//   - @typescript-eslint/no-floating-promises (error)
//       … 保存 Promise の await/catch 漏れ = 未保存データ損失の静的検出
//   - react-hooks/rules-of-hooks (error)      … Hooks 呼び出し規則違反
//   - react-hooks/exhaustive-deps (warn)      … 依存配列漏れ（可視化のみ）
//
// recommended セットの段階導入・any の削減は Phase 3 で。

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
      'electron/**', // CJS。別途対応（Phase 3）
      '**/*.cjs',
      'eslint.config.js',
      'vite.config.ts',
    ],
  },

  {
    files: ['src/**/*.{ts,tsx}', 'server/**/*.ts'],
    // base = パーサ + プラグイン登録のみ（ルールは一切 on にしない）
    extends: [tseslint.configs.base],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { 'react-hooks': reactHooks },
    linterOptions: {
      // recommended セット未導入の今は、未使用扱いされる disable コメント
      // （no-explicit-any 等・Phase 3 で有効化予定のルール向け）が大量に出るため off。
      // Phase 3 で recommended を入れる際に 'warn' へ戻す。
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
);
