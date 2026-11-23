import { computed, ref, type Ref } from "vue";
import type { CircuitDocument, GroupKind, InputGroup } from "@/shared/types";
import { createId } from "@/shared/document";
import {
  type Assignment,
  type ChangeCandidate,
  type ConflictReport,
  explainConflict,
  groupSatisfied,
  nearestLegal,
  planChanges,
} from "../lib/constraints";

export type PendingMode = "click" | "adjust";

export interface PendingChange {
  mode: PendingMode;
  /** 点击的输入 id（仅 click 模式） */
  clickedId: string | null;
  /** 点击意图的人类描述（仅 click 模式） */
  intent: string | null;
  candidates: ChangeCandidate[];
  /** 用户当前在差异列表中选中的候选下标 */
  chosen: number;
  conflict: ConflictReport | null;
  truncated: boolean;
  /** adjust 模式下，确认/取消后要恢复的分组快照 */
  snapshot: InputGroup[] | null;
}

export function inputIdsOf(document: CircuitDocument): string[] {
  return document.nodes
    .filter((node) => node.kind === "INPUT")
    .map((node) => node.id)
    .sort();
}

export function readAssignment(document: CircuitDocument): Assignment {
  const assignment: Assignment = {};
  for (const node of document.nodes)
    if (node.kind === "INPUT") assignment[node.id] = node.value;
  return assignment;
}

