import type { GroupKind, InputGroup } from "@/shared/types";

/** 一次输入取值：输入节点 id -> 0/1 */
export type Assignment = Record<string, 0 | 1>;

/** 一次可选变更：完整合法取值 + 相对当前值发生变化的输入 id 列表 */
export interface ChangeCandidate {
  assignment: Assignment;
  changes: string[];
}

/** 约束冲突的解释（足以导致冲突的一组条件） */
export interface ConflictReport {
  /** 导致冲突的最小（不可再缩减）分组子集 */
  coreGroups: InputGroup[];
  /** 点击意图描述（无点击场景为 null） */
  intent: string | null;
  /** 逐组规则说明 */
  reasons: string[];
  /** 汇总说明 */
  summary: string;
}

/** 枚举访问的搜索节点预算，防止输入过多时界面卡死 */
export const ENUM_BUDGET = 1_000_000;

export interface EnumerateResult {
  inputIds: string[];
  assignments: Assignment[];
  truncated: boolean;
}

/** 并查集：把互相联动（LINK）的输入合并为同值分量 */
class DSU {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a),
      rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

/** 单个分组在当前（可能不完整）取值下的状态 */
function groupState(
  group: InputGroup,
  values: Assignment,
): { ones: number; zeros: number; unknown: number } {
  let ones = 0,
    zeros = 0,
    unknown = 0;
  for (const id of group.memberIds) {
    const v = values[id];
    if (v === 1) ones++;
    else if (v === 0) zeros++;
    else unknown++;
  }
  return { ones, zeros, unknown };
}

/**
 * 部分取值下的约束剪枝：只判断“是否已经注定不合法”。
 * 未知输入仍可能补救时返回 true。
 */
function stillPossible(group: InputGroup, values: Assignment): boolean {
  const { ones, zeros } = groupState(group, values);
  switch (group.kind) {
    case "LINK":
      // 已出现 0 和 1 即不可能同值
      return ones === 0 || zeros === 0;
    case "MUTEX":
      // 至多一个 1：已经有两个 1 即不合法
      return ones <= 1;
    case "ONE_HOT":
      // 恰好一个 1：超过一个 1 不合法；其余情况未知位可补足
      return ones <= 1;
  }
}

/** 完整取值下分组是否满足 */
export function groupSatisfied(group: InputGroup, values: Assignment): boolean {
  const { ones, zeros } = groupState(group, values);
  switch (group.kind) {
    case "LINK":
      return ones === 0 || zeros === 0;
    case "MUTEX":
      return ones <= 1;
    case "ONE_HOT":
      return ones === 1;
  }
}

/** 完整取值是否满足全部分组（且覆盖所有输入） */
export function isLegal(
  groups: InputGroup[],
  inputIds: string[],
  values: Assignment,
): boolean {
  if (inputIds.some((id) => values[id] !== 0 && values[id] !== 1))
    return false;
  return groups.every((group) => groupSatisfied(group, values));
}

/**
 * 枚举所有满足分组约束的完整输入取值。
 * 结果按“输入 id 排序后的二进制串”确定排序，不依赖任何开关遍历顺序。
 * @param fixed 点击意图等需要固定的输入取值
 */
export function enumerateLegal(
  groups: InputGroup[],
  inputIds: string[],
  fixed: Assignment = {},
): EnumerateResult {
  const ids = [...inputIds].sort();
  const values: Assignment = {};
  const assignments: Assignment[] = [];
  let truncated = false;
  let visits = 0;

  // 先应用固定取值，固定值本身违反约束则无解
  for (const id of ids) {
    if (Object.hasOwn(fixed, id)) {
      values[id] = fixed[id];
      if (!groups.every((group) => stillPossible(group, values)))
        return { inputIds: ids, assignments: [], truncated: false };
    }
  }

  // LINK 分量：同分量必须同值，用代表元驱动枚举
  const dsu = new DSU();
  for (const id of ids) dsu.find(id);
  for (const group of groups)
    if (group.kind === "LINK")
      for (let i = 1; i < group.memberIds.length; i++)
        dsu.union(group.memberIds[0], group.memberIds[i]);

  const roots: string[] = [];
  for (const id of ids) {
    const root = dsu.find(id);
    if (!roots.includes(root)) roots.push(root);
  }
  // 固定值会让同分量的成员被锁定，检测分量内部固定冲突
  for (const root of roots) {
    const members = ids.filter((id) => dsu.find(id) === root);
    const fixedVals = new Set(
      members
        .filter((id) => Object.hasOwn(fixed, id))
        .map((id) => fixed[id]),
    );
    if (fixedVals.size > 1)
      return { inputIds: ids, assignments: [], truncated: false };
  }

  const rootFixed = (root: string): 0 | 1 | undefined => {
    const member = ids.find(
      (id) => dsu.find(id) === root && Object.hasOwn(fixed, id),
    );
    return member === undefined ? undefined : fixed[member];
  };

  function snapshot(): Assignment {
    return { ...values };
  }

  function dfs(index: number): void {
    if (truncated) return;
    if (++visits > ENUM_BUDGET) {
      truncated = true;
      return;
    }
    if (index === roots.length) {
      if (isLegal(groups, ids, values)) assignments.push(snapshot());
      return;
    }
    const root = roots[index];
    const members = ids.filter((id) => dsu.find(id) === root);
    const locked = rootFixed(root);
    const options: (0 | 1)[] = locked === undefined ? [0, 1] : [locked];
    for (const bit of options) {
      for (const id of members) values[id] = bit;
      if (groups.every((group) => stillPossible(group, values)))
        dfs(index + 1);
      if (truncated) return;
    }
    for (const id of members) if (!Object.hasOwn(fixed, id)) delete values[id];
  }

  dfs(0);
  // 确定排序：按输入 id 排序后的位串，杜绝“按遍历顺序偷偷选一个”
  assignments.sort((a, b) => {
    for (const id of ids) {
      if (a[id] !== b[id]) return a[id] - b[id];
    }
    return 0;
  });
  return { inputIds: ids, assignments, truncated };
}

