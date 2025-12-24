import type { Context } from "hono";
import { query } from "../../db/client";

// Available tools configuration
const AVAILABLE_TOOLS = [
  {
    id: 'kb-search',
    name: 'Knowledge Base Search',
    description: 'Search for solutions to the knowledgebase parameters',
    category: 'Search and execution on parameters',
    parameters: [
      { name: 'query', type: 'string', required: true, description: 'Search query string' }
    ]
  },
  {
    id: 'invoice-lookup',
    name: 'Invoice Lookup',
    description: 'Find a trade information by invoice ID',
    category: 'Search and execution on parameters',
    parameters: [
      { name: 'invoiceId', type: 'string', required: true, description: 'Invoice identifier' },
      { name: 'trusted', type: 'string', required: false, description: 'Trusted string' }
    ]
  },
  {
    id: 'create-ticket',
    name: 'Create Support Task+',
    description: 'Create a new support task',
    category: 'Search and execution on parameters',
    parameters: [
      { name: 'base', type: 'string', required: true, description: 'Base string' },
      { name: 'package', type: 'string', required: true, description: 'Package string control' }
    ]
  },
  {
    id: 'ocr-screenshot',
    name: 'OCS Screenshot',
    description: 'Create that time uploaded screenshots',
    category: 'Search and execution on parameters',
    parameters: [
      { name: 'template', type: 'string', required: true, description: 'Template index string' }
    ]
  },
  {
    id: 'status-knowledge',
    name: 'Status Knowledge',
    description: 'Search listing-related knowledge',
    category: 'Search and execution on parameters',
    parameters: [
      { name: 'query', type: 'string', required: true, description: 'Search query string' }
    ]
  },
  {
    id: 'send-email',
    name: 'Sort Email',
    description: 'Send emails via Cloud',
    category: 'Search and execution on parameters',
    parameters: [
      { name: 'to', type: 'email', required: true, description: 'Recipient email address' },
      { name: 'subject', type: 'string', required: true, description: 'Email subject' },
      { name: 'body', type: 'string', required: true, description: 'Email body content' }
    ]
  }
];

// Execute a tool
export async function executeToolRoute(c: Context) {
  try {
    const { toolId, parameters } = await c.req.json();
    
    console.log(`🛠️ Executing tool: ${toolId}`, parameters);
    
    // Find the tool
    const tool = AVAILABLE_TOOLS.find(t => t.id === toolId);
    
    if (!tool) {
      return c.json({ 
        ok: false, 
        success: false,
        error: `Tool '${toolId}' not found`,
        timestamp: new Date().toISOString()
      });
    }
    
    // Validate required parameters
    const requiredParams = tool.parameters.filter(p => p.required);
    const missingParams = requiredParams.filter(p => !parameters[p.name]);
    
    if (missingParams.length > 0) {
      return c.json({
        ok: false,
        success: false,
        error: `Missing required parameters: ${missingParams.map(p => p.name).join(', ')}`,
        timestamp: new Date().toISOString()
      });
    }
    
    // Execute tool logic
    let result;
    const executionId = `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    switch (toolId) {
      case 'kb-search':
        result = {
          success: true,
          executionId,
          data: {
            query: parameters.query,
            results: [
              {
                title: 'Login Issue Solution',
                content: 'Try resetting your password or clearing browser cache.',
                relevance: 0.95
              },
              {
                title: 'Payment Processing',
                content: 'Payments are processed within 24 hours.',
                relevance: 0.87
              }
            ],
            timestamp: new Date().toISOString()
          }
        };
        break;
        
      case 'invoice-lookup':
        result = {
          success: true,
          executionId,
          data: {
            invoiceId: parameters.invoiceId,
            status: 'Paid',
            amount: '₹499',
            date: '2024-01-15',
            customer: 'John Doe',
            items: [
              { description: 'Premium Plan', quantity: 1, price: '₹499' }
            ],
            timestamp: new Date().toISOString()
          }
        };
        break;
        
      case 'create-ticket':
        const ticketId = 'TICKET-' + Math.floor(Math.random() * 90000 + 10000);
        result = {
          success: true,
          executionId,
          data: {
            ticketId,
            status: 'Open',
            priority: 'High',
            assignedTo: 'Support Team',
            createdAt: new Date().toISOString(),
            estimatedResolution: '24-48 hours',
            message: 'Support ticket created successfully',
            timestamp: new Date().toISOString()
          }
        };
        break;
        
      case 'ocr-screenshot':
        result = {
          success: true,
          executionId,
          data: {
            text: 'Detected: Invoice #INV-001\nAmount: ₹499\nStatus: Pending\nDue Date: 2024-01-20',
            confidence: 0.92,
            extractedData: {
              invoiceNumber: 'INV-001',
              amount: '₹499',
              status: 'Pending'
            },
            timestamp: new Date().toISOString()
          }
        };
        break;
        
      case 'status-knowledge':
        result = {
          success: true,
          executionId,
          data: {
            query: parameters.query,
            status: 'Operational',
            lastUpdated: new Date().toISOString(),
            services: [
              { name: 'API', status: 'Up', latency: '45ms' },
              { name: 'Database', status: 'Up', latency: '12ms' },
              { name: 'Payment Gateway', status: 'Up', latency: '89ms' }
            ],
            timestamp: new Date().toISOString()
          }
        };
        break;
        
      case 'send-email':
        result = {
          success: true,
          executionId,
          data: {
            to: parameters.to,
            subject: parameters.subject,
            status: 'Sent',
            messageId: 'email-' + Date.now(),
            sentAt: new Date().toISOString(),
            estimatedDelivery: 'Instant',
            timestamp: new Date().toISOString()
          }
        };
        break;
        
      default:
        result = {
          success: false,
          executionId,
          error: 'Tool execution not implemented',
          timestamp: new Date().toISOString()
        };
    }
    
    // Log tool execution to database
    try {
      await query(
        `INSERT INTO tool_logs (tool_id, parameters, result, success, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [toolId, JSON.stringify(parameters), JSON.stringify(result), result.success]
      );
    } catch (dbError) {
      console.error('Failed to log tool execution:', dbError);
    }
    
    return c.json({ 
      ok: true, 
      ...result,
      tool: {
        id: tool.id,
        name: tool.name,
        category: tool.category
      }
    });
    
  } catch (err) {
    console.error("❌ Error executing tool:", err);
    return c.json({ 
      ok: false, 
      success: false,
      error: 'Failed to execute tool',
      timestamp: new Date().toISOString()
    }, 500);
  }
}

