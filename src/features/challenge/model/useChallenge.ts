import { computed, ref, type Ref } from "vue";
import type { CircuitDocument } from "@/shared/types";
import { targetById } from "../lib/targets";
import { truthTable } from "../lib/truthTable";
export function useChallenge(document: Ref<CircuitDocument>) {
  const inspected = ref(false),
    hint = ref(false);
  const target = computed(() => targetById(document.value.targetId));
  const table = computed(() => truthTable(document.value, target.value));
  // 零条合法组合绝不能算作全部通过：必须存在被覆盖的组合且全部匹配
  const passed = computed(
    () =>
      !table.value.error &&
      !table.value.contradiction &&
      table.value.covered > 0 &&
      table.value.rows
        .filter((row) => row.legal)
        .every((row) => row.matches),
  );
  function choose(id: string) {
    document.value.targetId = id;
    inspected.value = false;
    hint.value = false;
  }
  function reset() {
    inspected.value = false;
    hint.value = false;
  }
  return { target, table, passed, inspected, hint, choose, reset };
}
