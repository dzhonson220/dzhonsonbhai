import { createInsertSchema } from "drizzle-zod";
import { date, pgEnum, pgTable, serial, text, timestamp, varchar } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const projectStatusEnum = pgEnum("project_status", [
  "active",
  "on-hold",
  "completed",
]);

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  description: text("description").notNull().default(""),
  color: varchar("color", { length: 16 }).notNull().default("#6277f5"),
  status: projectStatusEnum("status").notNull().default("active"),
  dueDate: date("due_date", { mode: "string" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
