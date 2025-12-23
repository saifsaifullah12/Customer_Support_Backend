import type { Context } from "hono";
import { query } from "../db/client.js";

// Get all evaluation logs
export async function getEvalLogsRoute(c: Context) {
  try {
    const rows = await query(
      `SELECT id, user_input, agent_output, passed, score, feedback, created_at 
       FROM eval_logs 
       ORDER BY created_at DESC 
       LIMIT 100`
    );
    
    // Convert score to number and ensure proper types
    const logs = rows.map((row: any) => ({
      ...row,
      score: parseFloat(row.score) || 0,
      passed: Boolean(row.passed)
    }));
    
    return c.json({ ok: true, logs });
  } catch (err) {
    console.error("❌ Error fetching eval logs:", err);
    return c.json({ ok: false, error: "Failed to fetch logs" }, 500);
  }
}

// Delete an evaluation log
export async function deleteEvalLogRoute(c: Context) {
  try {
    const id = c.req.param("id");
    
    await query(`DELETE FROM eval_logs WHERE id = $1`, [id]);
    
    return c.json({ ok: true, message: "Log deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting eval log:", err);
    return c.json({ ok: false, error: "Failed to delete log" }, 500);
  }
}