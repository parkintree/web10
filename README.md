# Web W10 · 待办清单 V3.0 工程化收尾

在 W9 的 TypeScript 数据层与 41 条 Vitest 用例基础上，把项目迁入 **Vite 8** 工程，
补齐 **ESLint + Prettier + strict**，并在结构化 Prompt 约束下完成一次可审查的复杂度重构。

## 目录结构

```
index.html                  Vite 入口页（原 resume/index.html，改由 src/main.ts 驱动）
src/
  main.ts                   Vite 浏览器入口：import './todo-app'
  todo-core.ts              纯函数数据层：校验、增删改查、脏数据恢复、存储
  todo-app.ts               UI 层：DOM、事件委托、localStorage 适配
  types.ts                  Todo / TodoFilter / StorageLike
  style.css                 简历与待办清单样式
tests/
  todo-core.handwritten.test.ts   手写单测（19 条）
  todo-core.ai-patched.test.ts    审查 AI 后修补的测试（22 条）
test/
  smoke.html                对 Vite 生产构建产物的真浏览器冒烟（15 项）
docs/
  prompt.md                 任务 3 的结构化 Prompt（含硬约束）
  before/                   重构前源码快照（只作 diff 证据）
  ai-refactor-core.diff     loadTodos 重构前后 diff
  ai-refactor-app.diff      initDom 重构前后 diff
  eslint-baseline.txt       重构前：2 error / 3 warning
  eslint-after.txt          重构后：0 error / 3 warning
  complexity-audit.txt      逐函数复杂度（阈值临时调成 1 得到全量数据）
  depth-audit.txt           把 max-depth 调到 2 仍无报错，说明实际深度 ≤ 2
  verify-differential.txt   旧版 / 新版 loadTodos 的 2503 组差分结果
  smoke-results.txt         真实浏览器 15/15 结果
  evasion-audit.txt         屏蔽手段扫描与阈值核对
  eslint-run.png            npx eslint src/ 终端截图
vite.config.ts              Vite 构建配置（base './'，target es2020）
vitest.config.ts            Vitest 配置
tsconfig.json               strict: true + noUncheckedIndexedAccess 等全开
.eslintrc.cjs               课程要求的三条规则（ESLint 8 传统配置）
.prettierrc.json            Prettier 格式约定
```

## 运行

```bash
npm install
npm run dev          # Vite 开发服务器
npm run build        # tsc --noEmit && vite build → dist/
npm run preview      # 用 HTTP 预览 dist（ES Module 不能用 file:// 直接打开）
npm test             # vitest run，41 条
npm run lint         # npx eslint src/
npm run format:check # prettier --check .
npm run verify       # build + test + lint
```

## 本周改动

1. **迁入 Vite 工程**
   - 根目录 `index.html` 通过 `<script type="module" src="/src/main.ts">` 加载入口；
   - 删除 W9 的 esbuild 与 `scripts/build.mjs`，构建统一交给 `vite build`；
   - `package.json` 固定 `"build": "tsc --noEmit && vite build"`、`"test": "vitest run"`；
   - `tsconfig.json` 保持 `strict: true`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes` 等严格选项；
   - 产物输出到 `dist/`（带 hash 的 CSS / JS），用 `npm run preview` 以 HTTP 打开。

2. **ESLint + Prettier**
   - `.eslintrc.cjs` 配置 `complexity: 10`、`max-depth: 3`、`@typescript-eslint/no-explicit-any: error`；
   - 课程指定 `.eslintrc.cjs`，因此固定 ESLint 8（ESLint 9+ 默认只读扁平配置）；
   - `eslint-config-prettier` 关闭格式类规则，格式交给 Prettier，避免两套规则互相打架；
   - 重构前 `npx eslint src/`：**2 error / 3 warning**；重构后：**0 error / 3 warning**。

3. **复杂度重构（任务 3）**
   - `initDom()`：complexity 12 → 4，拆成 `queryDomRefs()` + 类型守卫 `hasAllRefs()`；
   - `loadTodos()`：complexity 25 → 2，拆成
     `readStoredItems` / `toCandidate` / `collectCandidates` /
     `reserveUniqueIds` / `nextCandidateId` / `findFreeId` / `materializeTodos`；
   - 未使用 `eslint-disable`、`as any`、`@ts-ignore`，未调低任何阈值，未修改测试。

## 验证

| 验证              | 结果                                                                         |
| ----------------- | ---------------------------------------------------------------------------- |
| `npm test`        | 41/41 通过                                                                   |
| `npm run build`   | `tsc --noEmit` + Vite build 通过                                             |
| `npx eslint src/` | 0 error，3 warning（`no-console`，保留诊断日志）                             |
| 逐函数复杂度      | 最高 10（`handleListClick`），重构后的 `loadTodos` 为 2                      |
| max-depth         | 阈值调到 2 仍无报错（实际深度 ≤ 2）                                          |
| 差分测试          | 旧 / 新 `loadTodos` 在固定边界 + 2000 组随机 + 500 组 id 组合上完全一致      |
| 真浏览器冒烟      | 对生产构建产物 15/15 通过（含空白、超长、重复、切换、删除、脏数据恢复、XSS） |

> 3 条 `no-console` warning 是刻意保留的诊断输出：初始化失败、脏数据丢弃计数、恢复条数。
> 它们不影响验收（要求 warning ≤ 3），且对线上排障有价值；若课程要求 0 warning，
> 可在 `.eslintrc.cjs` 中关闭 `no-console` 或删除对应日志。
