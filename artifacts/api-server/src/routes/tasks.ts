import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  CreateTaskBody,
  CreateTaskResponse,
  DeleteTaskParams,
  GetTasksResponse,
  UpdateTaskBody,
  UpdateTaskParams,
  UpdateTaskResponse,
} from "@workspace/api-zod";
import { db, membersTable, projectsTable, tasksTable } from "@workspace/db";
import { getTaskCard, listTaskCards, parseTaskFilters } from "../lib/workspace-data";

const router: IRouter = Router();

function toDateOnly(value: Date | null | undefined): string | null | undefined {
  return value == null ? value : value.toISOString().slice(0, 10);
}

async function projectExists(projectId: number): Promise<boolean> {
  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  return Boolean(project);
}

async function memberExists(memberId: number): Promise<boolean> {
  const [member] = await db
    .select({ id: membersTable.id })
    .from(membersTable)
    .where(eq(membersTable.id, memberId));
  return Boolean(member);
}

router.get("/tasks", async (req, res): Promise<void> => {
  const parsed = parseTaskFilters(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const tasks = await listTaskCards(parsed.data);
  res.json(GetTasksResponse.parse(tasks));
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!(await projectExists(parsed.data.projectId))) {
    res.status(400).json({ error: "Choose an existing project" });
    return;
  }
  if (
    parsed.data.assigneeId != null &&
    !(await memberExists(parsed.data.assigneeId))
  ) {
    res.status(400).json({ error: "Choose an existing team member" });
    return;
  }

  const [created] = await db
    .insert(tasksTable)
    .values({
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description,
      status: parsed.data.status,
      priority: parsed.data.priority,
      dueDate: toDateOnly(parsed.data.dueDate) ?? null,
      assigneeId: parsed.data.assigneeId ?? null,
      completedAt: parsed.data.status === "done" ? new Date() : null,
    })
    .returning({ id: tasksTable.id });

  const task = await getTaskCard(created.id);
  if (!task) {
    res.status(500).json({ error: "Task was created but could not be loaded" });
    return;
  }
  res.status(201).json(CreateTaskResponse.parse(task));
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (
    parsed.data.projectId !== undefined &&
    !(await projectExists(parsed.data.projectId))
  ) {
    res.status(400).json({ error: "Choose an existing project" });
    return;
  }
  if (
    parsed.data.assigneeId != null &&
    !(await memberExists(parsed.data.assigneeId))
  ) {
    res.status(400).json({ error: "Choose an existing team member" });
    return;
  }

  const updates: {
    projectId?: number;
    title?: string;
    description?: string;
    status?: "todo" | "in-progress" | "review" | "done";
    priority?: "low" | "medium" | "high" | "urgent";
    dueDate?: string | null;
    assigneeId?: number | null;
    updatedAt: Date;
    completedAt?: Date | null;
  } = { updatedAt: new Date() };

  for (const field of ["projectId", "title", "description", "status", "priority", "assigneeId"] as const) {
    const value = parsed.data[field];
    if (value !== undefined) {
      Object.assign(updates, { [field]: value });
    }
  }
  if (parsed.data.dueDate !== undefined) {
    updates.dueDate = toDateOnly(parsed.data.dueDate);
  }
  if (parsed.data.status !== undefined) {
    updates.completedAt =
      parsed.data.status === "done" ? new Date() : null;
  }

  const [updated] = await db
    .update(tasksTable)
    .set(updates)
    .where(eq(tasksTable.id, params.data.id))
    .returning({ id: tasksTable.id });

  if (!updated) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  const task = await getTaskCard(updated.id);
  res.json(UpdateTaskResponse.parse(task));
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(tasksTable)
    .where(eq(tasksTable.id, params.data.id))
    .returning({ id: tasksTable.id });
  if (!deleted) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
