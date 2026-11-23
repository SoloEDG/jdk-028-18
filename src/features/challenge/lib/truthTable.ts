import type { CircuitDocument, Signal } from "@/shared/types";
import { evaluate } from "@/features/simulation";
import { enumerateLegal, type Assignment } from "@/features/groups";
import type { Target } from "./targets";

export interface TruthRow {
  a: 0 | 1;
  b: 0 | 1;
  expected: 0 | 1;
  actual: Signal;
  matches: boolean;
  /** 该组合是否满足当前输入分组约束 */
  legal: boolean;
}

export interface TruthTableResult {
  rows: TruthRow[];
  error: string | null;
  /** 满足约束、实际参与检测的组合数 */
  covered: number;
  /** 全空间中被分组约束排除的组合数 */
  excluded: number;
  /** 约束互相矛盾、没有任何合法组合 */
  contradiction: boolean;
  /** 输入过多导致枚举不完整 */
  truncated: boolean;
  excludedRows: { a: 0 | 1; b: 0 | 1 }[];
}

export function truthTable(
  document: CircuitDocument,
  target: Target,
): TruthTableResult {
  const inputs = document.nodes.filter((node) => node.kind === "INPUT");
  const a = inputs.filter((node) => node.label === "A"),
    b = inputs.filter((node) => node.label === "B");
  const outputs = document.nodes.filter(
    (node) => node.kind === "OUTPUT" && node.label === "Y",
  );
  if (
    inputs.length !== 2 ||
    a.length !== 1 ||
    b.length !== 1 ||
    outputs.length !== 1
  )
    return {
      rows: [],
      error: "目标检测需要恰好两个输入 A、B，以及一个名为 Y 的输出。",
      covered: 0,
      excluded: 0,
      contradiction: false,
      truncated: false,
      excludedRows: [],
    };

  // 仅枚举满足输入分组约束的组合，未覆盖组合另行明确列出
  const enumeration = enumerateLegal(
    document.groups,
    inputs.map((node) => node.id),
    {},
  );
  const legal = new Map(
    enumeration.assignments.map((assignment: Assignment) => [
      `${assignment[a[0].id]}${assignment[b[0].id]}`,
      assignment,
    ]),
  );

  const rows: TruthRow[] = target.expected.map((expected, index) => {
    const av = (index >> 1) as 0 | 1,
      bv = (index & 1) as 0 | 1;
    const key = `${av}${bv}`;
    const isLegal = legal.has(key);
    const actual = evaluate(document, {
      [a[0].id]: av,
      [b[0].id]: bv,
    }).values[outputs[0].id];
    return {
      a: av,
      b: bv,
      expected,
      actual,
      matches: isLegal && actual === expected,
      legal: isLegal,
    };
  });

  const excludedRows = rows
    .filter((row) => !row.legal)
    .map((row) => ({ a: row.a, b: row.b }));

  return {
    rows,
    error: null,
    covered: rows.filter((row) => row.legal).length,
    excluded: excludedRows.length,
    contradiction: legal.size === 0,
    truncated: enumeration.truncated,
    excludedRows,
  };
}
