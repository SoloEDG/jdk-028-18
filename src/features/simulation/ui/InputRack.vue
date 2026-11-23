<script setup lang="ts">
import { computed } from "vue";
import type {
  GateNode,
  InputGroup,
  SimulationResult,
} from "@/shared/types";
import { GROUP_KIND_META } from "@/features/groups";
const props = defineProps<{
  nodes: GateNode[];
  signals: SimulationResult;
  groups: InputGroup[];
  illegal: boolean;
}>();
defineEmits<{ toggle: [id: string] }>();
const inputs = computed(() =>
  props.nodes.filter((node) => node.kind === "INPUT"),
);
function groupsOf(id: string): InputGroup[] {
  return props.groups.filter((group) => group.memberIds.includes(id));
}
</script>
<template>
  <div class="input-rack">
    <div class="panel-heading">
      <span>输入控制</span><small>LIVE INPUTS</small>
    </div>
    <div class="rack-switches">
      <div
        v-for="node in inputs"
        :key="node.id"
        class="rack-switch-wrap"
        :class="{ illegal }"
      >
        <button
          :class="[
            'rack-switch',
            { on: signals.values[node.id] === 1 },
          ]"
          :aria-label="`切换输入 ${node.label}`"
          :aria-pressed="signals.values[node.id] === 1"
          @click="$emit('toggle', node.id)"
        >
          <span>{{ node.label }}</span
          ><i /><b>{{ signals.values[node.id] }}</b>
        </button>
        <div v-if="groupsOf(node.id).length" class="rack-group-tags">
          <span
            v-for="group in groupsOf(node.id)"
            :key="group.id"
            class="rack-group-tag"
            :style="{
              '--group-color': GROUP_KIND_META[group.kind].color,
            }"
            :title="GROUP_KIND_META[group.kind].rule"
            >{{ group.name }}·{{ GROUP_KIND_META[group.kind].short }}</span
          >
        </div>
      </div>
      <span v-if="!inputs.length" class="panel-help"
        >放置一个输入开关以发送信号。</span
      >
    </div>
    <p v-if="illegal" class="rack-warning">
      当前取值违反分组约束，切换前请先在右侧预览中选择合法调整。
    </p>
  </div>
</template>
