export type WorkflowStageId = "configure" | "inject" | "observe" | "decode";

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
    description: "Choose a verified code and disclose the model assumptions.",
  },
  {
    id: "inject",
    order: 2,
    label: "Inject",
    description: "Add a manual or reproducible code-capacity error.",
  },
  {
    id: "observe",
    order: 3,
    label: "Observe",
    description: "Inspect the syndrome through coordinated representations.",
  },
  {
    id: "decode",
    order: 4,
    label: "Decode",
    description: "Review the correction, residual, status, and limitations.",
  },
];

