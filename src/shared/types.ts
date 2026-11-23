export type Signal = 0 | 1 | "X";
export type GateKind =
  "INPUT" | "OUTPUT" | "AND" | "OR" | "XOR" | "NOT" | "NAND" | "NOR";
/**
 * 输入分组类型：
 * - ONE_HOT 一位有效组：组内恰好一个输入为 1（模拟编码器有效按键）
 * - MUTEX 互斥组：组内至多一个输入为 1（可以全为 0）
 * - LINK 同值联动组：组内所有输入取值相同
 */
export type GroupKind = "ONE_HOT" | "MUTEX" | "LINK";
export interface InputGroup {
  id: string;
  kind: GroupKind;
  name: string;
  memberIds: string[];
}
export interface Point {
  x: number;
  y: number;
}
export interface GateNode extends Point {
  id: string;
  kind: GateKind;
  label: string;
  value: 0 | 1;
}
export interface Endpoint {
  nodeId: string;
  port: number;
}
export interface Wire {
  id: string;
  from: Endpoint;
  to: Endpoint;
}
export interface CircuitDocument {
  version: 1;
  name: string;
  nodes: GateNode[];
  wires: Wire[];
  targetId: string;
  groups: InputGroup[];
}
export interface GateSpec {
  kind: GateKind;
  name: string;
  symbol: string;
  inputs: number;
  outputs: number;
  description: string;
}
export interface SimulationResult {
  values: Record<string, Signal>;
  pins: Record<string, Signal[]>;
  wires: Record<string, Signal>;
  order: string[];
}
