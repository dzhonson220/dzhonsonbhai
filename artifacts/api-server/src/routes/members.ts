import { Router, type IRouter } from "express";
import { asc } from "drizzle-orm";
import { GetMembersResponse } from "@workspace/api-zod";
import { db, membersTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/members", async (_req, res): Promise<void> => {
  const members = await db
    .select({
      id: membersTable.id,
      name: membersTable.name,
      role: membersTable.role,
    })
    .from(membersTable)
    .orderBy(asc(membersTable.name));

  res.json(GetMembersResponse.parse(members));
});

export default router;
