import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // 默认按文件汇总，终端截图简洁；逐条用例用 npm run test:verbose 查看。
    reporters: ['default'],
  },
});
