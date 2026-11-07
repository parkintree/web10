# 任务 3：结构化 Prompt（ESLint 工程化改造）

```text
# 角色
你是资深 TypeScript 前端工程师，熟悉 ESLint 规则语义与 Vite 工程化。

# 上下文
项目：待办清单 V3.0，已迁入 Vite 8 工程。
源码：src/todo-core.ts（纯函数数据层）、src/todo-app.ts（DOM / 存储适配层）。
现状：npx eslint src/ 报出以下错误（其他规则已通过）：
  · src/todo-app.ts  initDom()   complexity 超过 10（一长串 || 判空）
  · src/todo-core.ts loadTodos() complexity 超过 10（脏数据逐条校验 + id 重编号）
当前测试：tests/ 下 41 条 Vitest 用例，改代码前全绿。

# 任务
在不改变任何业务行为的前提下，把上述两个函数重构到
complexity ≤ 10、max-depth ≤ 3，使 npx eslint src/ 达到 0 error。

# 硬约束（违反任意一条即视为失败）
1. 不改业务行为：校验规则、失败原因（reason）、数据顺序、返回值形状、
   localStorage 读写时机、提示文案，全部保持原样。
2. 不删除任何校验 / 判断分支，包括「空文本、超长、重复、非法 id、
   not-found、存储异常降级」。
3. 不使用 eslint-disable / eslint-disable-next-line / @ts-ignore /
   @ts-expect-error 等任何屏蔽手段。
4. 不使用 any / as any / 双重断言绕过类型；不改 tsconfig 的 strict。
5. 不调低规则阈值：complexity 仍为 10、max-depth 仍为 3、
   no-explicit-any 仍为 error。
6. 不把逻辑挪进 eval、new Function、字符串拼接、动态属性等
   ESLint 看不见的地方。
7. 不修改 tests/ 下任何测试文件；测试是行为基线的唯一裁判。

# 允许的改造手段
· 提取语义完整的具名辅助函数（每个新函数也要满足复杂度 / 深度上限）；
· 用早返回（early return）压平嵌套；
· 用类型守卫（type guard）替代重复的 && 判空链；
· 合并同义分支，但不合并不同 reason 的失败分支。

# 输出格式
1. 修改前后的核心 diff（只贴改动函数及新增辅助函数）；
2. 每个新增函数的复杂度自评（complexity 与 max-depth 估算）；
3. 逐条说明「哪条业务规则由哪段代码继续保证」；
4. 若某处无法在约束内降复杂度，明确说明并给出替代方案，不要偷偷绕过。

# 自检清单
- [ ] npx eslint src/ 0 error？
- [ ] 41 条测试仍全绿？
- [ ] npm run build（tsc --noEmit && vite build）通过？
- [ ] diff 里没有删除任何校验、没有 eslint-disable、没有 any / as any？
- [ ] 新增辅助函数自身的 complexity ≤ 10、max-depth ≤ 3？
```
