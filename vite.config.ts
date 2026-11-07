import { defineConfig } from 'vite';

/**
 * V3.0 工程化：用 Vite 统一开发服务器与生产构建。
 *
 * · base: './' 让 dist 产物可以部署在任意子路径（不进服务器根目录）；
 * · target: 'es2020' 与 W9 的浏览器基线保持一致；
 * · 类型检查不在 Vite 内部做，交给 package.json 的 build 脚本（tsc --noEmit）。
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    target: 'es2020',
    assetsInlineLimit: 4096,
  },
});
