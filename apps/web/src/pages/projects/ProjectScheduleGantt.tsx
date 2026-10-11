import React, { useMemo, useState } from 'react';
import { useTodos } from '../../data/calendarStore.js';
import { Card, CardContent } from '../../components/ui/card.js';
import { Button } from '../../components/ui/button.js';
import { Badge } from '../../components/ui/badge.js';
import { SearchToolbar } from '../../components/ui/filter-dropdown.js';
import { PersonAvatar } from '../../components/PersonAvatar.js';
interface Props { projectId?: string; projectName?: string; onNewTask?: () => void; onSelectTab?: (tab: string) => void; onSelectTask?: (id: string) => void }
export const ProjectScheduleGantt: React.FC<Props> = ({projectId, onNewTask, onSelectTask}) => {
 const all = useTodos(); const [search,setSearch]=useState('');
 const tasks=all.filter(task=>!task.deletedAt && task.projectId===projectId && task.title.toLowerCase().includes(search.toLowerCase()));
 const range=useMemo(()=>{const dates=tasks.flatMap(task=>[task.start,task.due].filter(Boolean).map(date=>new Date(date!).getTime())).filter(Number.isFinite);const start=dates.length?Math.min(...dates):Date.now();const end=dates.length?Math.max(...dates):start;return {start,end,span:Math.max(86400000,end-start)};},[tasks]);
 return <div className="space-y-4"><div className="flex flex-wrap justify-between gap-3"><span className="text-muted-foreground">{tasks.length} scheduled tasks</span><div className="flex gap-2"><SearchToolbar search={search} onSearch={setSearch} placeholder="Search schedule" />{onNewTask&&<Button onClick={onNewTask}>New task</Button>}</div></div>
 <Card><CardContent className="pt-4 space-y-4"><div className="flex justify-between text-sm text-muted-foreground"><span>{new Date(range.start).toLocaleDateString()}</span><span>{new Date(range.end).toLocaleDateString()}</span></div>
 {tasks.map(task=>{const start=task.start||task.due;const end=task.due||task.start;const left=start?Math.max(0,(new Date(start).getTime()-range.start)/range.span*100):0;const width=end&&start?Math.max(1,(new Date(end).getTime()-new Date(start).getTime()+86400000)/range.span*100):0;
 return <div key={task.id} className="grid gap-3 border-b pb-3 md:grid-cols-2"><div className="min-w-0 space-y-1"><Button variant="link" className="h-auto whitespace-normal text-left" onClick={()=>onSelectTask?.(task.id)}>{task.title}</Button><div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"><span>{task.start||'Start not set'} → {task.due||'Due date not set'}</span><Badge variant={task.completed?'success':'gray'}>{task.completed?'Completed':task.status==='none'?'Not started':task.status.replaceAll('_',' ')}</Badge>{task.assigneeName&&<PersonAvatar userId={task.assigneeId} name={task.assigneeName} size={24}/>}</div></div><div className="relative min-h-8 self-center rounded bg-muted overflow-hidden">{start&&end?<div title={`${task.title}: ${start} to ${end}`} className="absolute top-2 h-4 rounded bg-primary" style={{left:`${left}%`,width:`${Math.min(100-left,width)}%`}}/>:<span className="px-2 text-sm text-muted-foreground">Dates not set</span>}</div></div>;})}
 {!tasks.length&&<p className="text-muted-foreground">No tasks match this schedule.</p>}</CardContent></Card></div>;
};
