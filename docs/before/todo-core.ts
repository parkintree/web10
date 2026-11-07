/**
 * 待办清单数据层（纯函数，不碰 DOM、不读全局变量）。
 *
 * 分层目的：
 *   · todo-core.ts —— 所有业务规则与校验，输入输出都是普通数据，可直接单测；
 *   · todo-app.ts  —— 只负责 DOM、事件委托、localStorage 适配和提示文案。
 *
 * 类型安全约定：
 *   · 对外只暴露 interface / type，不使用 any；
 *   · 外部数据（JSON.parse、dataset.id）先当作 unknown / string | undefined，
 *     经过类型守卫后再进入业务函数；
 *   · 所有数组操作返回新数组，原数组只读，避免视图与数据互相污染。
 */

import type { StorageLike, Todo, TodoFilter } from './types';

export type { StorageLike, Todo, TodoFilter } from './types';

/** 单条待办的长度上限，与 W6–W8 保持一致。 */
export const MAX_LEN = 60;

export const FILTERS: readonly TodoFilter[] = ['all', 'active', 'completed'];

/** 失败原因用固定字面量，UI 层再映射成中文提示。 */
export type TodoFailureReason =
  'empty' | 'too-long' | 'duplicate' | 'invalid-id' | 'not-found';

export interface TodoFailure {
  readonly ok: false;
  readonly reason: TodoFailureReason;
}

export interface TodoMutationSuccess {
  readonly ok: true;
  readonly todos: readonly Todo[];
  readonly todo: Todo;
}

export type TodoMutationResult = TodoMutationSuccess | TodoFailure;

export interface TodoStats {
  readonly total: number;
  readonly active: number;
  readonly completed: number;
}

export interface ClearCompletedResult {
  readonly todos: readonly Todo[];
  readonly removed: number;
}

export interface LoadTodosResult {
  readonly todos: readonly Todo[];
  /** 被丢弃或修复的脏数据条数，用于 UI 控制台告警。 */
  readonly discarded: number;
}

/** 输入规范化：trim + 把内部连续空白折叠成一个空格。 */
export function normalizeText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

/** 业务 id 必须是正整数且处于安全整数范围。 */
export function isValidTodoId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * dataset.id 是 string | undefined，这里显式转成 number | null。
 *
 * 不用裸 Number(raw)：Number('12abc') 是 NaN 尚可挡住，但
 * Number('0x10') = 16、Number('1e3') = 1000，会把非十进制文本当成合法 id。
 * 因此先用十进制正则限定格式，再检查安全整数。
 */
export function parseTodoId(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const trimmed = raw.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) {
    return null;
  }
  const id = Number(trimmed);
  return isValidTodoId(id) ? id : null;
}

export function isTodoFilter(value: string | undefined): value is TodoFilter {
  return value === 'all' || value === 'active' || value === 'completed';
}

function failure(reason: TodoFailureReason): TodoFailure {
  return { ok: false, reason };
}

type TextValidation =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: 'empty' | 'too-long' | 'duplicate' };

/**
 * 文本校验集中在一处，新增 / 编辑共用，避免两条路径的规则漂移。
 * ignoreId：编辑时跳过自己，允许内容不变；新增时传 null。
 */
function validateText(
  todos: readonly Todo[],
  rawText: string,
  ignoreId: number | null,
): TextValidation {
  const text = normalizeText(rawText);

  if (text === '') {
    return { ok: false, reason: 'empty' };
  }
  if (text.length > MAX_LEN) {
    return { ok: false, reason: 'too-long' };
  }

  const duplicate = todos.some(
    (todo) => todo.id !== ignoreId && todo.text === text,
  );
  if (duplicate) {
    return { ok: false, reason: 'duplicate' };
  }

  return { ok: true, text };
}

/**
 * 新增待办：新项置顶，返回新数组。
 * id 由调用方生成，数据层只校验合法性，保证函数可重复测试。
 */
export function addTodo(
  todos: readonly Todo[],
  rawText: string,
  id: number,
): TodoMutationResult {
  const validation = validateText(todos, rawText, null);
  if (!validation.ok) {
    return validation;
  }
  if (!isValidTodoId(id)) {
    return failure('invalid-id');
  }

  const todo: Todo = {
    id,
    text: validation.text,
    completed: false,
  };

  return { ok: true, todos: [todo, ...todos], todo };
}

/** 切换完成状态：只替换命中项，其余对象保持原引用。 */
export function toggleTodo(
  todos: readonly Todo[],
  id: number,
): TodoMutationResult {
  if (!isValidTodoId(id)) {
    return failure('invalid-id');
  }

  let toggled: Todo | null = null;
  const nextTodos: Todo[] = [];

  for (const todo of todos) {
    if (todo.id !== id) {
      nextTodos.push(todo);
      continue;
    }
    toggled = { ...todo, completed: !todo.completed };
    nextTodos.push(toggled);
  }

  if (toggled === null) {
    return failure('not-found');
  }

  return { ok: true, todos: nextTodos, todo: toggled };
}

/** 删除：返回被删对象，便于 UI 提示或将来做「撤销」。 */
export function removeTodo(
  todos: readonly Todo[],
  id: number,
): TodoMutationResult {
  if (!isValidTodoId(id)) {
    return failure('invalid-id');
  }

  const removed = todos.find((todo) => todo.id === id);
  if (removed === undefined) {
    return failure('not-found');
  }

  return {
    ok: true,
    todos: todos.filter((todo) => todo.id !== id),
    todo: removed,
  };
}

