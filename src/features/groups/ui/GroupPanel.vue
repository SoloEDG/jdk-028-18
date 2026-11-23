<script setup lang="ts">
import { computed, reactive, ref } from "vue";
import type { GateNode, GroupKind, InputGroup } from "@/shared/types";
import {
  GROUP_KIND_META,
  type ChangeCandidate,
} from "../lib/constraints";
import type { PendingChange } from "../model/useGroups";

const props = defineProps<{
  nodes: GateNode[];
  groups: InputGroup[];
  pending: PendingChange | null;
  isCurrentLegal: boolean;
  labelOf: (id: string) => string;
}>();

const emit = defineEmits<{
  add: [kind: GroupKind, name: string, memberIds: string[]];
  update: [id: string, patch: Partial<Omit<InputGroup, "id">>];
  remove: [id: string];
  choose: [index: number];
  confirm: [];
  cancel: [];
}>();

const inputs = computed(() =>
  props.nodes.filter((node) => node.kind === "INPUT"),
);
const kindOptions: GroupKind[] = ["ONE_HOT", "MUTEX", "LINK"];
const form = reactive<{ kind: GroupKind; name: string; members: string[] }>({
  kind: "ONE_HOT",
  name: "",
  members: [],
});
const editingId = ref<string | null>(null);

function toggleMember(id: string): void {
  const index = form.members.indexOf(id);
  if (index >= 0) form.members.splice(index, 1);
  else form.members.push(id);
}

function submitForm(): void {
  if (form.members.length < 2) return;
  if (editingId.value) {
    emit("update", editingId.value, {
      kind: form.kind,
      name: form.name.trim() || "未命名分组",
      memberIds: [...form.members],
    });
  } else {
    emit("add", form.kind, form.name, [...form.members]);
  }
  resetForm();
}

function resetForm(): void {
  editingId.value = null;
  form.kind = "ONE_HOT";
  form.name = "";
  form.members = [];
}

function startEdit(group: InputGroup): void {
  editingId.value = group.id;
  form.kind = group.kind;
  form.name = group.name;
  form.members = [...group.memberIds];
}

function memberLabel(id: string): string {
  return props.labelOf(id);
}

function valueText(candidate: ChangeCandidate, id: string): string {
  return String(candidate.assignment[id] ?? 0);
}

const pendingCandidates = computed(() => props.pending?.candidates ?? []);
</script>

