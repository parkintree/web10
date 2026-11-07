/**
 * Vite 浏览器入口。
 *
 * 与 W9 的差异：不再用 esbuild 预打包成 resume/todo.js，
 * 而是由 Vite 直接以 ES Module 加载 src/todo-app.ts（开发时 HMR，构建时打包）。
 */
import './todo-app';
