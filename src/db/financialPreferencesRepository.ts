import { validateSavingsGoalValue } from '../domain/savingsGoalRules';
import type { SavingsGoal, SavingsGoalMode } from '../types/financialAnalytics';
import type { SqlDatabase } from './sqlDatabase';

const DEFAULT_GOAL: SavingsGoal = { enabled: false, mode: 'fixed_amount', targetValue: 0 };

interface Row {
  id: number;
  savings_goal_enabled: number;
  savings_goal_mode: string | null;
  savings_goal_value: number | null;
  updated_at: string;
}

export async function getSavingsGoal(db: SqlDatabase): Promise<SavingsGoal> {
  const row = await db.getFirstAsync<Row>('SELECT * FROM financial_preferences WHERE id = 1');
  if (!row) return DEFAULT_GOAL;
  return {
    enabled: row.savings_goal_enabled === 1,
    mode: (row.savings_goal_mode as SavingsGoalMode) ?? 'fixed_amount',
    targetValue: row.savings_goal_value ?? 0,
  };
}

/** Guarda la meta de ahorro (solo puede haber una modalidad activa a la vez). Valida si está habilitada. */
export async function setSavingsGoal(db: SqlDatabase, goal: SavingsGoal): Promise<void> {
  if (goal.enabled) {
    const error = validateSavingsGoalValue(goal.mode, goal.targetValue);
    if (error) throw new Error(error);
  }
  await db.runAsync(
    `INSERT INTO financial_preferences (id, savings_goal_enabled, savings_goal_mode, savings_goal_value, updated_at)
     VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       savings_goal_enabled = excluded.savings_goal_enabled,
       savings_goal_mode = excluded.savings_goal_mode,
       savings_goal_value = excluded.savings_goal_value,
       updated_at = excluded.updated_at`,
    [goal.enabled ? 1 : 0, goal.mode, goal.targetValue, new Date().toISOString()]
  );
}
