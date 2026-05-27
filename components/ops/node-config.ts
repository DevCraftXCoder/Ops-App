// Non-component exports extracted from nodes.tsx to satisfy react-doctor/only-export-components
// (Fast Refresh requires component files to only export components)

export const GREEN  = "#22c55e";
export const AMBER  = "#f59e0b";
export const BLUE   = "#3b82f6";
export const TEAL   = "#14b8a6";
export const ORANGE = "#f97316";
export const RED    = "#dc2828";
export const PURPLE = "#a855f7";
export const GREY   = "#6b7280";

export const NODE_PALETTE = [
  { group: "Triggers", items: [
    { type: "schedule", label: "Schedule", accent: BLUE },
    { type: "onDemand", label: "On Demand", accent: GREEN },
    { type: "watchFile", label: "Watch File", accent: AMBER },
  ] },
  { group: "Actions", items: [
    { type: "shellScript", label: "Shell Script", accent: TEAL },
    { type: "httpRequest", label: "HTTP Request", accent: BLUE },
    { type: "sendEmail", label: "Send Email", accent: GREEN },
    { type: "webhook", label: "Webhook", accent: PURPLE },
    { type: "createTicket", label: "Create Ticket", accent: RED },
  ] },
  { group: "Flow Control", items: [
    { type: "split", label: "Split", accent: ORANGE },
    { type: "multiplex", label: "Multiplex", accent: PURPLE },
    { type: "join", label: "Join", accent: TEAL },
  ] },
  { group: "Limits", items: [
    { type: "maxRunTime", label: "Max Run Time", accent: GREY },
    { type: "maxLogSize", label: "Max Log Size", accent: GREY },
    { type: "maxMemory", label: "Max Memory", accent: GREY },
    { type: "maxCpu", label: "Max CPU", accent: GREY },
  ] },
];

export const EDGE_TYPE_OPTIONS = [
  { value: "success", label: "On Success", stroke: GREEN },
  { value: "error", label: "On Error", stroke: RED },
  { value: "continue", label: "On Continue", stroke: TEAL },
  { value: "critical", label: "On Critical", stroke: ORANGE },
] as const;
