import { createInsertSchema } from "drizzle-zod";
import { pgTable, serial, text, varchar } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const membersTable = pgTable("members", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  role: text("role").notNull(),
});

export const insertMemberSchema = createInsertSchema(membersTable).omit({
  id: true,
});
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof membersTable.$inferSelect;
