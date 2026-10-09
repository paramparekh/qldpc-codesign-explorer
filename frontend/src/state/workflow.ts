export type WorkflowStageId = "configure" | "inject" | "observe" | "decode" | "results";

export type WorkflowStage = {
  id: WorkflowStageId;
  order: number;
  label: string;
  description: string;
};

export const workflowStages: WorkflowStage[] = [
  {
    id: "configure",
    order: 1,
    label: "Configure",
    description: "Choose the qLDPC code and error settings.",
  },
  {
    id: "inject",
    order: 2,
    label: "Inject",
    description: "Choose errors by hand or generate them from a saved seed.",
  },
  {
    id: "observe",
    order: 3,
    label: "Observe",
    description: "See which checks detect the error.",
  },
  {
    id: "decode",
    order: 4,
    label: "Decode",
    description: "Apply a correction and check whether it succeeds.",
  },
  {
    id: "results",
    order: 5,
    label: "Results",
    description: "Run repeated trials and compare logical-error rates.",
  },
];
