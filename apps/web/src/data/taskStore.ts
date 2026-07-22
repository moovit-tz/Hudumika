import { useSyncExternalStore } from 'react';

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  completed: boolean;
  important: boolean;
  dueDate?: string;
  priority: 'high' | 'medium' | 'low';
  listId: string;
  subtasks: SubTask[];
}

export interface TaskList {
  id: string;
  name: string;
  color: string;
}

// ── Mock Initial Data ──
const DEFAULT_LISTS: TaskList[] = [
  { id: 'inbox',    name: 'My Tasks',         color: '#3b82f6' },
  { id: 'logistics',name: 'Cargo Operations',  color: '#ea580c' },
  { id: 'customs',  name: 'Customs Clearance',color: '#0891b2' },
  { id: 'personal', name: 'Personal',          color: '#10b981' },
];

const DEFAULT_TASKS: Task[] = [
  {
    id: 'T1',
    title: 'Verify Bill of Lading for BL9827',
    notes: 'Make sure container seal number matches the packing list.',
    completed: false,
    important: true,
    dueDate: '2026-06-28',
    priority: 'high',
    listId: 'logistics',
    subtasks: [
      { id: 'ST1', title: 'Compare seal numbers', completed: true },
      { id: 'ST2', title: 'Upload copy to file manager', completed: false },
    ]
  },
  {
    id: 'T2',
    title: 'Submit customs entry for consignment A',
    notes: 'TANCIS portal will be down on Sunday. Submit by Saturday night.',
    completed: false,
    important: true,
    dueDate: '2026-06-27',
    priority: 'high',
    listId: 'customs',
    subtasks: []
  },
  {
    id: 'T3',
    title: 'Prepare invoice for Dar es Salaam port charges',
    notes: 'Verify with port authority invoice department first.',
    completed: true,
    important: false,
    dueDate: '2026-06-25',
    priority: 'medium',
    listId: 'inbox',
    subtasks: []
  },
  {
    id: 'T4',
    title: 'Call shipping agent regarding demurrage charges',
    notes: 'Agent promised 3 days extra free time. Need confirmation email.',
    completed: false,
    important: false,
    dueDate: '2026-06-29',
    priority: 'low',
    listId: 'logistics',
    subtasks: []
  },
];

let tasks = [...DEFAULT_TASKS];
let lists = [...DEFAULT_LISTS];

// ── Listeners ──
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function emit() {
  for (const l of listeners) l();
}

// ── Store APIs ──
export function useTasks() {
  return useSyncExternalStore(subscribe, () => tasks);
}

export function useTaskLists() {
  return useSyncExternalStore(subscribe, () => lists);
}

export function addTask(title: string, listId = 'inbox', priority: 'high' | 'medium' | 'low' = 'medium', dueDate?: string) {
  const newTask: Task = {
    id: `TASK_${Date.now()}`,
    title,
    completed: false,
    important: false,
    priority,
    listId,
    dueDate,
    subtasks: []
  };
  tasks = [...tasks, newTask];
  emit();
  return newTask;
}

export function updateTask(id: string, patch: Partial<Task>) {
  tasks = tasks.map(t => t.id === id ? { ...t, ...patch } : t);
  emit();
}

export function deleteTask(id: string) {
  tasks = tasks.filter(t => t.id !== id);
  emit();
}

export function addTaskList(name: string, color = '#3b82f6') {
  const newList: TaskList = {
    id: `LIST_${Date.now()}`,
    name,
    color
  };
  lists = [...lists, newList];
  emit();
  return newList;
}

export function deleteTaskList(id: string) {
  lists = lists.filter(l => l.id !== id);
  tasks = tasks.filter(t => t.listId !== id); // Cascade delete tasks
  emit();
}
