import { Router, type IRouter } from "express";
import { and, eq, gte } from "drizzle-orm";
import { GetDashboardResponse } from "@workspace/api-zod";
import { db, tasksTable } from "@workspace/db";
import { listProjectCards, listTaskCards } from "../lib/workspace-data";

const router: IRouter = Router();

router.get("/dashboard", async (_req, res): Promise<void> => {
  const [projects, tasks, completionRows] = await Promise.all([
    listProjectCards(),
    listTaskCards(),
    db
      .select({ completedAt: tasksTable.completedAt })
      .from(tasksTable)
      .where(
        and(
          eq(tasksTable.status, "done"),
          gte(tasksTable.completedAt, startOfWeek()),
        ),
      ),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);
  const weekAheadDate = weekAhead.toISOString().slice(0, 10);
  const openTasks = tasks.filter((task) => task.status !== "done");
  const overdueTasks = openTasks.filter(
    (task) => task.dueDate && task.dueDate.toISOString().slice(0, 10) < today,
  );
  const upcomingTasks = tasks
    .filter((task) => {
      if (!task.dueDate || task.status === "done") return false;
      const dueDate = task.dueDate.toISOString().slice(0, 10);
      return dueDate >= today && dueDate <= weekAheadDate;
    })
    .slice(0, 6);

  const summary = GetDashboardResponse.parse({
    activeProjects: projects.filter((project) => project.status === "active").length,
    openTasks: openTasks.length,
    completedThisWeek: completionRows.length,
    overdueTasks: overdueTasks.length,
    projectProgress: projects.map((project) => ({
      projectId: project.id,
      projectName: project.name,
      color: project.color,
      totalTasks: project.taskCount,
      completedTasks: project.completedTaskCount,
      dueDate: project.dueDate,
    })),
    upcomingTasks,
  });

  res.json(summary);
});

function startOfWeek(): Date {
  const date = new Date();
  const daysSinceMonday = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - daysSinceMonday);
  date.setHours(0, 0, 0, 0);
  return date;
}

export default router;
