import type { Context } from "hono";
import { query } from "../../db/client";

// Get conversation history
export async function getConversationHistoryRoute(c: Context) {
  try {
    const conversationId = c.req.param("conversationId");
    
    // Get conversation details
    const conversation = await query(
      `SELECT * FROM conversations WHERE id = $1`,
      [conversationId]
    );
    
    // Get messages for this conversation
    const messages = await query(
      `SELECT id, role, content, created_at 
       FROM conversation_messages 
       WHERE conversation_id = $1 
       ORDER BY created_at ASC`,
      [conversationId]
    );
    
    return c.json({ 
      ok: true, 
      history: messages,
      conversation: conversation[0] || null,
      messageCount: messages.length
    });
  } catch (err:any) {
    console.error("❌ Error fetching conversation history:", err);
    return c.json({ 
      ok: false, 
      error: "Failed to fetch conversation history",
      details: err.message 
    }, 500);
  }
}

// Get all conversations for a user
export async function getAllConversationsRoute(c: Context) {
  try {
    const userId = c.req.query("userId") || "user-123";
    
    const conversations = await query(
      `SELECT 
        c.id,
        c.title,
        c.created_at,
        c.updated_at,
        COUNT(cm.id) as message_count,
        (
          SELECT content 
          FROM conversation_messages 
          WHERE conversation_id = c.id 
          ORDER BY created_at DESC 
          LIMIT 1
        ) as last_message
       FROM conversations c
       LEFT JOIN conversation_messages cm ON c.id = cm.conversation_id
       WHERE c.user_id = $1
       GROUP BY c.id, c.title, c.created_at, c.updated_at
       ORDER BY c.updated_at DESC`,
      [userId]
    );
    
    return c.json({ 
      ok: true, 
      conversations: conversations.map(conv => ({
        ...conv,
        last_message: conv.last_message ? 
          (conv.last_message.length > 100 ? conv.last_message.substring(0, 100) + '...' : conv.last_message)
          : 'No messages'
      }))
    });
  } catch (err:any) {
    console.error("❌ Error fetching conversations:", err);
    return c.json({ 
      ok: false, 
      error: "Failed to fetch conversations",
      details: err.message 
    }, 500);
  }
}

// Delete a conversation
export async function deleteConversationRoute(c: Context) {
  try {
    const conversationId = c.req.param("conversationId");
    
    await query(`DELETE FROM conversations WHERE id = $1`, [conversationId]);
    
    return c.json({ 
      ok: true, 
      message: "Conversation deleted successfully" 
    });
  } catch (err) {
    console.error("❌ Error deleting conversation:", err);
    return c.json({ 
      ok: false, 
      error: "Failed to delete conversation" 
    }, 500);
  }
}