<template>
  <div class="group-panel">
    <div class="panel-heading">
      <span>输入分组</span><small>INPUT GROUPS</small>
    </div>
    <p class="group-intro">
      把开关编入一位有效、互斥或同值联动组，模拟编码器的合法按键状态；同一输入可属于多个组。
    </p>

    <p v-if="!inputs.length" class="panel-help">先放置输入开关，再建立分组。</p>

    <div v-else class="group-list">
      <article
        v-for="group in groups"
        :key="group.id"
        class="group-card"
        :style="{ '--group-color': GROUP_KIND_META[group.kind].color }"
      >
        <header>
          <b>{{ group.name }}</b>
          <span class="group-badge">{{ GROUP_KIND_META[group.kind].short }}</span>
        </header>
        <p class="group-rule">{{ GROUP_KIND_META[group.kind].rule }}</p>
        <div class="group-members">
          <span v-for="id in group.memberIds" :key="id" class="group-member">{{
            memberLabel(id)
          }}</span>
        </div>
        <footer>
          <button type="button" class="mini-button" @click="startEdit(group)">
            编辑
          </button>
          <button
            type="button"
            class="mini-button danger"
            @click="emit('remove', group.id)"
          >
            删除
          </button>
        </footer>
      </article>
      <p v-if="!groups.length" class="panel-help">
        还没有分组。用下面的表单新建，分组约束会立即参与开关切换与目标检测。
      </p>
    </div>

    <form
      v-if="inputs.length"
      class="group-form"
      @submit.prevent="submitForm"
    >
      <h3>{{ editingId ? "编辑分组" : "新建分组" }}</h3>
      <label class="form-row"
        >类型
        <select v-model="form.kind">
          <option v-for="kind in kindOptions" :key="kind" :value="kind">
            {{ GROUP_KIND_META[kind].title }}（{{ GROUP_KIND_META[kind].rule }}）
          </option>
        </select>
      </label>
      <label class="form-row"
        >名称
        <input
          v-model="form.name"
          maxlength="40"
          :placeholder="editingId ? '保留原名称' : '例如：按键编码组'"
        />
      </label>
      <fieldset class="form-row member-picker">
        <legend>成员（至少两个，可跨组复用）</legend>
        <label
          v-for="node in inputs"
          :key="node.id"
          class="member-check"
          :class="{ active: form.members.includes(node.id) }"
        >
          <input
            type="checkbox"
            :checked="form.members.includes(node.id)"
            @change="toggleMember(node.id)"
          />
          {{ node.label }}
        </label>
      </fieldset>
      <p v-if="form.members.length === 1" class="form-warn">
        至少再选择一个输入。
      </p>
      <div class="form-actions">
        <button
          type="submit"
          class="primary"
          :disabled="form.members.length < 2"
        >
          {{ editingId ? "保存修改" : "添加分组" }}
        </button>
        <button
          v-if="editingId"
          type="button"
          class="ghost-button"
          @click="resetForm"
        >
          取消编辑
        </button>
      </div>
    </form>

    <div
      v-if="pending"
      class="pending-box"
      :class="pending.conflict ? 'is-conflict' : 'is-preview'"
      role="dialog"
      aria-label="分组约束预览"
    >
      <h3>
        {{
          pending.mode === "click" ? "开关切换预览" : "分组调整预览"
        }}
      </h3>

      <template v-if="pending.conflict">
        <p class="conflict-summary">{{ pending.conflict.summary }}</p>
        <ul class="conflict-reasons">
          <li v-for="(reason, index) in pending.conflict.reasons" :key="index">
            {{ reason }}
          </li>
        </ul>
        <p v-if="pending.intent" class="conflict-intent">
          本次意图：{{ pending.intent }}
        </p>
        <p class="conflict-keep">所有开关保持原值，未做任何改动。</p>
        <div class="form-actions">
          <button type="button" class="primary" @click="emit('cancel')">
            知道了
          </button>
        </div>
      </template>

      <template v-else>
        <p v-if="pending.mode === 'click' && pending.intent" class="pending-intent">
          意图：{{ pending.intent }}。下列方案改动的开关数量相同，请对比差异后选择。
        </p>
        <p v-else class="pending-intent">
          当前取值已不满足分组约束，选择一个最近的合法调整；确认前开关不会变化。
        </p>
        <p v-if="pending.truncated" class="form-warn">
          输入较多，枚举达到上限，仅展示已找到的方案。
        </p>
        <div class="candidate-list">
          <button
            v-for="(candidate, index) in pendingCandidates"
            :key="index"
            type="button"
            class="candidate-card"
            :class="{ selected: pending.chosen === index }"
            @click="emit('choose', index)"
          >
            <b>方案 {{ index + 1 }} · 改动 {{ candidate.changes.length }} 位</b>
            <span class="candidate-bits">
              <em v-for="node in inputs" :key="node.id" :class="{ changed: candidate.changes.includes(node.id) }">
                {{ node.label }}={{ valueText(candidate, node.id) }}
              </em>
            </span>
            <span class="candidate-changes">
              变化：{{
                candidate.changes.length
                  ? candidate.changes.map(memberLabel).join("、")
                  : "无"
              }}
            </span>
          </button>
        </div>
        <div class="form-actions">
          <button type="button" class="primary" @click="emit('confirm')">
            确认变更
          </button>
          <button type="button" class="ghost-button" @click="emit('cancel')">
            {{
              pending.mode === "adjust" && pending.snapshot
                ? "撤销分组变更"
                : "取消"
            }}
          </button>
        </div>
      </template>
    </div>

    <p v-if="!isCurrentLegal && !pending" class="legal-flag illegal">
      当前开关取值不满足分组约束。
    </p>
    <p v-else-if="groups.length" class="legal-flag legal">
      当前取值满足全部分组约束。
    </p>
  </div>
</template>
