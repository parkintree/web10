/**
 * 任务 3：审查 AI 原稿后的修补测试。
 *
 * 修补重点（对应 docs/ai-review.md）：
 *   ① 把「恒真 / 只查 ok」的弱断言改为具体字段与 reason；
 *   ② 补 dataset.id 的 string → number 转换边界；
 *   ③ 补 9 维度里当前业务真正需要的：空值、格式、类型、越界、状态、重复、依赖；
 *   ④ 补 localStorage 脏数据、重复 id、非法 id、读写异常的恢复策略；
 *   ⑤ 用结构化断言验证不可变性，而不是「自己等于自己」。
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_LEN,
  addTodo,
  loadTodos,
  parseTodoId,
  saveTodos,
  toggleTodo,
} from '../src/todo-core';
import type {
  StorageLike,
  Todo,
  TodoMutationResult,
  TodoMutationSuccess,
} from '../src/todo-core';

const KEY = 'test.todos';

class MemoryStorage implements StorageLike {
  private readonly data = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  public setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  public seed(key: string, value: string): void {
    this.data.set(key, value);
  }
}

function makeTodo(id: number, text: string, completed = false): Todo {
  return { id, text, completed };
}

function expectSuccess(result: TodoMutationResult): TodoMutationSuccess {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`预期成功，实际失败：${result.reason}`);
  }
  return result;
}

describe('修补①：dataset.id 从 string 转 number', () => {
  it('合法十进制字符串转为对应数字，并允许首尾空白', () => {
    expect(parseTodoId('1')).toBe(1);
    expect(parseTodoId('12')).toBe(12);
    expect(parseTodoId(' 12 ')).toBe(12);
    expect(parseTodoId(String(Number.MAX_SAFE_INTEGER))).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it('undefined / null / 空串 / 纯空白全部返回 null', () => {
    expect(parseTodoId(undefined)).toBeNull();
    expect(parseTodoId(null)).toBeNull();
    expect(parseTodoId('')).toBeNull();
    expect(parseTodoId('   ')).toBeNull();
  });

  it('零、负数、小数、非十进制、带字母全部返回 null', () => {
    const invalid = ['0', '-1', '1.5', '12abc', '0x10', '1e3', '007', '1 2'];

    for (const raw of invalid) {
      expect(parseTodoId(raw)).toBeNull();
    }
  });

  it('超过安全整数的字符串返回 null，避免精度丢失', () => {
    expect(parseTodoId(String(Number.MAX_SAFE_INTEGER + 1))).toBeNull();
  });
});

describe('修补②：addTodo 的弱断言与边界', () => {
  it('成功时校验完整字段与置顶顺序，不只检查 ok / length', () => {
    const base = [makeTodo(1, '写作业', true), makeTodo(2, '倒垃圾')];
    const result = expectSuccess(addTodo(base, '  买   牛奶  ', 3));

    expect(result.todo).toEqual({
      id: 3,
      text: '买 牛奶',
      completed: false,
    });
    expect(result.todos).toEqual([
      { id: 3, text: '买 牛奶', completed: false },
      { id: 1, text: '写作业', completed: true },
      { id: 2, text: '倒垃圾', completed: false },
    ]);
    expect(base).toHaveLength(2);
  });

  it('长度 60 通过，长度 61 返回 too-long', () => {
    const accepted = expectSuccess(addTodo([], 'a'.repeat(MAX_LEN), 1));
    expect(accepted.todo.text).toHaveLength(MAX_LEN);

    const rejected = addTodo([], 'a'.repeat(MAX_LEN + 1), 2);
    expect(rejected.ok).toBe(false);
    if (!rejected.ok) {
      expect(rejected.reason).toBe('too-long');
    }
  });

  it('空白内容返回 empty，而不是笼统的 false', () => {
    const result = addTodo([], ' \t　 ', 1);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('empty');
    }
  });

  it('规范化后重复返回 duplicate', () => {
    const base = [makeTodo(1, '买牛奶')];
    const result = addTodo(base, '  买牛奶  ', 2);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('duplicate');
    }
  });

  it('非法 id 返回 invalid-id，不生成脏主键', () => {
    const result = addTodo([], '买牛奶', 0);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid-id');
    }
  });
});

describe('修补③：toggleTodo 的失败原因与不可变性', () => {
  it('id 不存在时返回 not-found，而不是只断言不抛异常', () => {
    const result = toggleTodo([makeTodo(1, '写作业')], 99);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('not-found');
    }
  });

  it('原数组、原对象都不被修改（用快照与引用双重验证）', () => {
    const target = makeTodo(1, '写作业', false);
    const base = [target];
    const snapshot = JSON.stringify(base);

    const result = expectSuccess(toggleTodo(base, 1));

    expect(base[0]).toBe(target);
    expect(JSON.stringify(base)).toBe(snapshot);
    expect(target.completed).toBe(false);
    expect(result.todos).not.toBe(base);
    expect(result.todos[0]).not.toBe(target);
  });

  it('只切换命中项，其余对象保持原引用', () => {
    const first = makeTodo(1, '买牛奶', false);
    const second = makeTodo(2, '写作业', false);
    const result = expectSuccess(toggleTodo([first, second], 2));

    expect(result.todos[0]).toBe(first);
    expect(result.todos[1]).not.toBe(second);
    expect(result.todos[1]?.completed).toBe(true);
  });

  it('非法 id 返回 invalid-id，而不是 not-found', () => {
    const result = toggleTodo([makeTodo(1, '写作业')], 1.5);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('invalid-id');
    }
  });
});

describe('修补④：loadTodos 的格式 / 类型 / 重复 / 依赖异常', () => {
  it('存储不可用（null）时返回空列表', () => {
    expect(loadTodos(null, KEY)).toEqual({ todos: [], discarded: 0 });
  });

  it('读取抛异常时返回空列表，不把异常抛给页面', () => {
    const blocked: StorageLike = {
      getItem(_key: string): string | null {
        throw new Error('SecurityError');
      },
      setItem(_key: string, _value: string): void {
        throw new Error('SecurityError');
      },
    };

    expect(loadTodos(blocked, KEY)).toEqual({ todos: [], discarded: 0 });
  });

  it('非法 JSON、非数组、字符串 null 都返回空列表', () => {
    const storage = new MemoryStorage();

    storage.seed(KEY, '{not json');
    expect(loadTodos(storage, KEY).todos).toEqual([]);

    storage.seed(KEY, JSON.stringify({ text: '不是数组' }));
    expect(loadTodos(storage, KEY).todos).toEqual([]);

    storage.seed(KEY, 'null');
    expect(loadTodos(storage, KEY).todos).toEqual([]);
  });

  it('逐条丢弃脏数据，只保留 shape 正确的条目并统计 discarded', () => {
    const storage = new MemoryStorage();
    const dirty: unknown[] = [
      null,
      42,
      { text: 123 },
      { text: '   ' },
      { text: 'a'.repeat(MAX_LEN + 1), completed: false },
      { text: 'completed 不是布尔', completed: 'yes' },
      { id: 1, text: '买牛奶', completed: false },
      { id: 2, text: '  写   作业 ', completed: true },
    ];

    storage.seed(KEY, JSON.stringify(dirty));
    const result = loadTodos(storage, KEY);

    expect(result.discarded).toBe(6);
    expect(result.todos).toEqual([
      { id: 1, text: '买牛奶', completed: false },
      { id: 2, text: '写 作业', completed: true },
    ]);
  });

  it('重复 id 自动重新编号，不丢业务数据', () => {
    const storage = new MemoryStorage();
    storage.seed(
      KEY,
      JSON.stringify([
        { id: 2, text: 'A', completed: false },
        { id: 2, text: 'B', completed: false },
        { id: 2, text: 'C', completed: false },
      ]),
    );

    const result = loadTodos(storage, KEY);

    expect(result.todos.map((todo) => todo.id)).toEqual([2, 3, 4]);
    expect(result.todos.map((todo) => todo.text)).toEqual(['A', 'B', 'C']);
  });

  it('缺失或非法 id 自动补齐为正整数', () => {
    const storage = new MemoryStorage();
    storage.seed(
      KEY,
      JSON.stringify([
        { id: 5, text: '保留原 id', completed: false },
        { text: '没有 id', completed: false },
        { id: 0, text: '零 id', completed: false },
        { id: 1.5, text: '小数 id', completed: false },
        { id: '3', text: '字符串 id', completed: false },
      ]),
    );

    const result = loadTodos(storage, KEY);

    expect(result.todos.map((todo) => todo.id)).toEqual([5, 6, 7, 8, 9]);
    expect(result.discarded).toBe(0);
  });

  it('保存后能原样恢复（number id 不被序列化成字符串）', () => {
    const storage = new MemoryStorage();
    const source = [makeTodo(1, '买牛奶', false), makeTodo(2, '写作业', true)];

    expect(saveTodos(storage, KEY, source)).toBe(true);
    const result = loadTodos(storage, KEY);

    expect(result.discarded).toBe(0);
    expect(result.todos).toEqual(source);
    expect(typeof result.todos[0]?.id).toBe('number');
  });

  it('写入抛异常时返回 false，不打断页面其余逻辑', () => {
    const blocked: StorageLike = {
      getItem(_key: string): string | null {
        return null;
      },
      setItem(_key: string, _value: string): void {
        throw new Error('QuotaExceededError');
      },
    };

    expect(saveTodos(blocked, KEY, [makeTodo(1, '买牛奶')])).toBe(false);
  });

  it('安全：HTML 字符串按纯文本保存，不在数据层解释标签', () => {
    const payload = '<img src=x onerror=alert(1)>';
    const storage = new MemoryStorage();
    const added = expectSuccess(addTodo([], payload, 1));

    expect(added.todo.text).toBe(payload);
    expect(saveTodos(storage, KEY, added.todos)).toBe(true);
    expect(loadTodos(storage, KEY).todos[0]?.text).toBe(payload);
  });
});
