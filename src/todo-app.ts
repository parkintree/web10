/**
 * 待办清单 UI 层（浏览器入口）。
 *
 * 与 W8 的差异：
 *   1. 数据规则全部移到 todo-core.ts，本文件只做 DOM 与存储适配；
 *   2. id 由 string 改为 number：写入 dataset 时 String(todo.id)，
 *      读出时 parseTodoId(item.dataset.id) 显式转换并校验；
 *   3. 所有可能为 null 的查询都有类型守卫，strictNullChecks 下零报错；
 *   4. 删除 / 切换 / 编辑仍使用事件委托，重绘不丢监听。
 *
 * 构建：npm run build 先 tsc --noEmit 类型检查，再由 Vite 打包到 dist/。
 */

import {
  MAX_LEN,
  addTodo,
  clearCompleted as clearCompletedInCore,
  editTodo,
  getTodoStats,
  getVisibleTodos,
  isTodoFilter,
  loadTodos,
  nextTodoId,
  parseTodoId,
  removeTodo,
  saveTodos,
  toggleTodo,
} from './todo-core';
import type {
  StorageLike,
  Todo,
  TodoFailureReason,
  TodoFilter,
} from './todo-core';

/* localStorage 键名带版本号：W9 的数据模型 id 已改为 number。 */
const STORAGE_KEY = 'web09.todos.v2';

const TIP_DURATION = 2400;

interface DomRefs {
  readonly input: HTMLInputElement;
  readonly addBtn: HTMLButtonElement;
  readonly list: HTMLUListElement;
  readonly tip: HTMLElement;
  readonly empty: HTMLElement;
  readonly filterWrap: HTMLElement;
  readonly filters: readonly HTMLButtonElement[];
  readonly summary: HTMLElement;
  readonly countAll: HTMLElement;
  readonly countActive: HTMLElement;
  readonly countCompleted: HTMLElement;
}

/* ---------------- 模块状态 ---------------- */

let dom: DomRefs | null = null;
let storage: StorageLike | null = null;
let todos: readonly Todo[] = [];
let currentFilter: TodoFilter = 'all';
let tipTimer: number | null = null;

/* ---------------- DOM 查询：所有 null 都在这里收口 ---------------- */

type ElementCtor<T extends Element> = new (...args: never[]) => T;

function getById<T extends Element>(
  id: string,
  ctor: ElementCtor<T>,
): T | null {
  const element = document.getElementById(id);
  if (element === null) {
    return null;
  }
  return element instanceof ctor ? element : null;
}

function getFilters(): readonly HTMLButtonElement[] {
  const nodes = document.querySelectorAll('.todo-filter');
  const buttons: HTMLButtonElement[] = [];
  for (const node of nodes) {
    if (node instanceof HTMLButtonElement) {
      buttons.push(node);
    }
  }
  return buttons;
}

/** 每个引用都可能是 null，查询完成后统一做一次完整性判断。 */
type NullableDomRefs = { [K in keyof DomRefs]: DomRefs[K] | null };

function queryDomRefs(): NullableDomRefs {
  return {
    input: getById('todo-input', HTMLInputElement),
    addBtn: getById('todo-add', HTMLButtonElement),
    list: getById('todo-list', HTMLUListElement),
    tip: getById('todo-tip', HTMLElement),
    empty: getById('todo-empty', HTMLElement),
    filterWrap: getById('todo-filters', HTMLElement),
    summary: getById('todo-summary', HTMLElement),
    countAll: getById('todo-count-all', HTMLElement),
    countActive: getById('todo-count-active', HTMLElement),
    countCompleted: getById('todo-count-completed', HTMLElement),
    filters: getFilters(),
  };
}

/** 类型守卫：所有引用都非 null 时，才允许把 NullableDomRefs 收窄成 DomRefs。 */
function hasAllRefs(refs: NullableDomRefs): refs is DomRefs {
  return Object.values(refs).every((value) => value !== null);
}

function warnMissingDom(): null {
  console.warn(
    '[待办清单] 初始化失败：页面缺少必要的 DOM 节点，本模块已跳过。',
  );
  return null;
}

function initDom(): DomRefs | null {
  const refs = queryDomRefs();
  /*
   * filters 是数组而不是元素：空数组不是 null，hasAllRefs 检查不出来，
   * 所以单独判断 length。两种失败都走同一条告警路径。
   */
  if (refs.filters === null || refs.filters.length === 0) {
    return warnMissingDom();
  }
  if (!hasAllRefs(refs)) {
    return warnMissingDom();
  }
  return refs;
}

/* ---------------- 存储适配 ---------------- */

function getStorage(): StorageLike | null {
  try {
    const local = window.localStorage;
    /* 隐私模式下 localStorage 可能「存在但不可写」，探测一次写入再清理。 */
    const probeKey = 'web09.storage-probe';
    local.setItem(probeKey, '1');
    local.removeItem(probeKey);
    return local;
  } catch {
    return null;
  }
}

