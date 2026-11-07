/**
 * W10 工程化：ESLint 传统配置（课程要求 .eslintrc.cjs）。
 *
 * 为什么用 ESLint 8：ESLint 9+ 默认只读扁平配置 eslint.config.js，
 * .eslintrc.cjs 必须额外设置 ESLINT_USE_FLAT_CONFIG=false 才会生效；
 * 课程指定 .eslintrc.cjs，因此固定 eslint@8.57.1。
 *
 * 三条硬性规则（教师验收项，不得调低）：
 *   · complexity: 10                  —— 单函数圈复杂度上限
 *   · max-depth: 3                    —— 嵌套块深度上限
 *   · @typescript-eslint/no-explicit-any: error —— 禁止显式 any
 * 额外的 no-console 设为 warn，保留 3 处诊断日志但提醒人工确认。
 */
module.exports = {
  root: true,
  env: {
    browser: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    // 关闭与 Prettier 冲突的格式类规则，格式统一交给 Prettier
    'prettier',
  ],
  ignorePatterns: ['dist/', 'coverage/', 'node_modules/'],
  rules: {
    complexity: ['error', 10],
    'max-depth': ['error', 3],
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': 'warn',
  },
};
