export interface EnterpriseRiskItem {
  id: string;
  name: string;
  rating: 'High' | 'Low' | 'Medium' | 'Critical';
  severity: 'Insignificant' | 'Low' | 'Medium' | 'Major' | 'Severe';
  probability: 'Rare' | 'Unlikely' | 'Possible' | 'Likely' | 'Certain';
  valueAtRisk: number;
  category?: string;
  owner?: string;
}

export interface RiskMatrixCell {
  probability: 'Certain' | 'Likely' | 'Possible' | 'Unlikely' | 'Rare';
  severity: 'Insignificant' | 'Low' | 'Medium' | 'Major' | 'Severe';
  count: number;
  level: 'very_low' | 'low' | 'medium' | 'high' | 'critical';
}

export interface TopVarProject {
  name: string;
  valueAtRisk: number; // in thousands (K)
  totalValue: number;  // in thousands (K)
}

export interface GanttTaskItem {
  id: string;
  index: number;
  name: string;
  isGroup?: boolean;
  plannedStart: string;
  plannedFinish: string;
  durationDays: number;
  assigneeName?: string;
  assigneeInitials?: string;
  assigneeColor?: string;
  status: 'on_track' | 'overdue' | 'future' | 'done';
  color?: string;
  parentId?: string;
  dependsOnId?: string;
  progressPct?: number;
}

export interface KanbanTaskItem {
  id: string;
  name: string;
  swimlane: 'critical' | 'major' | 'normal';
  column: 'backlog' | 'in_development' | 'in_testing' | 'done';
  status: 'On Track' | 'Overdue' | 'Future' | 'Done';
  assigneeInitials?: string;
  assigneeName?: string;
  assigneeColor?: string;
  secondaryAssigneeInitials?: string;
  secondaryAssigneeColor?: string;
}

