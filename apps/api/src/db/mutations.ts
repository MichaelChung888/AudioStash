import { appliedMutations, type Executor, type Transaction } from '@audiostash/db';
import { eq } from 'drizzle-orm';

export type AppliedMutationRow = typeof appliedMutations.$inferSelect;

export async function findById(db: Executor, id: string): Promise<AppliedMutationRow | null> {
  const [row] = await db.select().from(appliedMutations).where(eq(appliedMutations.id, id)).limit(1);
  return row ?? null;
}

export async function record(
  tx: Transaction,
  values: { id: string; sessionId: string; type: string; status: 'applied' | 'rejected'; reason?: string | undefined },
): Promise<void> {
  await tx.insert(appliedMutations).values(values);
}
