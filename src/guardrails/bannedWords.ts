import type { Context } from "hono";
import { query } from "../db/client.js";

let cache: { data: string[]; expires: number } | null = null;
const TTL = 60 * 1000; // 1 minute

// Helper function for guardrails (returns array of strings)
export async function getBannedWords(): Promise<string[]> {
  const now = Date.now();

  if (cache && cache.expires > now) {
    return cache.data;
  }

  try {
    const rows = await query(
      `SELECT phrase FROM guardrail_banned_words ORDER BY created_at DESC`
    );
    
    const words = rows.map((r: any) => r.phrase.toLowerCase().trim());

    cache = { data: words, expires: now + TTL };
    return words;
  } catch (err) {
    console.error("❌ Error loading banned words:", err);
    return [];
  }
}

// Route handler for GET /guardrails/banned-words
export async function getBannedWordsRoute(c: Context) {
  try {
    const rows = await query(
      `SELECT id, phrase, created_at FROM guardrail_banned_words ORDER BY created_at DESC`
    );
    
    return c.json({ ok: true, words: rows });
  } catch (err) {
    console.error("❌ Error fetching banned words:", err);
    return c.json({ ok: false, error: "Failed to fetch banned words" }, 500);
  }
}

// Route handler for POST /guardrails/banned-words
export async function addBannedWordRoute(c: Context) {
  try {
    const { phrase } = await c.req.json();
    
    if (!phrase || !phrase.trim()) {
      return c.json({ ok: false, error: "Phrase is required" }, 400);
    }
    
    const cleanPhrase = phrase.trim().toLowerCase();
    
    // Check if phrase already exists
    const existing = await query(
      `SELECT id FROM guardrail_banned_words WHERE LOWER(phrase) = $1`,
      [cleanPhrase]
    );
    
    if (existing.length > 0) {
      return c.json({ ok: false, error: "Phrase already exists" }, 400);
    }
    
    // Insert new phrase
    await query(
      `INSERT INTO guardrail_banned_words (phrase, created_at) VALUES ($1, NOW())`,
      [cleanPhrase]
    );
    
    // Clear cache so next request gets fresh data
    cache = null;
    
    return c.json({ ok: true, message: "Phrase added successfully" });
  } catch (err) {
    console.error("❌ Error adding banned word:", err);
    return c.json({ ok: false, error: "Failed to add phrase" }, 500);
  }
}

// Route handler for DELETE /guardrails/banned-words/:id
export async function deleteBannedWordRoute(c: Context) {
  try {
    const id = c.req.param("id");
    
    await query(
      `DELETE FROM guardrail_banned_words WHERE id = $1`,
      [id]
    );
    
    // Clear cache so next request gets fresh data
    cache = null;
    
    return c.json({ ok: true, message: "Phrase deleted successfully" });
  } catch (err) {
    console.error("❌ Error deleting banned word:", err);
    return c.json({ ok: false, error: "Failed to delete phrase" }, 500);
  }
}