// Get all available tools
export async function getToolsRoute(c: Context) {
  try {
    // Get recent tool executions
    const recentExecutions = await query(
      `SELECT tool_id, success, created_at 
       FROM tool_logs 
       ORDER BY created_at DESC 
       LIMIT 10`
    );
    
    // Add execution stats to tools
    const toolsWithStats = AVAILABLE_TOOLS.map(tool => {
      const toolExecutions = recentExecutions.filter(exec => exec.tool_id === tool.id);
      return {
        ...tool,
        stats: {
          totalExecutions: toolExecutions.length,
          successfulExecutions: toolExecutions.filter(exec => exec.success).length,
          lastExecuted: toolExecutions.length > 0 ? toolExecutions[0].created_at : null
        }
      };
    });
    
    return c.json({ 
      ok: true, 
      tools: toolsWithStats,
      totalTools: AVAILABLE_TOOLS.length,
      recentExecutions: recentExecutions.length
    });
  } catch (err) {
    console.error("❌ Error getting tools:", err);
    return c.json({ 
      ok: true, 
      tools: AVAILABLE_TOOLS,
      totalTools: AVAILABLE_TOOLS.length,
      recentExecutions: 0,
      note: 'Using default tools configuration'
    });
  }
}

// Get tool execution history
export async function getToolHistoryRoute(c: Context) {
  try {
    const { limit = 50, offset = 0 }:any = c.req.query();
    
    const executions = await query(
      `SELECT 
        tl.id,
        tl.tool_id,
        tl.parameters,
        tl.result,
        tl.success,
        tl.created_at
       FROM tool_logs tl
       ORDER BY tl.created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), parseInt(offset)]
    );
    
    const total = await query(
      `SELECT COUNT(*) as count FROM tool_logs`
    );
    
    return c.json({
      ok: true,
      executions: executions.map(exec => ({
        ...exec,
        tool_name: AVAILABLE_TOOLS.find(t => t.id === exec.tool_id)?.name || exec.tool_id
      })),
      pagination: {
        total: parseInt(total[0]?.count || 0),
        limit: parseInt(limit),
        offset: parseInt(offset)
      }
    });
  } catch (err) {
    console.error("❌ Error fetching tool history:", err);
    return c.json({ 
      ok: false, 
      error: 'Failed to fetch tool history' 
    }, 500);
  }
}