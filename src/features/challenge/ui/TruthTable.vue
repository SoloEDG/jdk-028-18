<script setup lang="ts">
import type { TruthRow } from "../lib/truthTable";
defineProps<{
  rows: TruthRow[];
  a: number | undefined;
  b: number | undefined;
  inspected: boolean;
}>();
</script>
<template>
  <table class="truth-table">
    <thead>
      <tr>
        <th>A</th>
        <th>B</th>
        <th>目标 Y</th>
        <th>实际 Y</th>
      </tr>
    </thead>
    <tbody>
      <tr
        v-for="row in rows"
        :key="`${row.a}${row.b}`"
        :class="[
          { 'current-row': row.legal && row.a === a && row.b === b },
          { 'excluded-row': !row.legal },
        ]"
      >
        <td>{{ row.a }}</td>
        <td>{{ row.b }}</td>
        <td>{{ row.expected }}</td>
        <td
          v-if="row.legal"
          :class="{
            mismatch: inspected && !row.matches,
            match: inspected && row.matches,
          }"
        >
          {{ row.actual
          }}<span v-if="inspected">{{ row.matches ? " ✓" : " ×" }}</span>
        </td>
        <td v-else class="excluded-cell" title="该输入组合被分组约束排除，不参与检测">
          排除
        </td>
      </tr>
    </tbody>
  </table>
</template>
