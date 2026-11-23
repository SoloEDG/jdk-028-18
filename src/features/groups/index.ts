export {
  GROUP_KIND_META,
  enumerateLegal,
  explainConflict,
  groupSatisfied,
  isLegal,
  nearestLegal,
  planChanges,
  type Assignment,
  type ChangeCandidate,
  type ConflictReport,
} from "./lib/constraints";
export {
  inputIdsOf,
  readAssignment,
  useGroups,
  type PendingChange,
} from "./model/useGroups";
export { default as GroupPanel } from "./ui/GroupPanel.vue";