function persist(): void {
  if (!saveTodos(storage, STORAGE_KEY, todos)) {
    showTip('浏览器本地存储不可用，刷新后本次修改会丢失。');
  }
}

/* ---------------- 提示条 ---------------- */

function clearTip(): void {
  if (tipTimer !== null) {
    window.clearTimeout(tipTimer);
    tipTimer = null;
  }
  if (dom !== null) {
    dom.tip.textContent = '';
  }
}

function showTip(message: string): void {
  if (dom === null) {
    return;
  }
  clearTip();
  dom.tip.textContent = message;
  tipTimer = window.setTimeout(() => {
    if (dom !== null) {
      dom.tip.textContent = '';
    }
    tipTimer = null;
  }, TIP_DURATION);
}

const FAILURE_MESSAGES: Record<TodoFailureReason, string> = {
  empty: '内容不能为空，请输入待办事项。',
  'too-long': `内容过长，最多 ${MAX_LEN} 字，请精简后重试。`,
  duplicate: '该待办已存在，无需重复添加。',
  'invalid-id': '待办编号无效，本次操作已取消。',
  'not-found': '该待办不存在或已被删除。',
};

function messageFor(reason: TodoFailureReason): string {
  return FAILURE_MESSAGES[reason];
}

/* ---------------- 渲染 ---------------- */

function createTodoItem(todo: Todo): HTMLLIElement {
  const item = document.createElement('li');
  item.className = 'todo-item' + (todo.completed ? ' is-completed' : '');
  /* 数据层 id 是 number，DOM 只能存字符串：显式转换，读取时再 parse。 */
  item.dataset.id = String(todo.id);

  const label = document.createElement('label');
  label.className = 'todo-check';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'todo-toggle';
  checkbox.checked = todo.completed;

  const text = document.createElement('span');
  text.className = 'todo-text';
  text.textContent = todo.text;

  label.append(checkbox, text);

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'todo-edit';
  editBtn.dataset.action = 'edit';
  editBtn.textContent = '编辑';
  editBtn.setAttribute('aria-label', `编辑待办：${todo.text}`);

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'todo-remove';
  removeBtn.dataset.action = 'delete';
  removeBtn.setAttribute('aria-label', `删除待办：${todo.text}`);

  const removeIcon = document.createElement('span');
  removeIcon.className = 'todo-remove-icon';
  removeIcon.setAttribute('aria-hidden', 'true');
  removeIcon.textContent = '×';
  removeBtn.appendChild(removeIcon);

  item.append(label, editBtn, removeBtn);
  return item;
}

function render(): void {
  if (dom === null) {
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const todo of getVisibleTodos(todos, currentFilter)) {
    fragment.appendChild(createTodoItem(todo));
  }
  dom.list.replaceChildren(fragment);

  updateCounts();
  updateFilters();
  updateEmptyState();
}

function updateCounts(): void {
  if (dom === null) {
    return;
  }
  const stats = getTodoStats(todos);
  dom.countAll.textContent = String(stats.total);
  dom.countActive.textContent = String(stats.active);
  dom.countCompleted.textContent = String(stats.completed);
  dom.summary.textContent = `共 ${stats.total} 条 · 未完成 ${stats.active} 条`;
}

function updateFilters(): void {
  if (dom === null) {
    return;
  }
  for (const button of dom.filters) {
    const value = button.dataset.filter;
    const pressed = isTodoFilter(value) && value === currentFilter;
    button.setAttribute('aria-pressed', pressed ? 'true' : 'false');
  }
}

const EMPTY_MESSAGES: Record<TodoFilter, string> = {
  all: '暂无待办，输入内容后点击「添加」或按回车键即可新增。',
  active: '没有未完成的待办，给自己放个小假吧。',
  completed: '还没有已完成的待办，勾选左侧方框即可标记完成。',
};

function updateEmptyState(): void {
  if (dom === null) {
    return;
  }
  dom.empty.textContent = EMPTY_MESSAGES[currentFilter];
}

/* ---------------- 业务入口 ---------------- */

function handleAdd(): void {
  if (dom === null) {
    return;
  }

  const id = nextTodoId(todos);
  if (id === null) {
    showTip('待办编号已用尽，无法继续新增。');
    dom.input.focus();
    return;
  }

  const result = addTodo(todos, dom.input.value, id);
  if (!result.ok) {
    showTip(messageFor(result.reason));
    dom.input.focus();
    return;
  }

  todos = result.todos;
  persist();
  render();

  dom.input.value = '';
  dom.input.focus();
  clearTip();
}

function handleDelete(id: number): void {
  const result = removeTodo(todos, id);
  if (!result.ok) {
    showTip(messageFor(result.reason));
    return;
  }
  todos = result.todos;
  persist();
  render();
  showTip('已删除一条待办。');
}

