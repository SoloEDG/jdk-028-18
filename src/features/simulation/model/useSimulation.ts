import { computed, type Ref } from "vue";
import type { CircuitDocument } from "@/shared/types";
import { evaluate } from "../lib/evaluate";
export function useSimulation(document: Ref<CircuitDocument>) {
  // 开关切换由分组特性（useGroups.requestToggle）统一处理，
  // 以保证一次点击在分组约束下原子地落到合法组合。
  const signals = computed(() => evaluate(document.value));
  return { signals };
}
