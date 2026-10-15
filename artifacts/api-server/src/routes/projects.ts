import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  CreateProjectBody,
  CreateProjectResponse,
  DeleteProjectParams,
  GetProjectsResponse,
  UpdateProjectBody,
  UpdateProjectParams,
  UpdateProjectResponse,
} from "@workspace/api-zod";
import { db, projectsTable } from "@workspace/db";
import { listProjectCards } from "../lib/workspace-data";

const router: IRouter = Router();

function toDateOnly(value: Date | null | undefined): string | null | undefined {
  return value == null ? value : value.toISOString().slice(0, 10);
}

router.get("/projects", async (_req, res): Promise<void> => {
  const projects = await listProjectCards();
  res.json(GetProjectsResponse.parse(projects));
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [created] = await db
    .insert(projectsTable)
    .values({
      ...parsed.data,
      dueDate: toDateOnly(parsed.data.dueDate),
    })
    .returning();

  const project = (await listProjectCards()).find((item) => item.id === created.id);
  if (!project) {
    res.status(500).json({ error: "Project was created but could not be loaded" });
    return;
  }

  res.status(201).json(CreateProjectResponse.parse(project));
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const params = UpdateProjectParams.safeParse(req.params);
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: {
    name?: string;
    description?: string;
    color?: string;
    status?: "active" | "on-hold" | "completed";
    dueDate?: string | null;
  } = {
    name: parsed.data.name,
    description: parsed.data.description,
    color: parsed.data.color,
    status: parsed.data.status,
  };
  if (parsed.data.dueDate !== undefined) {
    updates.dueDate = toDateOnly(parsed.data.dueDate);
  }

  const [updated] = await db
    .update(projectsTable)
    .set(updates)
    .where(eq(projectsTable.id, params.data.id))
    .returning({ id: projectsTable.id });

  if (!updated) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const project = (await listProjectCards()).find((item) => item.id === updated.id);
  res.json(UpdateProjectResponse.parse(project));
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const params = DeleteProjectParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [deleted] = await db
    .delete(projectsTable)
    .where(eq(projectsTable.id, params.data.id))
    .returning({ id: projectsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