function handleToggle(id: number): void {
  const result = toggleTodo(todos, id);
  if (!result.ok) {
    showTip(messageFor(result.reason));
    return;
  }
  todos = result.todos;
  persist();
  render();
  restoreFocus(id, '.todo-toggle');
}

function handleEdit(id: number): void {
  const current = todos.find((todo) => todo.id === id);
  if (current === undefined) {
    showTip(messageFor('not-found'));
    return;
  }

  const raw = window.prompt('修改待办内容：', current.text);
  if (raw === null) {
    return;
  }

  const result = editTodo(todos, id, raw);
  if (!result.ok) {
    showTip(messageFor(result.reason));
    return;
  }

  todos = result.todos;
  persist();
  render();
  showTip('已修改待办。');
}

function setFilter(next: string | undefined): void {
  if (!isTodoFilter(next) || next === currentFilter) {
    return;
  }
  currentFilter = next;
  render();
}

function clearAllCompleted(): number {
  const result = clearCompletedInCore(todos);
  if (result.removed === 0) {
    showTip('没有已完成的待办需要清除。');
    return 0;
  }
  todos = result.todos;
  persist();
  render();
  showTip(`已清除 ${result.removed} 条已完成的待办。`);
  return result.removed;
}

function restoreFocus(id: number, selector: string): void {
  if (dom === null) {
    return;
  }
  const item = dom.list.querySelector(`.todo-item[data-id="${id}"]`);
  if (!(item instanceof HTMLLIElement)) {
    return;
  }
  const control = item.querySelector(selector);
  if (control instanceof HTMLElement) {
    control.focus();
  }
}

/* ---------------- 事件委托 ---------------- */

function handleListClick(event: MouseEvent): void {
  if (dom === null) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  const item = target.closest('li');
  if (!(item instanceof HTMLLIElement) || !dom.list.contains(item)) {
    return;
  }

  const id = parseTodoId(item.dataset.id);
  if (id === null) {
    return;
  }

  const editBtn = target.closest('[data-action="edit"]');
  if (editBtn instanceof HTMLButtonElement && item.contains(editBtn)) {
    handleEdit(id);
    return;
  }

  const deleteBtn = target.closest('[data-action="delete"]');
  if (!(deleteBtn instanceof HTMLButtonElement) || !item.contains(deleteBtn)) {
    return;
  }

  handleDelete(id);
  /* 删除是终止性操作，处理完立即结束，绝不继续执行切换。 */
}

function handleListChange(event: Event): void {
  if (dom === null) {
    return;
  }

  const target = event.target;
  if (!(target instanceof HTMLInputElement)) {
    return;
  }
  if (!target.classList.contains('todo-toggle')) {
    return;
  }

  const item = target.closest('li');
  if (!(item instanceof HTMLLIElement) || !dom.list.contains(item)) {
    return;
  }

  const id = parseTodoId(item.dataset.id);
  if (id === null) {
    showTip('待办编号无效，本次切换已取消。');
    return;
  }

  handleToggle(id);
}

function handleFilterClick(event: MouseEvent): void {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }
  const button = target.closest('.todo-filter');
  if (!(button instanceof HTMLButtonElement)) {
    return;
  }
  setFilter(button.dataset.filter);
}

function bindEvents(refs: DomRefs): void {
  refs.addBtn.addEventListener('click', handleAdd);

  refs.input.addEventListener('keydown', (event) => {
    if (event.isComposing || event.keyCode === 229) {
      return;
    }
    if (event.key !== 'Enter') {
      return;
    }
    event.preventDefault();
    handleAdd();
  });

  refs.input.addEventListener('input', clearTip);

  refs.list.addEventListener('click', handleListClick);
  refs.list.addEventListener('change', handleListChange);
  refs.filterWrap.addEventListener('click', handleFilterClick);
}

/* ---------------- 初始化 ---------------- */

function init(): void {
  dom = initDom();
  if (dom === null) {
    return;
  }

  storage = getStorage();
  if (storage === null) {
    showTip('浏览器本地存储不可用，刷新后数据会丢失。');
  }

  const loaded = loadTodos(storage, STORAGE_KEY);
  todos = loaded.todos;
  if (loaded.discarded > 0) {
    console.warn(`[待办清单] 恢复时丢弃/修复了 ${loaded.discarded} 条脏数据。`);
  }
  if (todos.length > 0) {
    console.info(`[待办清单] 已恢复 ${todos.length} 条待办。`);
  }

  bindEvents(dom);
  render();
}

/* 控制台验证桥：只暴露这一个函数，其余状态仍封在模块内。 */
declare global {
  interface Window {
    clearCompleted: () => number;
  }
}

window.clearCompleted = clearAllCompleted;

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
