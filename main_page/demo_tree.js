export const DEMO_TREE = [
  {
    id: "iso-17065",
    label: "ISO/IEC 17065",
    children: [
      { id: "impartiality", label: "Impartiality" },
      { id: "competence", label: "Competence" },
      { id: "agreement", label: "Certification agreement" },
      { id: "decision", label: "Decision making" },
      { id: "public-info", label: "Public information" },
      { id: "complaints", label: "Complaints" },
      { id: "management", label: "Management system" },
    ],
  },
  {
    id: "reg-2023-1542",
    label: "Regulation (EU) 2023/1542",
    children: [
      { id: "scope", label: "Scope and categories" },
      { id: "conformity", label: "Conformity assessment" },
      { id: "nb-duties", label: "Notified body duties" },
      { id: "carbon", label: "Carbon footprint" },
      { id: "diligence", label: "Due diligence" },
      { id: "labelling", label: "Labelling" },
    ],
  },
  {
    id: "technical-file",
    label: "Technical documentation",
    children: [
      { id: "model", label: "Battery model" },
      { id: "tests", label: "Test reports" },
      { id: "performance", label: "Performance data" },
      { id: "safety", label: "Safety evidence" },
      { id: "recycled", label: "Recycled content" },
      { id: "supply", label: "Supply chain" },
      { id: "changes", label: "Change control" },
    ],
  },
  {
    id: "audit-programme",
    label: "Audit programme",
    children: [
      { id: "application", label: "Application review" },
      { id: "stage-1", label: "Stage 1" },
      { id: "stage-2", label: "Stage 2" },
      { id: "witness", label: "Witnessing" },
      { id: "surveillance", label: "Surveillance" },
      { id: "findings", label: "Findings" },
    ],
  },
  {
    id: "desk-tasks",
    label: "Desk tasks",
    children: [
      { id: "walter", label: "Walter" },
      { id: "judy", label: "Judy" },
      { id: "marcus", label: "Marcus" },
      { id: "wei", label: "Wei" },
      { id: "open-items", label: "Open items" },
      { id: "color-status", label: "Color status" },
      { id: "handover", label: "Handover" },
    ],
  },
];

export function demoCopy(root, child) {
  return `${child.label} is a demo note under ${root.label}. Nothing is filed here yet. The content pane shows this text so the tree can be checked. Choose another child and this note is replaced.`;
}
