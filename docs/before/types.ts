/**
 * 待办清单的数据模型。
 *
 * W8 的 id 是 string（UUID）；W9 按要求改为 number。
 * 页面 DOM 的 dataset.id 永远只能是 string，因此所有跨层数据都要经过
 * parseTodoId() 做一次「字符串 → 数字」的显式转换，绝不隐式比较。
 */
export interface Todo {
  readonly id: number;
  readonly text: string;
  readonly completed: boolean;
}

export type TodoFilter = 'all' | 'active' | 'completed';

/** 只依赖这两个方法，测试里可以用内存对象替代 localStorage。 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
