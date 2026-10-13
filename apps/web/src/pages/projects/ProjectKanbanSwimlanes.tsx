import React, { useState } from 'react';
import { useTodos, hydrateTasksFromServer, type TaskStatus } from '../../data/calendarStore.js';
import { apiFetch } from '../../lib/api.js';
import { showAlert } from '../../lib/alert.js';
import { KanbanBoard, type KanbanColumn } from '../../components/ui/kanban-board.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '../../components/ui/select.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
const columns: KanbanColumn<TaskStatus>[]=[{id:'none',label:'Not started'},{id:'in_progress',label:'In progress'},{id:'in_review',label:'Review'},{id:'waiting',label:'Waiting'},{id:'completed',label:'Completed'}];
interface Props { projectId?: string; projectName?: string; onNewTask?:()=>void; onSelectTask?:(id:string)=>void }
export const ProjectKanbanSwimlanes: React.FC<Props> = ({projectId,onNewTask,onSelectTask}) => {
 const all=useTodos();const [search,setSearch]=useState('');const [priority,setPriority]=useState('all');
 const tasks=all.filter(task=>!task.deletedAt&&task.projectId===projectId&&task.title.toLowerCase().includes(search.toLowerCase())&&(priority==='all'||task.priority===priority)).map(task=>({...task,columnId:task.completed?'completed':task.status}));
 async function move(id:string,_from:string,to:string){try{await apiFetch(`/v1/tasks/items/${id}`,{method:'PATCH',body:JSON.stringify({status:to,completed:to==='completed'})});await hydrateTasksFromServer();}catch(err:any){showAlert(err.message||'Unable to move task',{variant:'error'});}}
 return <div className="space-y-4"><div className="flex flex-wrap justify-between gap-3"><Select value={priority} onValueChange={setPriority}><SelectTrigger className="w-48"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="all">All priorities</SelectItem>{['urgent','high','medium','low'].map(value=><SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><div className="flex flex-wrap gap-2"><SearchToolbar search={search} onSearch={setSearch} placeholder="Search tasks"/>{onNewTask&&<Button onClick={onNewTask}>New task</Button>}</div></div><KanbanBoard columns={columns} items={tasks} onDrop={move} defaultPageSize={5} pageSizeOptions={[5,10,15,25]} renderCard={task=><div onClick={()=>onSelectTask?.(task.id)} style={{cursor:'pointer'}}><div className="kb-card-title">{task.title}</div><div className="kb-card-meta"><Badge variant="gray">{task.priority||'medium'}</Badge>{task.due&&<span className="kb-meta-item">{task.due}</span>}{task.assigneeName&&<span className="kb-meta-item" style={{marginLeft:'auto'}}><PersonAvatar userId={task.assigneeId} name={task.assigneeName} size={20}/></span>}</div></div>}/></div>;
};
