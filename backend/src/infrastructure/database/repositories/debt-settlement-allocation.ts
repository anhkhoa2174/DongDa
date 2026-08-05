import { BadRequestException } from '@nestjs/common';

type OpenDebtRow = {
  id: string;
  remaining: unknown;
};

export async function allocateDebtSettlement(
  tx: any,
  debtAccountId: string,
  settlementMovementId: string,
  amount: number,
) {
  const openDebts = await tx.$queryRaw`
    SELECT
      debt.id,
      debt.amount
        - COALESCE((
            SELECT SUM(allocation.amount)
            FROM debt_settlement_allocations allocation
            WHERE allocation.debt_movement_id = debt.id
          ), 0)
        - COALESCE((
            SELECT SUM(reversal.amount)
            FROM debt_movements reversal
            WHERE reversal.source_type = 'DEBT_MOVEMENT'
              AND reversal.source_id = debt.id
              AND reversal.movement_type = 'REVERSAL'
              AND reversal.status = 'POSTED'
          ), 0) AS remaining
    FROM debt_movements debt
    WHERE debt.debt_account_id = ${debtAccountId}::uuid
      AND debt.status = 'POSTED'
      AND debt.movement_type IN ('EXPECTED_DEBT', 'ACTUAL_DEBT')
      AND (
        debt.movement_type = 'ACTUAL_DEBT'
        OR NOT EXISTS (
          SELECT 1
          FROM debt_movements actual
          WHERE actual.debt_account_id = debt.debt_account_id
            AND actual.movement_type = 'ACTUAL_DEBT'
            AND actual.source_type = 'JOURNAL_RECONCILIATION'
            AND actual.status = 'POSTED'
        )
      )
      AND debt.amount
        - COALESCE((
            SELECT SUM(allocation.amount)
            FROM debt_settlement_allocations allocation
            WHERE allocation.debt_movement_id = debt.id
          ), 0)
        - COALESCE((
            SELECT SUM(reversal.amount)
            FROM debt_movements reversal
            WHERE reversal.source_type = 'DEBT_MOVEMENT'
              AND reversal.source_id = debt.id
              AND reversal.movement_type = 'REVERSAL'
              AND reversal.status = 'POSTED'
          ), 0) > 0
    ORDER BY debt.effective_at ASC, debt.id ASC
  ` as OpenDebtRow[];

  let unallocated = amount;
  for (const debt of openDebts) {
    if (unallocated <= 0) break;
    const allocatedAmount = Math.min(unallocated, Number(debt.remaining));
    await tx.debt_settlement_allocations.create({
      data: {
        settlement_movement_id: settlementMovementId,
        debt_movement_id: debt.id,
        amount: allocatedAmount,
      },
    });
    unallocated = Number((unallocated - allocatedAmount).toFixed(2));
  }

  if (unallocated > 0) {
    throw new BadRequestException(`Không thể phân bổ ${unallocated} công nợ còn lại`);
  }
}
