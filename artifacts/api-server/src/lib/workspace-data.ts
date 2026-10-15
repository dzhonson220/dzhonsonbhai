import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db, membersTable, projectsTable, tasksTable } from "@workspace/db";
import {
  GetProjectsResponseItem,
  GetTasksQueryParams,
  GetTasksResponseItem,
} from "@workspace/api-zod";

type TaskFilters = {
  id?: number;
  projectId?: number;
  status?: "todo" | "in-progress" | "review" | "done";
  assigneeId?: number;
  search?: string;
};

export async function listProjectCards() {
  const rows = await db
    .select({
      id: projectsTable.id,
      name: projectsTable.name,
      description: projectsTable.description,
      color: projectsTable.color,
      status: projectsTable.status,
      dueDate: projectsTable.dueDate,
      createdAt: projectsTable.createdAt,
      taskCount: sql<number>`count(${tasksTable.id})::int`,
      completedTaskCount: sql<number>`count(*) filter (where ${tasksTable.status} = 'done')::int`,
    })
    .from(projectsTable)
    .leftJoin(tasksTable, eq(tasksTable.projectId, projectsTable.id))
    .groupBy(projectsTable.id)
    .orderBy(desc(projectsTable.createdAt));

  return rows.map((project) => GetProjectsResponseItem.parse(project));
}

export async function listTaskCards(filters: TaskFilters = {}) {
  const conditions = [];
  if (filters.id !== undefined) {
    conditions.push(eq(tasksTable.id, filters.id));
  }
  if (filters.projectId !== undefined) {
    conditions.push(eq(tasksTable.projectId, filters.projectId));
  }
  if (filters.status !== undefined) {
    conditions.push(eq(tasksTable.status, filters.status));
  }
  if (filters.assigneeId !== undefined) {
    conditions.push(eq(tasksTable.assigneeId, filters.assigneeId));
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(
        ilike(tasksTable.title, term),
        ilike(tasksTable.description, term),
        ilike(projectsTable.name, term),
      )!,
    );
  }

  const rows = await db
    .select({
      id: tasksTable.id,
      projectId: tasksTable.projectId,
      title: tasksTable.title,
      description: tasksTable.description,
      status: tasksTable.status,
      priority: tasksTable.priority,
      dueDate: tasksTable.dueDate,
      assigneeId: tasksTable.assigneeId,
      createdAt: tasksTable.createdAt,
      updatedAt: tasksTable.updatedAt,
      projectName: projectsTable.name,
      assigneeName: membersTable.name,
    })
    .from(tasksTable)
    .innerJoin(projectsTable, eq(tasksTable.projectId, projectsTable.id))
    .leftJoin(membersTable, eq(tasksTable.assigneeId, membersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(tasksTable.dueDate), desc(tasksTable.updatedAt));

  return rows.map((task) => GetTasksResponseItem.parse(task));
}

export async function getTaskCard(id: number) {
  const [task] = await listTaskCards({ id });
  return task ?? null;
}

export function parseTaskFilters(query: unknown) {
  return GetTasksQueryParams.safeParse(query);
}