function hamming(changes: string[]): number {
  return changes.length;
}

/**
 * 以 fixed 为点击意图，在全部合法取值中找出“其他开关改动数最少”的方案。
 * 同改动数的方案全部保留（按确定排序），交由用户选择。
 */
export function planChanges(
  groups: InputGroup[],
  inputIds: string[],
  base: Assignment,
  fixed: Assignment,
): { candidates: ChangeCandidate[]; truncated: boolean } {
  const { assignments, truncated } = enumerateLegal(groups, inputIds, fixed);
  const toCandidate = (assignment: Assignment): ChangeCandidate => ({
    assignment,
    changes: inputIds
      .filter((id) => assignment[id] !== base[id])
      .sort(),
  });
  const all = assignments.map(toCandidate);
  if (all.length === 0) return { candidates: [], truncated };
  const min = Math.min(...all.map((candidate) => hamming(candidate.changes)));
  // assignments 已确定排序，过滤后顺序保持确定
  return {
    candidates: all.filter((candidate) => hamming(candidate.changes) === min),
    truncated,
  };
}

/** 不带点击意图时，寻找距当前取值最近的合法取值（用于增删分组后的调整预览） */
export function nearestLegal(
  groups: InputGroup[],
  inputIds: string[],
  base: Assignment,
): { candidates: ChangeCandidate[]; truncated: boolean } {
  return planChanges(groups, inputIds, base, {});
}

/** 分组规则的中文描述 */
export function describeGroup(group: InputGroup): string {
  const names = group.memberIds.join("、");
  switch (group.kind) {
    case "ONE_HOT":
      return `「${group.name}」一位有效：${names} 中必须恰好一个为 1`;
    case "MUTEX":
      return `「${group.name}」互斥：${names} 中至多一个为 1（可全 0）`;
    case "LINK":
      return `「${group.name}」同值联动：${names} 必须同时为 0 或同时为 1`;
  }
}

/**
 * 解释冲突：先求不可再缩减的分组子集（去掉任意一个后即可行），
 * 再结合点击意图给出一组足以导致冲突的条件。
 */
export function explainConflict(
  groups: InputGroup[],
  inputIds: string[],
  fixed: Assignment,
  intent: string | null,
): ConflictReport {
  const feasible = (subset: InputGroup[]): boolean =>
    enumerateLegal(subset, inputIds, fixed).assignments.length > 0;

  let core: InputGroup[];
  if (!feasible(groups)) {
    // 向下缩减：逐个尝试移除，保留“移除后仍不可行”的分组
    core = [...groups];
    for (const group of groups) {
      const trial = core.filter((item) => item.id !== group.id);
      if (!feasible(trial)) core = trial;
    }
  } else {
    core = [];
  }
  const reasons = core.map(describeGroup);
  const fixedText = Object.entries(fixed)
    .map(([id, value]) => `${id}=${value}`)
    .join("，");
  const intentLine = intent ?? (fixedText ? `要求固定 ${fixedText}` : null);
  const summary =
    core.length === 0
      ? "当前分组约束本身不存在矛盾。"
      : `以下 ${core.length} 条分组约束${intentLine ? `与本次意图（${intentLine}）` : ""}无法同时满足：${core
          .map((group) => `「${group.name}」`)
          .join("、")}。任一约束放宽后才可能存在合法取值。`;
  return { coreGroups: core, intent: intentLine, reasons, summary };
}

/** 分组类型的展示元信息 */
export const GROUP_KIND_META: Record<
  GroupKind,
  { title: string; short: string; rule: string; color: string }
> = {
  ONE_HOT: {
    title: "一位有效组",
    short: "一位有效",
    rule: "组内恰好一个输入为 1",
    color: "#df671c",
  },
  MUTEX: {
    title: "互斥组",
    short: "互斥",
    rule: "组内至多一个输入为 1，可全为 0",
    color: "#147b87",
  },
  LINK: {
    title: "同值联动组",
    short: "同值联动",
    rule: "组内输入取值完全相同",
    color: "#7a5ea8",
  },
};
