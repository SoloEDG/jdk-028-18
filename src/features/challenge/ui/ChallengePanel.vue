<script setup lang="ts">
import type { CircuitDocument } from "@/shared/types";
import type { Target } from "../lib/targets";
import type { TruthTableResult } from "../lib/truthTable";
import { targets } from "../lib/targets";
import TruthTable from "./TruthTable.vue";
defineProps<{
  document: CircuitDocument;
  target: Target;
  table: TruthTableResult;
  passed: boolean;
  inspected: boolean;
  hint: boolean;
}>();
defineEmits<{ choose: [id: string]; check: []; hint: [] }>();
</script>
<template>
  <aside class="challenge panel">
    <div class="panel-heading"><span>实验目标</span><small>MISSION</small></div>
    <label class="target-label" for="target">选择实验</label
    ><select
      id="target"
      :value="target.id"
      @change="$emit('choose', ($event.target as HTMLSelectElement).value)"
    >
      <option v-for="item in targets" :key="item.id" :value="item.id">
        {{ item.title }}
      </option>
    </select>
    <div class="mission-mark">{{ target.formula }}</div>
    <h2>{{ target.title }}</h2>
    <p class="mission-brief">{{ target.brief }}</p>
    <div class="table-heading">
      完整真值表
      <span
        >合法 {{ table.covered }} / 共 4 种 · 排除 {{ table.excluded }} 种</span
      >
    </div>
    <p v-if="table.error" class="inline-error">{{ table.error }}</p>
    <template v-else>
      <TruthTable
        :rows="table.rows"
        :a="
          document.nodes.find((n) => n.label === 'A' && n.kind === 'INPUT')
            ?.value
        "
        :b="
          document.nodes.find((n) => n.label === 'B' && n.kind === 'INPUT')
            ?.value
        "
        :inspected="inspected"
      />
      <p v-if="table.contradiction" class="inline-error coverage-warn">
        分组约束互相矛盾，不存在任何合法输入组合：本次检测 0 种组合，不能判定为通过。
      </p>
      <p v-else-if="table.excluded" class="coverage-note">
        被约束排除、未参与检测的组合：
        <template
          v-for="(row, index) in table.excludedRows"
          :key="`${row.a}${row.b}`"
          >(A={{ row.a }}, B={{ row.b }})<template
            v-if="index < table.excludedRows.length - 1"
            >、</template
          ></template
        >。
      </p>
      <p v-if="table.truncated" class="inline-error coverage-warn">
        输入较多，合法组合枚举达到上限，检测结果可能不完整。
      </p>
    </template>
    <button class="primary check-button" @click="$emit('check')">
      检测电路 <span>↗</span>
    </button>
    <p
      v-if="inspected"
      class="check-result"
      :class="passed ? 'passed' : 'failed'"
      role="status"
    >
      <template v-if="table.error">请先完成输入和输出配置</template>
      <template v-else-if="table.contradiction"
        >约束矛盾导致 0 种合法组合，检测不通过，请先调整分组</template
      >
      <template v-else-if="passed"
        >✓ 实验成功，{{ table.covered }} 种合法输入组合全部通过（另有
        {{ table.excluded }} 种被约束排除）</template
      >
      <template v-else
        >尚有
        {{ table.rows.filter((r) => r.legal && !r.matches).length }}
        种合法输入未通过</template
      >
    </p>
    <button class="text-button" @click="$emit('hint')">
      {{ hint ? "收起实验提示" : "需要一点提示？" }}
    </button>
    <p v-if="hint" class="hint">{{ target.hint }}</p>
    <div class="lab-note">
      <b>实验手记</b>
      <p>
        检测只枚举满足分组约束的合法输入组合，被排除的组合会明确列出；约束矛盾导致零组合时不会显示全部通过。检测不会改变开关位置。
      </p>
    </div>
  </aside>
</template>
