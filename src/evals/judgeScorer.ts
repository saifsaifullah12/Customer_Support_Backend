import { buildScorer } from "@voltagent/core";
import { openrouter } from "../agents/index";
import { generateObject } from "ai";
import { z } from "zod";
import { query } from "../db/client";

const JUDGE_SCHEMA = z.object({
  score: z.number().min(0).max(100),
  passed: z.boolean(),
  feedback: z.string(),
});

// Helper function to extract clean text from various input formats
function extractCleanText(input: any): string {
  // If it's already a plain string and doesn't look like JSON, return it
  if (typeof input === 'string') {
    const trimmed = input.trim();
    
    // Check if it looks like JSON
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractCleanText(parsed);
      } catch {
        // If parsing fails, return as-is
        return trimmed;
      }
    }
    
    return trimmed;
  }
  
  // Handle array of messages
  if (Array.isArray(input)) {
    const texts: string[] = [];
    
    for (const item of input) {
      if (item.role === 'user' || !item.role) {
        if (Array.isArray(item.content)) {
          // Extract text from content array
          for (const content of item.content) {
            if (content.type === 'text' && content.text) {
              texts.push(content.text);
            }
          }
        } else if (typeof item.content === 'string') {
          texts.push(item.content);
        } else if (item.text) {
          texts.push(item.text);
        }
      }
    }
    
    return texts.join(' ').trim();
  }
  
  // Handle single message object
  if (input && typeof input === 'object') {
    if (Array.isArray(input.content)) {
      const texts: string[] = [];
      for (const content of input.content) {
        if (content.type === 'text' && content.text) {
          texts.push(content.text);
        }
      }
      return texts.join(' ').trim();
    }
    
    if (typeof input.content === 'string') {
      return input.content.trim();
    }
    
    if (input.text) {
      return String(input.text).trim();
    }
  }
  
  return String(input || '').trim();
}

export const supportQualityScorer = buildScorer({
  id: "support-quality",
  label: "Support Response Quality Judge",
})
  .score(async ({ payload }: any) => {
    // Extract clean text first
    const userInput = extractCleanText(payload.input);
    const agentOutput = String(payload.output || "").trim();

    console.log("🔍 Extracted User Input:", userInput);
    console.log("🔍 Agent Output:", agentOutput);

    try {
      const systemPrompt = `You are an evaluation engine that judges customer support responses.

Evaluation Criteria:
1. Billing Query Handling: For refund/invoice/payment questions, responses must be comprehensive (>50 chars) and mention support tickets or next steps
2. Blocked Content Detection: Responses should not contain "blocked" or "guardrail" messages
3. Helpfulness: Responses over 100 characters that include actionable steps or ticket information are considered comprehensive

Scoring Guide:
- 90-100: Comprehensive, helpful response with clear next steps
- 70-89: Good response but missing some detail
- 50-69: Adequate but too brief for the query type
- 30-49: Response indicates technical issues (blocked/guardrail)
- 0-29: Unhelpful or inappropriate response

Instructions:
- Score from 0 to 100
- Set "passed" to true if score >= 70, false otherwise
- Provide detailed feedback explaining the score

Return ONLY valid JSON in this exact format:
{
  "score": <number 0-100>,
  "passed": <boolean>,
  "feedback": "<detailed explanation>"
}`;

      const prompt = `Evaluate this customer support interaction:

User Input:
${userInput || "No input provided"}

Agent Response:
${agentOutput || "No output provided"}

Provide your evaluation based on the criteria above.`;

      const response = await generateObject({
        model: openrouter.chat("meta-llama/llama-3.3-70b-instruct:free"),
        schema: JUDGE_SCHEMA,
        system: systemPrompt,
        prompt,
        temperature: 0.3,
      });

      const { score, passed, feedback } = response.object;

      // Log to database with clean text
      await query(
        `INSERT INTO eval_logs (user_input, agent_output, passed, score, feedback, created_at)
         VALUES ($1, $2, $3, $4::numeric, $5, NOW())`,
        [userInput, agentOutput, passed, score / 100, feedback]
      );

      console.log(`✅ Evaluation: Score=${score}/100, Passed=${passed}`);

      return {
        score: score / 100, // Normalize to 0-1 for VoltAgent
        metadata: { passed, feedback, rawScore: score },
      };
    } catch (error) {
      console.error("❌ Error in support quality scorer:", error);
      
      // Fallback to simple evaluation on error
      const fallbackPassed = agentOutput.length > 50 && !agentOutput.toLowerCase().includes("blocked");
      
      await query(
        `INSERT INTO eval_logs (user_input, agent_output, passed, score, feedback, created_at)
         VALUES ($1, $2, $3, $4::numeric, $5, NOW())`,
        [userInput, agentOutput, fallbackPassed, fallbackPassed ? 0.7 : 0.3, "Fallback evaluation due to scorer error"]
      );

      return {
        score: fallbackPassed ? 0.7 : 0.3,
        metadata: { passed: fallbackPassed, feedback: "Fallback evaluation", error: true },
      };
    }
  })
  .reason(({ score, metadata }: any) => ({
    reason: metadata?.feedback || `Score: ${(score * 100).toFixed(0)}/100`,
  }))
  .build();