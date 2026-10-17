import { type FormEvent, type ReactNode, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import {
  Activity, AlertCircle, ArrowDown, ArrowRight, ArrowUpRight, CalendarDays,
  Check, CheckCheck, ChevronDown, Circle, ClipboardList, Clock3, Command,
  FolderKanban, LayoutDashboard, ListFilter, LoaderCircle, MoreHorizontal,
  Plus, Search, SlidersHorizontal, Sparkles, Target, Trash2, Users, X,
} from 'lucide-react';
import {
  getGetDashboardQueryKey, getGetProjectsQueryKey, getGetTasksQueryKey,
  useCreateProject, useCreateTask, useDeleteProject, useDeleteTask,
  useGetDashboard, useGetMembers, useGetProjects, useGetTasks,
  useUpdateProject, useUpdateTask,
} from '@workspace/api-client-react';
import type { Member, Project, Task } from '@workspace/api-client-react';
import { Link, Router as WouterRouter, useLocation } from 'wouter';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';

const queryClient = new QueryClient();
const projectColors = ['#d98e59', '#69958a', '#8298c4', '#d27b72', '#9b8aaf'];
const taskStatuses = ['todo', 'in-progress', 'review', 'done'] as const;
type View = 'overview' | 'projects' | 'tasks';
type ProjectDraft = { name: string; description: string; color: string; status: string; dueDate: string };
type TaskDraft = { projectId: string; title: string; description: string; status: string; priority: string; dueDate: string; assigneeId: string };

function dateLabel(value?: string | null, compact = false) {
  if (!value) return 'No date set';
  const dateKey = value.slice(0, 10);
  const date = new Date(`${dateKey}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', compact
    ? { month: 'short', day: 'numeric', timeZone: 'UTC' }
    : { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(date);
}
function initials(name?: string | null) {
  return (name || 'Unassigned').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}
function isLate(value?: string | null) {
  if (!value) return false;
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return value.slice(0, 10) < today;
}
function progress(project: Project) {
  return project.taskCount ? Math.round((project.completedTaskCount / project.taskCount) * 100) : 0;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Shell />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function Shell() {
  const [location] = useLocation();
  const { data: dashboard, isLoading: dashboardLoading, isError: dashboardError, refetch: refetchDashboard } = useGetDashboard();
  const { data: projects, isLoading: projectsLoading, isError: projectsError, refetch: refetchProjects } = useGetProjects();
  const { data: members } = useGetMembers();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [dialog, setDialog] = useState<'project' | 'task' | null>(null);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [notice, setNotice] = useState('');
  const filters = useMemo(() => ({
    ...(projectFilter ? { projectId: Number(projectFilter) } : {}),
    ...(statusFilter ? { status: statusFilter as 'todo' | 'in-progress' | 'review' | 'done' } : {}),
    ...(search.trim() ? { search: search.trim() } : {}),
  }), [projectFilter, statusFilter, search]);
  const { data: tasks, isLoading: tasksLoading, isError: tasksError, refetch: refetchTasks } = useGetTasks(filters);
  const client = useQueryClient();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const invalidateProjects = () => {
    void client.invalidateQueries({ queryKey: getGetProjectsQueryKey() });
    void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    void client.invalidateQueries({ queryKey: getGetTasksQueryKey() });
  };
  const invalidateTasks = () => {
    void client.invalidateQueries({ queryKey: getGetTasksQueryKey() });
    void client.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
    void client.invalidateQueries({ queryKey: getGetProjectsQueryKey() });
  };
  const openProject = (project?: Project) => { setEditingProject(project || null); setDialog('project'); };
  const openTask = (task?: Task) => { setEditingTask(task || null); setDialog('task'); };
  const closeDialog = () => { setDialog(null); setEditingProject(null); setEditingTask(null); };
  const saveProject = (draft: ProjectDraft) => {
    const body = { ...draft, dueDate: draft.dueDate || null, status: draft.status as 'active' | 'on-hold' | 'completed' };
    const onSuccess = () => { closeDialog(); invalidateProjects(); setNotice(editingProject ? 'Project updated' : 'Project created'); };
    if (editingProject) updateProject.mutate({ id: editingProject.id, data: body }, { onSuccess });
    else createProject.mutate({ data: body }, { onSuccess });
  };
  const saveTask = (draft: TaskDraft) => {
    const body = {
      projectId: Number(draft.projectId), title: draft.title, description: draft.description,
      status: draft.status as 'todo' | 'in-progress' | 'review' | 'done',
      priority: draft.priority as 'low' | 'medium' | 'high' | 'urgent',
      dueDate: draft.dueDate || null, assigneeId: draft.assigneeId ? Number(draft.assigneeId) : null,
    };
    const onSuccess = () => { closeDialog(); invalidateTasks(); setNotice(editingTask ? 'Task updated' : 'Task created'); };
    if (editingTask) updateTask.mutate({ id: editingTask.id, data: body }, { onSuccess });
    else createTask.mutate({ data: body }, { onSuccess });
  };
  const removeProject = (project: Project) => {
    if (window.confirm(`Delete “${project.name}” and its tasks? This cannot be undone.`)) {
      deleteProject.mutate({ id: project.id }, { onSuccess: () => { invalidateProjects(); setNotice('Project deleted'); } });
    }
  };
  const removeTask = (task: Task) => {
    if (window.confirm(`Delete “${task.title}”? This cannot be undone.`)) {
      deleteTask.mutate({ id: task.id }, { onSuccess: () => { invalidateTasks(); setNotice('Task deleted'); } });
    }
  };
  const setTaskStatus = (task: Task, status: string) => {
    updateTask.mutate({ id: task.id, data: { status: status as 'todo' | 'in-progress' | 'review' | 'done' } }, {
      onSuccess: () => { invalidateTasks(); setNotice(`Moved to ${statusLabel(status)}`); },
    });
  };
  const pathView: View | null = location === '/' ? 'overview' : location === '/projects' ? 'projects' : location === '/tasks' ? 'tasks' : null;
  const currentView = pathView;
  const isMutating = createProject.isPending || updateProject.isPending || createTask.isPending || updateTask.isPending;

  return (
    <div className="grain min-h-[100dvh] bg-background text-foreground">
      <div className="flex min-h-[100dvh]">
        <aside className="hidden w-[246px] shrink-0 flex-col bg-[#203d3a] px-4 py-6 text-[#f5f0e5] md:flex">
          <Link href="/" className="mb-10 flex items-center gap-3 px-2" data-testid="link-workspace-home">
            <div className="grid size-9 place-items-center rounded-[11px] bg-[#e7a16b] text-[#203d3a]"><Target size={19} strokeWidth={2.5} /></div>
            <div><div className="font-[Manrope] text-[15px] font-extrabold tracking-[-.04em]">fieldnotes</div><div className="mt-0.5 text-[10px] uppercase tracking-[.2em] text-[#a9bbb3]">Studio workspace</div></div>
          </Link>
          <div className="px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-[#91aaa1]">Workspace</div>
          <nav className="mt-3 space-y-1" aria-label="Workspace navigation">
            <NavItem href="/" icon={<LayoutDashboard size={17} />} label="Overview" active={location === '/'} />
            <NavItem href="/projects" icon={<FolderKanban size={17} />} label="Projects" active={location === '/projects'} count={projects?.length} />
            <NavItem href="/tasks" icon={<ClipboardList size={17} />} label="Tasks" active={location === '/tasks'} />
          </nav>
          <div className="mt-10 px-3 text-[10px] font-semibold uppercase tracking-[.18em] text-[#91aaa1]">Team</div>
          <div className="mt-4 flex items-center gap-3 rounded-xl px-3 py-3">
            <div className="grid size-8 place-items-center rounded-full bg-[#d7a978] text-[11px] font-bold text-[#28413d]">FN</div>
            <div className="min-w-0"><div className="text-[12px] font-semibold">Fieldnotes Studio</div><div className="mt-0.5 text-[10px] text-[#a9bbb3]">{members?.length ?? 0} teammates</div></div>
            <ChevronDown className="ml-auto text-[#a9bbb3]" size={14} />
          </div>
          <div className="mt-auto rounded-2xl border border-white/10 bg-white/[.045] p-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold text-[#e6a16a]"><Sparkles size={14} /> A little clarity</div>
            <p className="text-[12px] leading-[1.65] text-[#c0cec7]">Good work moves forward when everyone knows what matters next.</p>
            <div className="mt-4 flex -space-x-2">
              {(members || []).slice(0, 4).map((member, index) => <Avatar key={member.id} name={member.name} index={index} small />)}
              {(!members || members.length === 0) && <div className="text-[10px] text-[#a9bbb3]">Your people, all in one place.</div>}
            </div>
          </div>
        </aside>
        <main className="min-w-0 flex-1">
          <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-border/80 bg-background/90 px-5 backdrop-blur-md md:px-10">
            <div className="flex items-center gap-3">
              <div className="grid size-8 place-items-center rounded-lg bg-[#203d3a] text-[#e7a16b] md:hidden"><Target size={17} /></div>
              <div className="hidden items-center gap-2 text-[11px] text-muted-foreground md:flex"><span>Fieldnotes Studio</span><span className="text-border">/</span><span className="font-medium text-foreground">{currentView === 'overview' ? 'Overview' : currentView === 'projects' ? 'Projects' : 'Tasks'}</span></div>
              <div className="md:hidden font-[Manrope] text-[13px] font-extrabold">fieldnotes</div>
            </div>
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[11px] text-muted-foreground sm:flex"><Command size={13} /> <span>Shared workspace</span></div>
              <a href="https://rzp.io/rzp/TZdRzKl" target="_blank" rel="noopener noreferrer" aria-label="Subscribe (opens in a new tab)" className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#e7a16b] px-3 text-[12px] font-semibold text-[#203d3a] transition hover:bg-[#edb27f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#203d3a] focus-visible:ring-offset-2" data-testid="link-subscribe">Subscribe <ArrowUpRight size={14} aria-hidden="true" /></a>
              <button onClick={() => openTask()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#203d3a] px-3.5 text-[12px] font-semibold text-white transition hover:bg-[#2d514c]" data-testid="button-new-task"><Plus size={15} /> <span className="hidden sm:inline">New task</span></button>
              <div className="grid size-8 place-items-center rounded-full border border-[#d8b08c] bg-[#f2e4d4] text-[10px] font-bold text-[#6c4b34]">AS</div>
            </div>
          </header>
          <div className="mx-auto max-w-[1440px] px-5 pb-12 pt-8 md:px-10 md:pt-10">
            {notice && <div role="status" className="mb-4 flex items-center gap-2 rounded-lg border border-[#b8d2c6] bg-[#e5f0e9] px-3 py-2 text-xs text-[#315e4f]"><Check size={14} />{notice}<button className="ml-auto" onClick={() => setNotice('')} aria-label="Dismiss notification"><X size={14} /></button></div>}
            {currentView === 'overview' && <Overview dashboard={dashboard} projects={projects} tasks={tasks} loading={dashboardLoading || projectsLoading} error={dashboardError || projectsError} retry={() => { void refetchDashboard(); void refetchProjects(); void refetchTasks(); }} openTask={openTask} openProject={openProject} onStatus={setTaskStatus} />}
            {currentView === 'projects' && <ProjectsPage projects={projects} tasks={tasks} loading={projectsLoading} error={projectsError} retry={() => void refetchProjects()} onCreate={() => openProject()} onEdit={openProject} onDelete={removeProject} />}
            {currentView === 'tasks' && <TasksPage tasks={tasks} projects={projects} members={members} loading={tasksLoading} error={tasksError} retry={() => void refetchTasks()} search={search} setSearch={setSearch} status={statusFilter} setStatus={setStatusFilter} project={projectFilter} setProject={setProjectFilter} onCreate={() => openTask()} onEdit={openTask} onDelete={removeTask} onStatus={setTaskStatus} />}
            {currentView === null && <NotFoundView />}
          </div>
        </main>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 flex h-14 border-t border-border bg-card/95 backdrop-blur md:hidden">
        <MobileNav href="/" icon={<LayoutDashboard size={18} />} label="Overview" active={location === '/'} />
        <MobileNav href="/projects" icon={<FolderKanban size={18} />} label="Projects" active={location === '/projects'} />
        <MobileNav href="/tasks" icon={<ClipboardList size={18} />} label="Tasks" active={location === '/tasks'} />
      </div>
      {dialog === 'project' && <ProjectDialog project={editingProject} busy={isMutating} onClose={closeDialog} onSave={saveProject} />}
      {dialog === 'task' && <TaskDialog task={editingTask} projects={projects || []} members={members || []} busy={isMutating} onClose={closeDialog} onSave={saveTask} />}
    </div>
  );
}

function NavItem({ href, icon, label, active, count }: { href: string; icon: ReactNode; label: string; active: boolean; count?: number }) {
  return <Link href={href} data-testid={`link-nav-${label.toLowerCase()}`} className={`flex items-center gap-3 rounded-[10px] px-3 py-[10px] text-[13px] transition-colors ${active ? 'bg-[#34524c] font-semibold text-[#f6f0e4]' : 'text-[#bbcbc3] hover:bg-white/[.06] hover:text-white'}`}>{icon}<span>{label}</span>{count !== undefined && <span className={`ml-auto text-[10px] ${active ? 'text-[#e7a16b]' : 'text-[#91aaa1]'}`}>{count}</span>}</Link>;
}
function MobileNav({ href, icon, label, active }: { href: string; icon: ReactNode; label: string; active: boolean }) {
  return <Link href={href} className={`flex flex-1 flex-col items-center justify-center gap-1 text-[10px] ${active ? 'text-[#315a51]' : 'text-muted-foreground'}`} data-testid={`mobile-nav-${label.toLowerCase()}`}>{icon}<span>{label}</span></Link>;
}
function Avatar({ name, index = 0, small = false }: { name?: string | null; index?: number; small?: boolean }) {
  const colors = ['#e7c9a7', '#d9b9bd', '#bbd0c1', '#c1cbe0', '#dec4a3'];
  return <div title={name || 'Unassigned'} className={`${small ? 'size-7 text-[9px]' : 'size-8 text-[10px]'} grid shrink-0 place-items-center rounded-full border-2 border-card font-bold text-[#344d47]`} style={{ backgroundColor: colors[index % colors.length] }}>{initials(name)}</div>;
}
function SectionTitle({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail: string; action?: ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 text-[10px] font-bold uppercase tracking-[.2em] text-[#a36f4b]">{eyebrow}</div><h1 className="font-[Manrope] text-[29px] font-bold leading-tight tracking-[-.055em] text-[#223d39] md:text-[36px]">{title}</h1><p className="mt-2 text-[13px] text-muted-foreground">{detail}</p></div>{action}</div>;
}
function Overview({ dashboard, projects, tasks, loading, error, retry, openTask, openProject, onStatus }: {
  dashboard?: { activeProjects: number; openTasks: number; completedThisWeek: number; overdueTasks: number; projectProgress: { projectId: number; projectName: string; color: string; totalTasks: number; completedTasks: number; dueDate: string | null }[]; upcomingTasks: Task[] };
  projects?: Project[]; tasks?: Task[]; loading: boolean; error: boolean; retry: () => void; openTask: (task?: Task) => void; openProject: (project?: Project) => void; onStatus: (task: Task, status: string) => void;
}) {
  const active = (projects || []).filter((item) => item.status === 'active');
  const todayLabel = new Intl.DateTimeFormat('en', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date());
  return <div className="rise-in">
    <SectionTitle eyebrow={todayLabel} title="Good work, in motion." detail="A clear view of what your team is moving forward this week." action={<button onClick={() => openProject()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3.5 text-[12px] font-semibold transition hover:bg-muted" data-testid="button-add-project"><Plus size={15} /> New project</button>} />
    {error ? <ErrorState retry={retry} /> : loading ? <DashboardSkeleton /> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<FolderKanban size={16} />} label="Active projects" value={dashboard?.activeProjects ?? active.length} sub="in steady motion" accent="#d99560" />
        <Metric icon={<Activity size={16} />} label="Open tasks" value={dashboard?.openTasks ?? (tasks || []).filter((task) => task.status !== 'done').length} sub="across the workspace" accent="#6d9b8b" />
        <Metric icon={<CheckCheck size={16} />} label="Finished this week" value={dashboard?.completedThisWeek ?? 0} sub="small wins add up" accent="#879ac2" />
        <Metric icon={<AlertCircle size={16} />} label="Past due" value={dashboard?.overdueTasks ?? 0} sub="worth a second look" accent="#d17b72" />
      </div>
      <div className="mt-7 grid gap-5 xl:grid-cols-[1.35fr_.85fr]">
        <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
          <div className="mb-5 flex items-start justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">The big picture</div><h2 className="mt-1.5 font-[Manrope] text-[18px] font-bold tracking-[-.04em]">Project pulse</h2></div><Link href="/projects" className="flex items-center gap-1 text-[11px] font-semibold text-[#537b70] hover:text-[#203d3a]">All projects <ArrowRight size={13} /></Link></div>
          {active.length === 0 ? <EmptyState icon={<FolderKanban size={19} />} title="Your first project starts here" body="Create a project to give your team's work a shared home." action={<button className="text-[12px] font-semibold text-[#527a6e]" onClick={() => openProject()}>Create a project <ArrowRight size={13} className="inline" /></button>} /> :
          <div className="space-y-1">{active.slice(0, 5).map((project, index) => <ProjectPulse key={project.id} project={project} index={index} onClick={() => openProject(project)} />)}</div>}
        </section>
        <section className="overflow-hidden rounded-2xl bg-[#e9dfce] p-5 md:p-6">
          <div className="mb-5 flex items-start justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-[#826a52]">Coming up next</div><h2 className="mt-1.5 font-[Manrope] text-[18px] font-bold tracking-[-.04em] text-[#263c36]">On the horizon</h2></div><div className="grid size-9 place-items-center rounded-xl bg-[#f7f0e4] text-[#916944]"><CalendarDays size={17} /></div></div>
          {dashboard?.upcomingTasks?.length ? <div className="space-y-2">{dashboard.upcomingTasks.slice(0, 4).map((task) => <UpcomingTask task={task} key={task.id} onClick={() => openTask(task)} />)}</div> :
            <div className="flex min-h-[180px] flex-col items-center justify-center text-center"><div className="grid size-11 place-items-center rounded-full bg-[#f7f0e4] text-[#907656]"><Clock3 size={18} /></div><div className="mt-3 text-[13px] font-semibold text-[#344a42]">A little breathing room</div><div className="mt-1 text-[11px] text-[#7f786d]">No upcoming deadlines in the queue.</div></div>}
        </section>
      </div>
      <section className="mt-7">
        <div className="mb-4 flex items-end justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.16em] text-muted-foreground">Keep the momentum</div><h2 className="mt-1 font-[Manrope] text-[18px] font-bold tracking-[-.04em]">Your team's work</h2></div><Link href="/tasks" className="text-[11px] font-semibold text-[#537b70] hover:text-[#203d3a]">See all tasks <ArrowRight className="ml-1 inline" size={13} /></Link></div>
        {(tasks || []).length === 0 ? <EmptyState icon={<ClipboardList size={18} />} title="No tasks on the board" body="Add the next concrete step and give it an owner." action={<button onClick={() => openTask()} className="text-[12px] font-semibold text-[#527a6e]">Create a task <ArrowRight size={13} className="inline" /></button>} /> :
          <div className="overflow-hidden rounded-2xl border border-border bg-card">{(tasks || []).slice(0, 5).map((task) => <TaskRow key={task.id} task={task} onEdit={() => openTask(task)} compact onStatus={onStatus} />)}</div>}
      </section>
    </>}
  </div>;
}
function Metric({ icon, label, value, sub, accent }: { icon: ReactNode; label: string; value: number; sub: string; accent: string }) {
  return <div className="rounded-2xl border border-border bg-card p-4 transition-transform duration-200 hover:-translate-y-0.5 md:p-5"><div className="flex items-center justify-between"><div className="text-[11px] font-medium text-muted-foreground">{label}</div><div className="grid size-8 place-items-center rounded-[10px]" style={{ backgroundColor: `${accent}24`, color: accent }}>{icon}</div></div><div className="mt-3 font-[Manrope] text-[30px] font-bold tracking-[-.06em] text-[#243e39]">{value}</div><div className="mt-1 text-[10px] text-muted-foreground">{sub}</div></div>;
}
function ProjectPulse({ project, index, onClick }: { project: Project; index: number; onClick: () => void }) {
  const percent = progress(project);
  return <button onClick={onClick} className="group flex w-full items-center gap-4 rounded-xl px-2 py-3 text-left transition hover:bg-[#f5f1e8]" data-testid={`button-project-pulse-${project.id}`}>
    <div className="grid size-9 shrink-0 place-items-center rounded-[11px] text-[11px] font-bold text-white" style={{ background: project.color || projectColors[index % projectColors.length] }}>{project.name.slice(0, 1).toUpperCase()}</div>
    <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><span className="truncate text-[12px] font-semibold text-[#2e4640]">{project.name}</span><span className="font-mono text-[10px] text-muted-foreground">{percent}%</span></div><div className="mt-2 h-[5px] overflow-hidden rounded-full bg-[#e9e7df]"><div className="h-full rounded-full transition-all" style={{ width: `${percent}%`, backgroundColor: project.color || '#73998d' }} /></div><div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground"><span>{project.completedTaskCount} of {project.taskCount} tasks</span><span>{project.dueDate ? `Due ${dateLabel(project.dueDate, true)}` : 'No deadline'}</span></div></div>
    <ArrowUpRight size={15} className="text-[#a6aaa0] opacity-0 transition group-hover:opacity-100" />
  </button>;
}
function UpcomingTask({ task, onClick }: { task: Task; onClick: () => void }) {
  return <button onClick={onClick} className="flex w-full items-center gap-3 rounded-xl border border-[#d8cbb7] bg-[#f4eddf]/70 p-3 text-left transition hover:bg-[#f8f2e8]" data-testid={`button-upcoming-task-${task.id}`}>
    <div className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#fff9ed] text-[#8b7456]"><CalendarDays size={15} /></div>
    <div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold text-[#344a42]">{task.title}</div><div className="mt-1 truncate text-[10px] text-[#82796b]">{task.projectName} · {task.assigneeName || 'Unassigned'}</div></div>
    <div className="shrink-0 text-right"><div className={`text-[10px] font-semibold ${isLate(task.dueDate) ? 'text-[#b75d54]' : 'text-[#766e60]'}`}>{dateLabel(task.dueDate, true)}</div><PriorityMark priority={task.priority} /></div>
  </button>;
}

function ProjectsPage({ projects, tasks, loading, error, retry, onCreate, onEdit, onDelete }: {
  projects?: Project[]; tasks?: Task[]; loading: boolean; error: boolean; retry: () => void; onCreate: () => void; onEdit: (project?: Project) => void; onDelete: (project: Project) => void;
}) {
  const [filter, setFilter] = useState('all');
  const filtered = (projects || []).filter((project) => filter === 'all' || project.status === filter);
  return <div className="rise-in">
    <SectionTitle eyebrow="Shared direction" title="Projects" detail={`${projects?.length || 0} projects shaping the work ahead.`} action={<button onClick={onCreate} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#203d3a] px-4 text-[12px] font-semibold text-white transition hover:bg-[#2d514c]" data-testid="button-create-project"><Plus size={15} /> Create project</button>} />
    <div className="mb-5 flex flex-wrap items-center gap-2">{[['all', 'All projects'], ['active', 'Active'], ['on-hold', 'On hold'], ['completed', 'Completed']].map(([value, label]) => <button key={value} onClick={() => setFilter(value)} className={`rounded-full px-3.5 py-2 text-[11px] font-semibold transition ${filter === value ? 'bg-[#274640] text-white' : 'border border-border bg-card text-muted-foreground hover:text-foreground'}`} data-testid={`filter-projects-${value}`}>{label}</button>)}</div>
    {error ? <ErrorState retry={retry} /> : loading ? <ProjectSkeleton /> : filtered.length === 0 ? <EmptyState icon={<FolderKanban size={19} />} title="No projects in this view" body={filter === 'all' ? 'Start with one shared outcome your team is working toward.' : `There are no ${statusLabel(filter).toLowerCase()} projects right now.`} action={<button onClick={onCreate} className="text-[12px] font-semibold text-[#527a6e]">Create project <ArrowRight size={13} className="inline" /></button>} /> :
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{filtered.map((project, index) => <ProjectCard project={project} index={index} key={project.id} onEdit={() => onEdit(project)} onDelete={() => onDelete(project)} />)}</div>}
    <div className="mt-8 flex items-center gap-2 text-[10px] text-muted-foreground"><Users size={13} /> Projects are shared across your whole team.</div>
  </div>;
}
function ProjectCard({ project, index, onEdit, onDelete }: { project: Project; index: number; onEdit: () => void; onDelete: () => void }) {
  const [menu, setMenu] = useState(false);
  const percent = progress(project);
  return <article className="group rounded-2xl border border-border bg-card p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_28px_rgba(47,63,54,.07)]" data-testid={`card-project-${project.id}`}>
    <div className="mb-5 flex items-start justify-between"><div className="grid size-11 place-items-center rounded-[13px] text-sm font-bold text-white" style={{ background: project.color || projectColors[index % projectColors.length] }}>{project.name.slice(0, 1).toUpperCase()}</div><div className="relative"><button onClick={() => setMenu(!menu)} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label={`More actions for ${project.name}`} data-testid={`button-project-menu-${project.id}`}><MoreHorizontal size={17} /></button>{menu && <div className="absolute right-0 top-9 z-10 w-36 rounded-xl border border-border bg-card p-1 shadow-lg"><button onClick={() => { setMenu(false); onEdit(); }} className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-muted">Edit project</button><button onClick={() => { setMenu(false); onDelete(); }} className="w-full rounded-lg px-3 py-2 text-left text-xs text-[#b45b53] hover:bg-[#f8e9e5]">Delete project</button></div>}</div></div>
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="font-[Manrope] text-[16px] font-bold tracking-[-.035em] text-[#29413b]">{project.name}</h3><p className="mt-1.5 line-clamp-2 min-h-[36px] text-[11px] leading-[1.6] text-muted-foreground">{project.description || 'A shared focus for the team.'}</p></div><StatusPill status={project.status} /></div>
    <div className="mt-5"><div className="mb-2 flex items-center justify-between text-[10px]"><span className="text-muted-foreground">Project progress</span><span className="font-mono font-medium text-[#435e55]">{percent}%</span></div><div className="h-[6px] overflow-hidden rounded-full bg-[#eceae2]"><div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: project.color || projectColors[index % projectColors.length] }} /></div></div>
    <div className="mt-4 flex items-center justify-between border-t border-border/70 pt-4"><div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><CheckCheck size={13} /> {project.completedTaskCount}/{project.taskCount} tasks</div><div className={`flex items-center gap-1.5 text-[10px] ${isLate(project.dueDate) ? 'text-[#b75d54]' : 'text-muted-foreground'}`}><CalendarDays size={12} />{dateLabel(project.dueDate, true)}</div></div>
  </article>;
}

function TasksPage({ tasks, projects, members, loading, error, retry, search, setSearch, status, setStatus, project, setProject, onCreate, onEdit, onDelete, onStatus }: {
  tasks?: Task[]; projects?: Project[]; members?: Member[]; loading: boolean; error: boolean; retry: () => void; search: string; setSearch: (value: string) => void; status: string; setStatus: (value: string) => void; project: string; setProject: (value: string) => void; onCreate: () => void; onEdit: (task?: Task) => void; onDelete: (task: Task) => void; onStatus: (task: Task, status: string) => void;
}) {
  const [priority, setPriority] = useState('');
  const filteredTasks = (tasks || []).filter((task) => !priority || task.priority === priority);
  const groups = taskStatuses.map((value) => ({ status: value, tasks: filteredTasks.filter((task) => task.status === value) }));
  return <div className="rise-in">
    <SectionTitle eyebrow="Details make progress" title="Tasks" detail="Find the next step, see who's on it, and keep the handoffs clear." action={<button onClick={onCreate} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#203d3a] px-4 text-[12px] font-semibold text-white transition hover:bg-[#2d514c]" data-testid="button-create-task"><Plus size={15} /> Add a task</button>} />
    <div className="mb-5 flex flex-col gap-2 rounded-2xl border border-border bg-card p-3 sm:flex-row sm:items-center">
      <label className="relative min-w-0 flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tasks or project names…" className="h-10 w-full rounded-xl bg-[#f5f3ec] pl-9 pr-3 text-[12px] outline-none placeholder:text-[#9b9a8e] focus:ring-2 focus:ring-[#9bb8ab]/50" data-testid="input-search-tasks" /></label>
      <div className="flex flex-wrap gap-2">
        <label className="relative"><SlidersHorizontal size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 appearance-none rounded-xl border border-border bg-card pl-8 pr-8 text-[11px] font-medium outline-none focus:ring-2 focus:ring-[#9bb8ab]/50" data-testid="select-task-status"><option value="">Any status</option>{taskStatuses.map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select><ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" /></label>
        <label className="relative"><FolderKanban size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><select value={project} onChange={(event) => setProject(event.target.value)} className="h-10 max-w-[170px] appearance-none rounded-xl border border-border bg-card pl-8 pr-8 text-[11px] font-medium outline-none focus:ring-2 focus:ring-[#9bb8ab]/50" data-testid="select-task-project"><option value="">All projects</option>{(projects || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" /></label>
        <label className="relative"><ListFilter size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><select value={priority} onChange={(event) => setPriority(event.target.value)} className="h-10 appearance-none rounded-xl border border-border bg-card pl-8 pr-8 text-[11px] font-medium outline-none focus:ring-2 focus:ring-[#9bb8ab]/50" data-testid="select-task-priority"><option value="">Any priority</option>{['urgent', 'high', 'medium', 'low'].map((s) => <option key={s} value={s}>{statusLabel(s)}</option>)}</select><ChevronDown size={12} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" /></label>
      </div>
    </div>
    {error ? <ErrorState retry={retry} /> : loading ? <TaskSkeleton /> : filteredTasks.length === 0 ? <EmptyState icon={<Search size={19} />} title={(tasks || []).length === 0 ? 'Nothing on the list yet' : 'No tasks match those filters'} body={(tasks || []).length === 0 ? 'Create a task to turn your next idea into a clear action.' : 'Try another search or clear a filter to see more work.'} action={<button onClick={(tasks || []).length === 0 ? onCreate : () => { setSearch(''); setStatus(''); setProject(''); setPriority(''); }} className="text-[12px] font-semibold text-[#527a6e]">{(tasks || []).length === 0 ? 'Create your first task' : 'Clear filters'} <ArrowRight size={13} className="inline" /></button>} /> :
      <div className="space-y-5">{groups.filter((group) => !status || group.status === status).map((group) => <section key={group.status} className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-2.5 border-b border-border/80 px-4 py-3.5"><StatusDot status={group.status} /><h2 className="text-[12px] font-bold">{statusLabel(group.status)}</h2><span className="grid min-w-5 place-items-center rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{group.tasks.length}</span></div>
        {group.tasks.length ? group.tasks.map((task) => <TaskRow key={task.id} task={task} onEdit={() => onEdit(task)} onDelete={() => onDelete(task)} members={members} onStatus={onStatus} />) : <div className="px-5 py-4 text-[11px] text-muted-foreground">Nothing waiting here.</div>}
      </section>)}</div>}
  </div>;
}
function TaskRow({ task, onEdit, onDelete, compact, members, onStatus }: { task: Task; onEdit: () => void; onDelete?: () => void; compact?: boolean; members?: Member[]; onStatus?: (task: Task, status: string) => void }) {
  const [menu, setMenu] = useState(false);
  const memberIndex = members?.findIndex((member) => member.name === task.assigneeName) ?? 0;
  return <div className={`group flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/70 px-4 py-3 last:border-b-0 ${compact ? '' : 'hover:bg-[#faf8f1]'}`} data-testid={`row-task-${task.id}`}>
    <button onClick={() => onStatus?.(task, task.status === 'done' ? 'todo' : 'done')} disabled={!onStatus} aria-label={task.status === 'done' ? 'Reopen task' : 'Complete task'} className={`grid size-5 shrink-0 place-items-center rounded-full border ${task.status === 'done' ? 'border-[#648e7e] bg-[#648e7e] text-white' : 'border-[#c8c9bc] text-transparent hover:border-[#648e7e]'} disabled:cursor-default`} data-testid={`button-complete-task-${task.id}`}><Check size={12} /></button>
    <button onClick={onEdit} className="min-w-[150px] flex-1 text-left" data-testid={`button-edit-task-${task.id}`}><div className={`text-[12px] font-semibold ${task.status === 'done' ? 'text-muted-foreground line-through' : 'text-[#2e4640]'}`}>{task.title}</div>{!compact && task.description && <div className="mt-1 max-w-[520px] truncate text-[10px] text-muted-foreground">{task.description}</div>}</button>
    <div className="flex min-w-[115px] items-center gap-1.5 text-[10px] text-muted-foreground"><span className="size-2 rounded-[3px]" style={{ backgroundColor: taskColor(task.projectId) }} />{task.projectName}</div>
    <PriorityMark priority={task.priority} />
    {!compact && <div className={`flex min-w-[74px] items-center gap-1 text-[10px] ${isLate(task.dueDate) && task.status !== 'done' ? 'text-[#b75d54]' : 'text-muted-foreground'}`}><CalendarDays size={12} />{dateLabel(task.dueDate, true)}</div>}
    <div className="flex min-w-[100px] items-center gap-2"><Avatar name={task.assigneeName} index={memberIndex < 0 ? 0 : memberIndex} small /><span className="max-w-[80px] truncate text-[10px] text-muted-foreground">{task.assigneeName || 'Unassigned'}</span></div>
    {!compact && <div className="relative ml-auto"><button onClick={() => setMenu(!menu)} className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100" aria-label={`More actions for ${task.title}`} data-testid={`button-task-actions-${task.id}`}><MoreHorizontal size={15} /></button>{menu && <div className="absolute right-0 top-8 z-10 w-36 rounded-xl border border-border bg-card p-1 shadow-lg"><button onClick={() => { setMenu(false); onEdit(); }} className="w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-muted">Edit task</button>{onDelete && <button onClick={() => { setMenu(false); onDelete(); }} className="w-full rounded-lg px-3 py-2 text-left text-xs text-[#b45b53] hover:bg-[#f8e9e5]">Delete task</button>}</div>}</div>}
  </div>;
}
function taskColor(id: number) { return projectColors[Math.abs(id) % projectColors.length]; }
function PriorityMark({ priority }: { priority: string }) {
  const config: Record<string, { color: string; icon: ReactNode }> = {
    urgent: { color: '#b75d54', icon: <ArrowUpRight size={12} /> },
    high: { color: '#ce8256', icon: <ArrowUpRight size={12} /> },
    medium: { color: '#8d805d', icon: <ArrowRight size={12} /> },
    low: { color: '#779285', icon: <ArrowDown size={12} /> },
  };
  const item = config[priority] || config.medium;
  return <div title={`${statusLabel(priority)} priority`} className="flex min-w-[62px] items-center gap-1 text-[9px] font-medium capitalize" style={{ color: item.color }}>{item.icon}{priority}</div>;
}
function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = { todo: '#a5a69c', 'in-progress': '#d48a54', review: '#8095bb', done: '#64917d' };
  return status === 'done' ? <CheckCheck size={14} style={{ color: colors[status] }} /> : status === 'in-progress' ? <LoaderCircle size={14} style={{ color: colors[status] }} /> : <Circle size={13} style={{ color: colors[status] }} />;
}
function StatusPill({ status }: { status: string }) {
  const palette: Record<string, string> = { active: 'bg-[#e6f0e8] text-[#50785f]', 'on-hold': 'bg-[#f4ead8] text-[#8b7042]', completed: 'bg-[#e8eaf2] text-[#666f91]' };
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[9px] font-semibold capitalize ${palette[status] || 'bg-muted text-muted-foreground'}`}>{statusLabel(status)}</span>;
}
function statusLabel(value: string) { return value.replaceAll('-', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }

function DialogFrame({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#1e302d]/55 p-0 backdrop-blur-[3px] sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" className="max-h-[94dvh] w-full max-w-[520px] overflow-y-auto rounded-t-[22px] border border-border bg-card p-5 shadow-[0_24px_80px_rgba(24,46,40,.22)] sm:rounded-[22px] sm:p-7">
      <div className="mb-6 flex items-start justify-between"><div><div className="text-[10px] font-bold uppercase tracking-[.19em] text-[#a36f4b]">Fieldnotes workspace</div><h2 className="mt-2 font-[Manrope] text-[22px] font-bold tracking-[-.05em]">{title}</h2><p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p></div><button onClick={onClose} className="grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted" aria-label="Close dialog"><X size={17} /></button></div>
      {children}
    </div>
  </div>;
}
function ProjectDialog({ project, busy, onClose, onSave }: { project: Project | null; busy: boolean; onClose: () => void; onSave: (draft: ProjectDraft) => void }) {
  const [draft, setDraft] = useState<ProjectDraft>(() => ({ name: project?.name || '', description: project?.description || '', color: project?.color || projectColors[0], status: project?.status || 'active', dueDate: project?.dueDate?.slice(0, 10) || '' }));
  const update = (key: keyof ProjectDraft, value: string) => setDraft((state) => ({ ...state, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); if (draft.name.trim()) onSave({ ...draft, name: draft.name.trim() }); };
  return <DialogFrame title={project ? 'Edit project' : 'Start a project'} subtitle="Give the team a shared outcome to move toward." onClose={onClose}>
    <form onSubmit={submit} className="space-y-4">
      <Field label="Project name"><input autoFocus required value={draft.name} onChange={(event) => update('name', event.target.value)} placeholder="e.g. Customer onboarding refresh" className="form-control" data-testid="input-project-name" /></Field>
      <Field label="A little context"><textarea value={draft.description} onChange={(event) => update('description', event.target.value)} placeholder="What does a good outcome look like?" rows={3} className="form-control resize-none" data-testid="input-project-description" /></Field>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Status"><select value={draft.status} onChange={(event) => update('status', event.target.value)} className="form-control" data-testid="select-project-status"><option value="active">Active</option><option value="on-hold">On hold</option><option value="completed">Completed</option></select></Field><Field label="Target date"><input type="date" value={draft.dueDate} onChange={(event) => update('dueDate', event.target.value)} className="form-control" data-testid="input-project-due-date" /></Field></div>
      <Field label="Project marker"><div className="flex gap-2">{projectColors.map((color) => <button type="button" key={color} onClick={() => update('color', color)} className={`grid size-8 place-items-center rounded-full ${draft.color === color ? 'ring-2 ring-[#355d51] ring-offset-2' : ''}`} style={{ backgroundColor: color }} aria-label={`Choose ${color} project color`} data-testid={`button-project-color-${color.slice(1)}`}>{draft.color === color && <Check size={14} className="text-white" />}</button>)}</div></Field>
      <div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" onClick={onClose} className="h-10 rounded-lg px-4 text-[12px] font-semibold text-muted-foreground hover:bg-muted">Cancel</button><button disabled={busy || !draft.name.trim()} type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#203d3a] px-4 text-[12px] font-semibold text-white disabled:opacity-50" data-testid="button-save-project">{busy && <LoaderCircle className="animate-spin" size={14} />}{project ? 'Save changes' : 'Create project'}</button></div>
    </form>
  </DialogFrame>;
}
function TaskDialog({ task, projects, members, busy, onClose, onSave }: { task: Task | null; projects: Project[]; members: Member[]; busy: boolean; onClose: () => void; onSave: (draft: TaskDraft) => void }) {
  const [draft, setDraft] = useState<TaskDraft>(() => ({ projectId: task?.projectId ? String(task.projectId) : String(projects[0]?.id || ''), title: task?.title || '', description: task?.description || '', status: task?.status || 'todo', priority: task?.priority || 'medium', dueDate: task?.dueDate?.slice(0, 10) || '', assigneeId: task?.assigneeId ? String(task.assigneeId) : '' }));
  const update = (key: keyof TaskDraft, value: string) => setDraft((state) => ({ ...state, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); if (draft.title.trim() && draft.projectId) onSave({ ...draft, title: draft.title.trim() }); };
  return <DialogFrame title={task ? 'Edit task' : 'Make the next move'} subtitle="Keep the handoff clear: one action, one owner, one date." onClose={onClose}>
    {!projects.length ? <EmptyState icon={<FolderKanban size={18} />} title="A project comes first" body="Create a project before adding work to the workspace." action={<button onClick={onClose} className="text-[12px] font-semibold text-[#527a6e]">Got it</button>} /> : <form onSubmit={submit} className="space-y-4">
      <Field label="Task title"><input autoFocus required value={draft.title} onChange={(event) => update('title', event.target.value)} placeholder="What needs to happen next?" className="form-control" data-testid="input-task-title" /></Field>
      <Field label="Details"><textarea value={draft.description} onChange={(event) => update('description', event.target.value)} placeholder="Add useful context for whoever picks this up." rows={3} className="form-control resize-none" data-testid="input-task-description" /></Field>
      <Field label="Project"><select required value={draft.projectId} onChange={(event) => update('projectId', event.target.value)} className="form-control" data-testid="select-task-project-dialog">{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Status"><select value={draft.status} onChange={(event) => update('status', event.target.value)} className="form-control" data-testid="select-task-status-dialog">{taskStatuses.map((s) => <option value={s} key={s}>{statusLabel(s)}</option>)}</select></Field><Field label="Priority"><select value={draft.priority} onChange={(event) => update('priority', event.target.value)} className="form-control" data-testid="select-task-priority-dialog">{['low', 'medium', 'high', 'urgent'].map((s) => <option value={s} key={s}>{statusLabel(s)}</option>)}</select></Field></div>
      <div className="grid gap-3 sm:grid-cols-2"><Field label="Owner"><select value={draft.assigneeId} onChange={(event) => update('assigneeId', event.target.value)} className="form-control" data-testid="select-task-assignee"><option value="">Unassigned</option>{members.map((member) => <option value={member.id} key={member.id}>{member.name}</option>)}</select></Field><Field label="Due date"><input type="date" value={draft.dueDate} onChange={(event) => update('dueDate', event.target.value)} className="form-control" data-testid="input-task-due-date" /></Field></div>
      <div className="flex justify-end gap-2 border-t border-border pt-4"><button type="button" onClick={onClose} className="h-10 rounded-lg px-4 text-[12px] font-semibold text-muted-foreground hover:bg-muted">Cancel</button><button disabled={busy || !draft.title.trim()} type="submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#203d3a] px-4 text-[12px] font-semibold text-white disabled:opacity-50" data-testid="button-save-task">{busy && <LoaderCircle className="animate-spin" size={14} />}{task ? 'Save changes' : 'Create task'}</button></div>
    </form>}
  </DialogFrame>;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="block"><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-[.1em] text-[#68756d]">{label}</span>{children}</label>; }
function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body: string; action?: ReactNode }) {
  return <div className="flex min-h-[210px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#d8d5c9] bg-card/70 px-6 py-8 text-center"><div className="grid size-10 place-items-center rounded-xl bg-[#e9efe7] text-[#638477]">{icon}</div><h3 className="mt-3 text-[13px] font-semibold text-[#334a42]">{title}</h3><p className="mt-1 max-w-[290px] text-[11px] leading-relaxed text-muted-foreground">{body}</p>{action && <div className="mt-3">{action}</div>}</div>;
}
function ErrorState({ retry }: { retry: () => void }) {
  return <div className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-[#e3c8bd] bg-[#f8eeea] p-6 text-center"><div className="grid size-10 place-items-center rounded-xl bg-[#f1dbd1] text-[#ae6553]"><AlertCircle size={18} /></div><h3 className="mt-3 text-[13px] font-semibold text-[#593e35]">That didn't come through</h3><p className="mt-1 text-[11px] text-[#886f64]">The workspace couldn't load this view. Check your connection and try again.</p><button onClick={retry} className="mt-4 rounded-lg bg-[#6c5145] px-4 py-2 text-[11px] font-semibold text-white" data-testid="button-retry">Try again</button></div>;
}
function NotFoundView() {
  return <div className="flex min-h-[60vh] flex-col items-center justify-center text-center"><div className="font-mono text-[11px] tracking-[.2em] text-[#a36f4b]">404 · OFF THE MAP</div><h1 className="mt-3 font-[Manrope] text-3xl font-bold tracking-[-.06em]">This page isn't on the board.</h1><p className="mt-2 text-sm text-muted-foreground">The link may have moved. Head back to your team's overview.</p><Link href="/" className="mt-5 rounded-lg bg-[#203d3a] px-4 py-2.5 text-xs font-semibold text-white">Back to overview</Link></div>;
}
function DashboardSkeleton() {
  return <div className="animate-pulse"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[1, 2, 3, 4].map((n) => <div key={n} className="h-[130px] rounded-2xl bg-[#e9e5d9]" />)}</div><div className="mt-7 grid gap-5 xl:grid-cols-2"><div className="h-[330px] rounded-2xl bg-[#e9e5d9]" /><div className="h-[330px] rounded-2xl bg-[#e9e5d9]" /></div></div>;
}
function ProjectSkeleton() { return <div className="grid animate-pulse gap-4 md:grid-cols-2 xl:grid-cols-3">{[1, 2, 3].map((n) => <div key={n} className="h-[250px] rounded-2xl bg-[#e9e5d9]" />)}</div>; }
function TaskSkeleton() { return <div className="animate-pulse space-y-4">{[1, 2, 3].map((n) => <div key={n} className="h-[130px] rounded-2xl bg-[#e9e5d9]" />)}</div>; }

export default App;
