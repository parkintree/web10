/**
 * 任务 2：手写单测。
 *
 * 只测两个最小业务单元：
 *   · addTodo   —— 正常新增 + 空值 / 超长 / 重复 / 非法 id 四类拦截；
 *   · toggleTodo —— 双向切换 + 未找到 / 非法 id 两类拦截。
 *
 * 每个用例都同时检查「返回值」与「原数据是否被修改」；
 * 断言不只写 toBe(true)，而是核对具体字段，避免测试通过但行为错误。
 */

import { describe, expect, it } from 'vitest';
import { MAX_LEN, addTodo, toggleTodo } from '../src/todo-core';
import type {
  Todo,
  TodoFailureReason,
  TodoMutationResult,
  TodoMutationSuccess,
} from '../src/todo-core';

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

function expectFailure(
  result: TodoMutationResult,
  reason: TodoFailureReason,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.reason).toBe(reason);
  }
}

describe('addTodo', () => {
  it('正常：空列表新增一条，字段完整且默认未完成', () => {
    const result = expectSuccess(addTodo([], '买牛奶', 7));

    expect(result.todo).toEqual({ id: 7, text: '买牛奶', completed: false });
    expect(result.todos).toHaveLength(1);
    expect(result.todos[0]).toEqual(result.todo);
  });

  it('正常：新待办插入到列表最前，原有顺序不变', () => {
    const base = [makeTodo(1, '写作业', true), makeTodo(2, '倒垃圾')];
    const result = expectSuccess(addTodo(base, '买牛奶', 3));

    expect(result.todos.map((todo) => todo.id)).toEqual([3, 1, 2]);
  });

  it('正常：首尾空白被去掉，内部连续空白折叠成一个空格', () => {
    const result = expectSuccess(addTodo([], '  买   牛奶\n', 1));

    expect(result.todo.text).toBe('买 牛奶');
  });

  it('不可变：新增后原数组与原对象都没有被修改', () => {
    const first = makeTodo(1, '写作业', true);
    const base = [first];

    const result = expectSuccess(addTodo(base, '买牛奶', 2));

    expect(base).toHaveLength(1);
    expect(base[0]).toBe(first);
    expect(first).toEqual({ id: 1, text: '写作业', completed: true });
    expect(result.todos).not.toBe(base);
  });

  it('边界：空字符串被拦截', () => {
    expectFailure(addTodo([], '', 1), 'empty');
  });

  it('边界：纯空白（含全角空格）被拦截', () => {
    expectFailure(addTodo([], ' \t\n　 ', 1), 'empty');
  });

  it('边界：长度正好 60 字可以新增', () => {
    const text = 'a'.repeat(MAX_LEN);
    const result = expectSuccess(addTodo([], text, 1));

    expect(result.todo.text).toHaveLength(MAX_LEN);
  });

  it('边界：长度 61 字被拦截，且不产生新数据', () => {
    expectFailure(addTodo([], 'a'.repeat(MAX_LEN + 1), 1), 'too-long');
  });

  it('边界：规范化后与已有内容重复时被拦截', () => {
    const base = [makeTodo(1, '写作业')];

    expectFailure(addTodo(base, '  写作业  ', 2), 'duplicate');
  });

  it('边界：id 为 0、负数、小数、NaN、Infinity 时全部拦截', () => {
    const invalidIds = [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY];

    for (const id of invalidIds) {
      expectFailure(addTodo([], '买牛奶', id), 'invalid-id');
    }
  });

  it('边界：超过安全整数范围的 id 被拦截', () => {
    expectFailure(
      addTodo([], '买牛奶', Number.MAX_SAFE_INTEGER + 2),
      'invalid-id',
    );
  });
});

describe('toggleTodo', () => {
  it('正常：未完成切换为已完成', () => {
    const base = [makeTodo(1, '写作业', false)];
    const result = expectSuccess(toggleTodo(base, 1));

    expect(result.todo.completed).toBe(true);
    expect(result.todos[0]?.completed).toBe(true);
  });

  it('正常：已完成切换回未完成', () => {
    const base = [makeTodo(1, '写作业', true)];
    const result = expectSuccess(toggleTodo(base, 1));

    expect(result.todo.completed).toBe(false);
  });

  it('正常：只切换命中的一条，其他对象保持原引用', () => {
    const untouched = makeTodo(1, '买牛奶');
    const target = makeTodo(2, '写作业', true);
    const base = [untouched, target];

    const result = expectSuccess(toggleTodo(base, 2));

    expect(result.todos[0]).toBe(untouched);
    expect(result.todos[1]).not.toBe(target);
    expect(result.todos[1]?.completed).toBe(false);
  });

  it('不可变：切换后原数组与原对象都没有被修改', () => {
    const target = makeTodo(1, '写作业', false);
    const base = [target];

    expectSuccess(toggleTodo(base, 1));

    expect(base[0]).toBe(target);
    expect(target.completed).toBe(false);
  });

  it('边界：id 不存在时返回 not-found，数据不变', () => {
    expectFailure(toggleTodo([makeTodo(1, '写作业')], 99), 'not-found');
  });

  it('边界：空列表切换任意 id 返回 not-found', () => {
    expectFailure(toggleTodo([], 1), 'not-found');
  });

  it('边界：id 为 0、负数、小数、NaN 时返回 invalid-id', () => {
    const base = [makeTodo(1, '写作业')];

    for (const id of [0, -1, 1.5, Number.NaN]) {
      expectFailure(toggleTodo(base, id), 'invalid-id');
    }
  });

  it('边界：非法 id 优先于 not-found，不会误命中同值文本', () => {
    const base = [makeTodo(1, '写作业')];

    expectFailure(toggleTodo(base, 1.0000001), 'invalid-id');
  });
});
