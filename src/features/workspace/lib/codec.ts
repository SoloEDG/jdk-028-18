import type {
  CircuitDocument,
  GateNode,
  GroupKind,
  InputGroup,
  Wire,
} from "@/shared/types";
import { getSpec } from "@/features/catalog";
import { topologicalOrder } from "@/features/circuit";
const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
export function decodeDocument(text: string): CircuitDocument {
  if (text.length > 2_000_000)
    throw new Error("实验文件超过 2 MB，请缩小后再导入");
  const data: unknown = JSON.parse(text);
  if (
    !object(data) ||
    data.version !== 1 ||
    typeof data.name !== "string" ||
    data.name.length > 80 ||
    !["xor", "and", "or"].includes(String(data.targetId)) ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.wires) ||
    (data.groups !== undefined && !Array.isArray(data.groups))
  )
    throw new Error("文件格式或版本不受支持");
  if (data.nodes.length > 120 || data.wires.length > 480)
    throw new Error("实验最多支持 120 个元件、480 条连线");
  const ids = new Set<string>();
  const nodes: GateNode[] = data.nodes.map((value) => {
    if (
      !object(value) ||
      typeof value.id !== "string" ||
      !value.id ||
      value.id.length > 100 ||
      ids.has(value.id) ||
      typeof value.kind !== "string" ||
      typeof value.label !== "string" ||
      value.label.length > 40 ||
      !Number.isFinite(value.x) ||
      !Number.isFinite(value.y) ||
      (value.value !== 0 && value.value !== 1)
    )
      throw new Error("元件内容无效或编号重复");
    const spec = getSpec(value.kind);
    ids.add(value.id);
    if (
      Number(value.x) < 20 ||
      Number(value.x) > 880 ||
      Number(value.y) < 40 ||
      Number(value.y) > 420
    )
      throw new Error("元件坐标超出工作台范围");
    return {
      id: value.id,
      kind: spec.kind,
      label: value.label,
      x: Number(value.x),
      y: Number(value.y),
      value: value.value,
    };
  });
  const wireIds = new Set<string>(),
    occupied = new Set<string>();
  const wires: Wire[] = data.wires.map((value) => {
    if (
      !object(value) ||
      typeof value.id !== "string" ||
      !value.id ||
      ids.has(value.id) ||
      wireIds.has(value.id) ||
      !object(value.from) ||
      !object(value.to)
    )
      throw new Error("连线内容无效或编号重复");
    const fromId = value.from.nodeId,
      toId = value.to.nodeId;
    const from = nodes.find((n) => n.id === fromId),
      to = nodes.find((n) => n.id === toId);
    const fp = value.from.port,
      tp = value.to.port;
    if (
      !from ||
      !to ||
      from === to ||
      !Number.isInteger(fp) ||
      !Number.isInteger(tp) ||
      Number(fp) < 0 ||
      Number(fp) >= getSpec(from.kind).outputs ||
      Number(tp) < 0 ||
      Number(tp) >= getSpec(to.kind).inputs
    )
      throw new Error("连线引用了无效端口");
    const key = `${to.id}:${tp}`;
    if (occupied.has(key)) throw new Error("同一输入端口不能连接两个输出");
    occupied.add(key);
    wireIds.add(value.id);
    return {
      id: value.id,
      from: { nodeId: from.id, port: Number(fp) },
      to: { nodeId: to.id, port: Number(tp) },
    };
  });
  const groupKinds: GroupKind[] = ["ONE_HOT", "MUTEX", "LINK"];
  const groupIds = new Set<string>();
  const inputIdSet = new Set(
    nodes.filter((node) => node.kind === "INPUT").map((node) => node.id),
  );
  const groups: InputGroup[] = (data.groups ?? []).map((value) => {
    if (
      !object(value) ||
      typeof value.id !== "string" ||
      !value.id ||
      value.id.length > 100 ||
      groupIds.has(value.id) ||
      typeof value.name !== "string" ||
      value.name.length > 40 ||
      !groupKinds.includes(value.kind as GroupKind) ||
      !Array.isArray(value.memberIds)
    )
      throw new Error("分组内容无效或编号重复");
    const memberIds = value.memberIds;
    if (
      memberIds.length < 2 ||
      memberIds.some(
        (member) =>
          typeof member !== "string" || !inputIdSet.has(String(member)),
      ) ||
      new Set(memberIds).size !== memberIds.length
    )
      throw new Error("分组必须引用至少两个不同的有效输入");
    groupIds.add(value.id);
    return {
      id: value.id,
      kind: value.kind as GroupKind,
      name: value.name,
      memberIds: memberIds.map(String),
    };
  });
  const document: CircuitDocument = {
    version: 1,
    name: data.name,
    targetId: String(data.targetId),
    nodes,
    wires,
    groups,
  };
  topologicalOrder(document);
  return document;
}
export function encodeDocument(document: CircuitDocument): string {
  return JSON.stringify(document, null, 2);
}