export function useGroups(
  document: Ref<CircuitDocument>,
  notify: (notice: { tone: "info" | "error" | "success"; message: string }) => void,
) {
  const pending = ref<PendingChange | null>(null);
  const inputIds = computed(() => inputIdsOf(document.value));

  const isCurrentLegal = computed(() => {
    const values = readAssignment(document.value);
    return document.value.groups.every((group) =>
      groupSatisfied(group, values),
    );
  });

  function labelOf(id: string): string {
    return (
      document.value.nodes.find((node) => node.id === id)?.label ?? id
    );
  }

  /**
   * 原子提交：用一次响应式赋值替换整个文档。
   * 逐开关写入会让同步 watcher 观察到非法中间态；整文档只触发一次通知，
   * 因此线路、输出、真值表当前行乃至自动保存都只会看到最终的合法组合，
   * 不会出现短暂的非法中间组合。
   */
  function commit(assignment: Assignment): void {
    const current = document.value;
    document.value = {
      ...current,
      nodes: current.nodes.map((node) =>
        node.kind === "INPUT" && Object.hasOwn(assignment, node.id)
          ? { ...node, value: assignment[node.id] }
          : node,
      ),
    };
  }

  function requestToggle(id: string): void {
    const node = document.value.nodes.find((item) => item.id === id);
    if (!node || node.kind !== "INPUT") return;
    if (!isCurrentLegal.value) {
      notify({
        tone: "error",
        message:
          "当前开关取值已不满足分组约束，请先在下方预览中选择一个合法调整，再切换开关。",
      });
      return;
    }
    const target = (node.value === 0 ? 1 : 0) as 0 | 1;
    const base = readAssignment(document.value);
    const fixed: Assignment = { [id]: target };
    const intent = `把 ${labelOf(id)} 置为 ${target}`;
    const { candidates, truncated } = planChanges(
      document.value.groups,
      inputIds.value,
      base,
      fixed,
    );
    if (candidates.length === 0) {
      // 意图与约束冲突：保留所有开关原值，只展示解释
      pending.value = {
        mode: "click",
        clickedId: id,
        intent,
        candidates: [],
        chosen: 0,
        conflict: explainConflict(
          document.value.groups,
          inputIds.value,
          fixed,
          intent,
        ),
        truncated,
        snapshot: null,
      };
      notify({
        tone: "error",
        message: "点击意图与分组约束冲突，所有开关保持原值。",
      });
      return;
    }
    if (candidates.length === 1) {
      // 唯一最少改动：直接原子应用，无需用户二次选择
      commit(candidates[0].assignment);
      pending.value = null;
      const extra = candidates[0].changes.filter((cid) => cid !== id);
      notify({
        tone: "success",
        message:
          extra.length === 0
            ? `已切换 ${labelOf(id)}`
            : `已切换 ${labelOf(id)}，并联动调整 ${extra
                .map(labelOf)
                .join("、")} 以满足分组约束`,
      });
      return;
    }
    // 多个同样少改动的结果：展示差异供选择，不替用户决定
    pending.value = {
      mode: "click",
      clickedId: id,
      intent,
      candidates,
      chosen: 0,
      conflict: null,
      truncated,
      snapshot: null,
    };
    notify({
      tone: "info",
      message: `存在 ${candidates.length} 个改动数相同的合法方案，请选择要应用的组合。`,
    });
  }

  function chooseCandidate(index: number): void {
    if (!pending.value) return;
    if (index < 0 || index >= pending.value.candidates.length) return;
    pending.value.chosen = index;
  }

  function confirmPending(): void {
    const state = pending.value;
    if (!state || state.candidates.length === 0) return;
    const candidate = state.candidates[state.chosen];
    commit(candidate.assignment);
    const snapshot = state.snapshot;
    pending.value = null;
    notify({
      tone: "success",
      message:
        state.mode === "adjust"
          ? snapshot
            ? "分组已更新，并已切换到合法输入组合。"
            : "已切换到合法输入组合。"
          : "已应用所选输入组合。",
    });
  }

  function cancelPending(): void {
    const state = pending.value;
    if (state?.mode === "adjust") {
      if (state.snapshot) {
        // 放弃分组增删：恢复到结构变更前的分组，开关原值始终未被改动
        document.value.groups = state.snapshot;
        notify({
          tone: "info",
          message: "已撤销本次分组变更，开关取值保持不变。",
        });
      } else {
        // 删除输入触发的调整：分组清理不可回滚，仅关闭预览
        notify({
          tone: "info",
          message: "已关闭预览，分组按删除后的输入保留，请稍后再选择合法调整。",
        });
      }
    } else if (state?.mode === "click") {
      notify({ tone: "info", message: "已取消，所有开关保持原值。" });
    }
    pending.value = null;
  }

  /** 结构变更后统一检查：若当前取值不再合法，先预览可选调整 */
  function checkAfterStructuralChange(snapshot: InputGroup[] | null): void {
    if (isCurrentLegal.value) {
      pending.value = null;
      return;
    }
    const base = readAssignment(document.value);
    const { candidates, truncated } = nearestLegal(
      document.value.groups,
      inputIds.value,
      base,
    );
    if (candidates.length === 0) {
      pending.value = {
        mode: "adjust",
        clickedId: null,
        intent: null,
        candidates: [],
        chosen: 0,
        conflict: explainConflict(
          document.value.groups,
          inputIds.value,
          {},
          null,
        ),
        truncated,
        snapshot,
      };
      notify({
        tone: "error",
        message: "新分组互相矛盾，不存在任何合法输入组合，请撤销或修改分组。",
      });
      return;
    }
    pending.value = {
      mode: "adjust",
      clickedId: null,
      intent: null,
      candidates,
      chosen: 0,
      conflict: null,
      truncated,
      snapshot,
    };
    notify({
      tone: "info",
      message:
        "分组变更使当前取值不再合法，请在预览中选择一个合法调整（开关尚未改动）。",
    });
  }

  function addGroup(kind: GroupKind, name: string, memberIds: string[]): void {
    const unique = [...new Set(memberIds)].sort();
    if (unique.length < 2) {
      notify({ tone: "error", message: "分组至少需要选择两个输入。" });
      return;
    }
    const snapshot = [...document.value.groups];
    const group: InputGroup = {
      id: createId("grp"),
      kind,
      name: name.trim() || "未命名分组",
      memberIds: unique,
    };
    document.value.groups = [...document.value.groups, group];
    checkAfterStructuralChange(snapshot);
  }

  function updateGroup(
    id: string,
    patch: Partial<Omit<InputGroup, "id">>,
  ): void {
    const index = document.value.groups.findIndex((group) => group.id === id);
    if (index < 0) return;
    const snapshot = [...document.value.groups];
    const current = document.value.groups[index];
    const next: InputGroup = {
      ...current,
      ...patch,
      memberIds: patch.memberIds
        ? [...new Set(patch.memberIds)].sort()
        : current.memberIds,
    };
    if (next.memberIds.length < 2) {
      notify({ tone: "error", message: "分组至少需要保留两个输入。" });
      return;
    }
    const groups = [...document.value.groups];
    groups[index] = next;
    document.value.groups = groups;
    checkAfterStructuralChange(snapshot);
  }

  function removeGroup(id: string): void {
    const snapshot = [...document.value.groups];
    document.value.groups = document.value.groups.filter(
      (group) => group.id !== id,
    );
    checkAfterStructuralChange(snapshot);
  }

  /**
   * 删除输入节点后调用：清理分组中的失效成员，丢弃空分组。
   * 节点本身已删除，分组清理不可回滚（回滚会留下指向失效输入的成员），
   * 因此不传快照，取消调整仅关闭预览。
   */
  function pruneInput(removedId: string): void {
    const groups: InputGroup[] = [];
    for (const group of document.value.groups) {
      if (!group.memberIds.includes(removedId)) {
        groups.push(group);
        continue;
      }
      const memberIds = group.memberIds.filter((id) => id !== removedId);
      if (memberIds.length >= 2) groups.push({ ...group, memberIds });
      // 成员不足两个的分组自动解散
    }
    document.value.groups = groups;
    checkAfterStructuralChange(null);
  }

  return {
    pending,
    inputIds,
    isCurrentLegal,
    labelOf,
    requestToggle,
    chooseCandidate,
    confirmPending,
    cancelPending,
    addGroup,
    updateGroup,
    removeGroup,
    pruneInput,
  };
}