export interface BudgetProjectItem {
  id: string;
  name: string;
  budget: number;
  actualCost: number;
  percentDone: number;
  projectedCost: number;
  health: 'On Track' | 'At Risk' | 'Overdue' | 'Blocked' | 'Done' | 'Future' | 'Inactive';
  selected?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 1 & 3: RISKS DASHBOARD DATA
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_RISK_ITEMS: EnterpriseRiskItem[] = [
  {
    id: 'risk-1',
    name: 'Salesforce integration solution is not finalised yet / Dependency on API',
    rating: 'High',
    severity: 'Major',
    probability: 'Likely',
    valueAtRisk: 29250.00,
    category: 'Technical',
  },
  {
    id: 'risk-2',
    name: 'Sun JDK 14+ may have a per CPU pricing',
    rating: 'Low',
    severity: 'Low',
    probability: 'Possible',
    valueAtRisk: 27500.00,
    category: 'Commercial',
  },
  {
    id: 'risk-3',
    name: 'Lack of tracking marketing strategies may result in following obsolete methods',
    rating: 'High',
    severity: 'Severe',
    probability: 'Likely',
    valueAtRisk: 22100.00,
    category: 'Strategic',
  },
  {
    id: 'risk-4',
    name: "Ads may not reflect the company's guidelines",
    rating: 'Low',
    severity: 'Medium',
    probability: 'Possible',
    valueAtRisk: 17000.00,
    category: 'Brand',
  },
  {
    id: 'risk-5',
    name: 'Promotion based on singular sets of data may lead to waste and missed',
    rating: 'Low',
    severity: 'Medium',
    probability: 'Possible',
    valueAtRisk: 16665.00,
    category: 'Analytics',
  },
];

export const DEFAULT_RISK_MATRIX_CELLS: RiskMatrixCell[] = [
  { probability: 'Certain', severity: 'Severe', count: 1, level: 'very_low' },
  { probability: 'Likely', severity: 'Severe', count: 3, level: 'high' },
  { probability: 'Likely', severity: 'Major', count: 4, level: 'high' },
  { probability: 'Likely', severity: 'Medium', count: 1, level: 'medium' },
  { probability: 'Possible', severity: 'Severe', count: 2, level: 'medium' },
  { probability: 'Possible', severity: 'Major', count: 2, level: 'medium' },
  { probability: 'Possible', severity: 'Medium', count: 2, level: 'low' },
  { probability: 'Possible', severity: 'Low', count: 3, level: 'low' },
  { probability: 'Unlikely', severity: 'Low', count: 2, level: 'very_low' },
  { probability: 'Rare', severity: 'Insignificant', count: 2, level: 'very_low' },
];

export const DEFAULT_TOP_VAR_PROJECTS: TopVarProject[] = [
  { name: 'Event Launch', valueAtRisk: 227.5, totalValue: 350.0 },
  { name: 'Website Design', valueAtRisk: 163.61, totalValue: 275.0 },
  { name: 'Software Development', valueAtRisk: 150.0, totalValue: 260.0 },
  { name: 'Marketing Event', valueAtRisk: 133.61, totalValue: 255.0 },
  { name: 'Marketing Campaign', valueAtRisk: 113.95, totalValue: 220.0 },
  { name: 'New Product Development', valueAtRisk: 58.6, totalValue: 130.0 },
  { name: 'Software localization plan', valueAtRisk: 20.5, totalValue: 45.0 },
];

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 2: GANTT SCHEDULE DATA (Software Development Project)
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_GANTT_TASKS: GanttTaskItem[] = [
  {
    id: 'task-11',
    index: 11,
    name: 'Design',
    isGroup: true,
    plannedStart: '10-Aug-26',
    plannedFinish: '14-Aug-26',
    durationDays: 5,
    status: 'on_track',
    color: '#8B5CF6',
    progressPct: 65,
  },
  {
    id: 'task-12',
    index: 12,
    name: 'Review preliminary software specifications',
    plannedStart: '10-Aug-26',
    plannedFinish: '14-Aug-26',
    durationDays: 5,
    assigneeName: 'Andrew Brooks',
    assigneeInitials: 'AB',
    assigneeColor: '#14B8A6',
    status: 'done',
    color: '#6366F1',
    parentId: 'task-11',
    progressPct: 100,
  },
  {
    id: 'task-13',
    index: 13,
    name: 'Add functional specifications',
    plannedStart: '10-Aug-26',
    plannedFinish: '14-Aug-26',
    durationDays: 5,
    assigneeName: 'Daniel Walsh',
    assigneeInitials: 'DW',
    assigneeColor: '#10B981',
    status: 'on_track',
    color: '#60A5FA',
    parentId: 'task-11',
    dependsOnId: 'task-12',
    progressPct: 70,
  },
  {
    id: 'task-14',
    index: 14,
    name: 'Develop prototype',
    plannedStart: '10-Aug-26',
    plannedFinish: '14-Aug-26',
    durationDays: 5,
    assigneeName: 'Joe Cool',
    assigneeInitials: 'JC',
    assigneeColor: '#8B5CF6',
    status: 'done',
    color: '#60A5FA',
    parentId: 'task-11',
    dependsOnId: 'task-13',
    progressPct: 100,
  },
  {
    id: 'task-15',
    index: 15,
    name: 'Design wireframes',
    plannedStart: '10-Aug-26',
    plannedFinish: '14-Aug-26',
    durationDays: 5,
    status: 'on_track',
    color: '#60A5FA',
    parentId: 'task-11',
    progressPct: 60,
  },
  {
    id: 'task-16',
    index: 16,
    name: 'Design Logo',
    plannedStart: '10-Aug-26',
    plannedFinish: '10-Aug-26',
    durationDays: 1,
    assigneeName: 'Grace Collins',
    assigneeInitials: 'GC',
    assigneeColor: '#3B82F6',
    status: 'overdue',
    color: '#60A5FA',
    parentId: 'task-11',
    progressPct: 40,
  },
  {
    id: 'task-17',
    index: 17,
    name: 'Abstract specification',
    plannedStart: '10-Aug-26',
    plannedFinish: '14-Aug-26',
    durationDays: 5,
    assigneeName: 'Grace Collins',
    assigneeInitials: 'GC',
    assigneeColor: '#3B82F6',
    status: 'on_track',
    color: '#F59E0B',
    parentId: 'task-11',
    dependsOnId: 'task-16',
    progressPct: 55,
  },
  {
    id: 'task-18',
    index: 18,
    name: 'Component design',
    plannedStart: '10-Aug-26',
    plannedFinish: '14-Aug-26',
    durationDays: 5,
    assigneeName: 'Grace Collins',
    assigneeInitials: 'GC',
    assigneeColor: '#3B82F6',
    status: 'on_track',
    color: '#60A5FA',
    parentId: 'task-11',
    progressPct: 50,
  },
  {
    id: 'task-19',
    index: 19,
    name: 'Data structure design',
    plannedStart: '10-Aug-26',
    plannedFinish: '14-Aug-26',
    durationDays: 5,
    assigneeName: 'Grace Collins',
    assigneeInitials: 'GC',
    assigneeColor: '#3B82F6',
    status: 'on_track',
    color: '#60A5FA',
    parentId: 'task-11',
    progressPct: 45,
  },
  {
    id: 'task-20',
    index: 20,
    name: 'Development',
    isGroup: true,
    plannedStart: '17-Aug-26',
    plannedFinish: '21-Aug-26',
    durationDays: 5,
    status: 'future',
    color: '#C084FC',
    dependsOnId: 'task-11',
    progressPct: 0,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 4: KANBAN BOARD WITH SWIMLANES DATA
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_KANBAN_CARDS: KanbanTaskItem[] = [
  // Major Swimlane
  {
    id: 'kb-1',
    name: 'Component design',
    swimlane: 'major',
    column: 'backlog',
    status: 'On Track',
    assigneeInitials: 'GC',
    assigneeColor: '#38BDF8',
  },
  {
    id: 'kb-2',
    name: 'Design Logo',
    swimlane: 'major',
    column: 'in_development',
    status: 'Overdue',
    assigneeInitials: 'GC',
    assigneeColor: '#38BDF8',
  },
  {
    id: 'kb-3',
    name: 'Add functional specifications',
    swimlane: 'major',
    column: 'in_testing',
    status: 'On Track',
    assigneeInitials: 'DW',
    assigneeColor: '#34D399',
  },
  {
    id: 'kb-4',
    name: 'Develop prototype',
    swimlane: 'major',
    column: 'done',
    status: 'Done',
    assigneeInitials: 'JC',
    assigneeColor: '#818CF8',
    secondaryAssigneeInitials: 'EJ',
    secondaryAssigneeColor: '#FBBF24',
  },

  // Normal Swimlane
  {
    id: 'kb-5',
    name: 'Assign development staff',
    swimlane: 'normal',
    column: 'backlog',
    status: 'Future',
  },
  {
    id: 'kb-6',
    name: 'Deploy software',
    swimlane: 'normal',
    column: 'backlog',
    status: 'Future',
    assigneeInitials: 'DW',
    assigneeColor: '#34D399',
  },
  {
    id: 'kb-7',
    name: 'API Development',
    swimlane: 'normal',
    column: 'in_development',
    status: 'Future',
    assigneeInitials: 'JC',
    assigneeColor: '#818CF8',
  },
  {
    id: 'kb-8',
    name: 'Review preliminary software specifications',
    swimlane: 'normal',
    column: 'done',
    status: 'Done',
    assigneeInitials: 'AB',
    assigneeColor: '#2DD4BF',
  },
  {
    id: 'kb-9',
    name: 'Conduct needs analysis',
    swimlane: 'normal',
    column: 'done',
    status: 'Done',
    assigneeInitials: 'AB',
    assigneeColor: '#2DD4BF',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// SCREEN 5: BUDGET TRACKING DATA
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_BUDGET_PROJECTS: BudgetProjectItem[] = [
  {
    id: 'b-1',
    name: 'HR System Implementation',
    budget: 85000.00,
    actualCost: 84733.33,
    percentDone: 95,
    projectedCost: 84733.33,
    health: 'On Track',
  },
  {
    id: 'b-2',
    name: 'Marketing Campaign',
    budget: 270000.00,
    actualCost: 0.00,
    percentDone: 1,
    projectedCost: 265600.00,
    health: 'On Track',
  },
  {
    id: 'b-3',
    name: 'Event Launch',
    budget: 70000.00,
    actualCost: 0.00,
    percentDone: 0,
    projectedCost: 64000.00,
    health: 'On Track',
  },
  {
    id: 'b-4',
    name: 'Scrum Overview',
    budget: 0.00,
    actualCost: 0.00,
    percentDone: 43,
    projectedCost: 0.00,
    health: 'On Track',
  },
  {
    id: 'b-5',
    name: 'MS Sharepoint deployment',
    budget: 950000.00,
    actualCost: 724000.00,
    percentDone: 99,
    projectedCost: 764000.00,
    health: 'On Track',
  },
  {
    id: 'b-6',
    name: 'Apotex-Ariba-Sourcing',
    budget: 100500.00,
    actualCost: 40350.00,
    percentDone: 7,
    projectedCost: 326125.00,
    health: 'On Track',
  },
  {
    id: 'b-7',
    name: 'Electronic Government',
    budget: 30000.00,
    actualCost: 27200.00,
    percentDone: 91,
    projectedCost: 27200.00,
    health: 'On Track',
  },
  {
    id: 'b-8',
    name: 'Software localization plan',
    budget: 285000.00,
    actualCost: 350000.00,
    percentDone: 74,
    projectedCost: 421200.00,
    health: 'On Track',
  },
  {
    id: 'b-9',
    name: 'Renovation Plan',
    budget: 180000.00,
    actualCost: 91700.00,
    percentDone: 39,
    projectedCost: 192100.00,
    health: 'On Track',
    selected: true,
  },
  {
    id: 'b-10',
    name: 'New Opportunity for rebuilding',
    budget: 95000.00,
    actualCost: 0.00,
    percentDone: 0,
    projectedCost: 89600.00,
    health: 'On Track',
  },
  {
    id: 'b-11',
    name: 'MS Solutions Framework App Dev...',
    budget: 550000.00,
    actualCost: 0.00,
    percentDone: 0,
    projectedCost: 537129.86,
    health: 'On Track',
  },
];