/** 编辑文字：保留 id 与完成状态，只替换 text。 */
export function editTodo(
  todos: readonly Todo[],
  id: number,
  rawText: string,
): TodoMutationResult {
  if (!isValidTodoId(id)) {
    return failure('invalid-id');
  }

  const index = todos.findIndex((todo) => todo.id === id);
  const current = index === -1 ? undefined : todos[index];
  if (current === undefined) {
    return failure('not-found');
  }

  const validation = validateText(todos, rawText, id);
  if (!validation.ok) {
    return validation;
  }

  const updated: Todo = {
    id: current.id,
    text: validation.text,
    completed: current.completed,
  };

  return {
    ok: true,
    todos: todos.map((todo, i) => (i === index ? updated : todo)),
    todo: updated,
  };
}

export function clearCompleted(todos: readonly Todo[]): ClearCompletedResult {
  const nextTodos = todos.filter((todo) => !todo.completed);
  return { todos: nextTodos, removed: todos.length - nextTodos.length };
}

/** 生成下一个可用 id；到达安全整数上限时返回 null，由 UI 拒绝新增。 */
export function nextTodoId(todos: readonly Todo[]): number | null {
  let maxId = 0;
  for (const todo of todos) {
    if (todo.id > maxId) {
      maxId = todo.id;
    }
  }
  const next = maxId + 1;
  return Number.isSafeInteger(next) ? next : null;
}

export function getVisibleTodos(
  todos: readonly Todo[],
  filter: TodoFilter,
): readonly Todo[] {
  if (filter === 'active') {
    return todos.filter((todo) => !todo.completed);
  }
  if (filter === 'completed') {
    return todos.filter((todo) => todo.completed);
  }
  return [...todos];
}

export function getTodoStats(todos: readonly Todo[]): TodoStats {
  let completed = 0;
  for (const todo of todos) {
    if (todo.completed) {
      completed += 1;
    }
  }
  return {
    total: todos.length,
    active: todos.length - completed,
    completed,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * 从存储恢复。localStorage 与用户输入一样不可信，因此：
 *   · 读取 / JSON.parse 抛异常 → 空列表；
 *   · 顶层不是数组 → 空列表；
 *   · 单条形状不对（null、text 非字符串、completed 非布尔、超长）→ 丢弃；
 *   · id 缺失 / 重复 / 非法 → 重新分配，不丢弃整条业务数据；
 *   · 每一步都不使用 any，JSON.parse 的结果先收窄为 unknown。
 */
export function loadTodos(
  storage: StorageLike | null,
  key: string,
): LoadTodosResult {
  if (storage === null) {
    return { todos: [], discarded: 0 };
  }

  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { todos: [], discarded: 0 };
  }

  if (raw === null || raw.trim() === '') {
    return { todos: [], discarded: 0 };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return { todos: [], discarded: 0 };
  }

  if (!Array.isArray(parsed)) {
    return { todos: [], discarded: 0 };
  }

  const items: readonly unknown[] = parsed;
  interface Candidate {
    text: string;
    completed: boolean;
    id: number | null;
  }

  const candidates: Candidate[] = [];
  let discarded = 0;

  for (const item of items) {
    if (!isRecord(item)) {
      discarded += 1;
      continue;
    }

    const rawText = item['text'];
    if (typeof rawText !== 'string') {
      discarded += 1;
      continue;
    }

    const text = normalizeText(rawText);
    if (text === '' || text.length > MAX_LEN) {
      discarded += 1;
      continue;
    }

    const completed = item['completed'];
    if (typeof completed !== 'boolean') {
      discarded += 1;
      continue;
    }

    const rawId = item['id'];
    const id = typeof rawId === 'number' && isValidTodoId(rawId) ? rawId : null;

    candidates.push({ text, completed, id });
  }

  const usedIds = new Set<number>();
  for (const candidate of candidates) {
    if (candidate.id !== null && usedIds.has(candidate.id)) {
      candidate.id = null;
    }
    if (candidate.id !== null) {
      usedIds.add(candidate.id);
    }
  }

  let nextId = 1;
  for (const id of usedIds) {
    if (id >= nextId) {
      nextId = id + 1;
    }
  }

  const todos: Todo[] = [];
  for (const candidate of candidates) {
    let id = candidate.id;
    if (id === null) {
      while (usedIds.has(nextId)) {
        nextId += 1;
      }
      if (!Number.isSafeInteger(nextId)) {
        discarded += 1;
        continue;
      }
      id = nextId;
      usedIds.add(id);
      nextId += 1;
    }
    todos.push({ id, text: candidate.text, completed: candidate.completed });
  }

  return { todos, discarded };
}

/** 保存失败只返回 false，由 UI 决定是否提示；绝不让异常打断渲染。 */
export function saveTodos(
  storage: StorageLike | null,
  key: string,
  todos: readonly Todo[],
): boolean {
  if (storage === null) {
    return false;
  }
  try {
    storage.setItem(key, JSON.stringify(todos));
    return true;
  } catch {
    return false;
  }
}
