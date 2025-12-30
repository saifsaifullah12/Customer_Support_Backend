import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

let client: Client | null = null;
let isConnecting = false;
let connectionAttempts = 0;
const MAX_ATTEMPTS = 3;

export async function getZapierClient(): Promise<Client> {
  // Return existing client if connected and healthy
  if (client) {
    try {
      // Quick health check - list tools to verify connection
      await client.listTools();
      console.log("✅ Using existing Zapier MCP connection");
      return client;
    } catch (error) {
      console.warn("⚠️ Existing connection is stale, reconnecting...");
      client = null;
    }
  }

  // Wait if connection is in progress
  if (isConnecting) {
    console.log("⏳ Connection in progress, waiting...");
    await new Promise(resolve => setTimeout(resolve, 500));
    return getZapierClient();
  }

  isConnecting = true;

  try {
    const serverUrl = process.env.ZAPIER_MCP_URL;
    
    if (!serverUrl) {
      throw new Error("❌ ZAPIER_MCP_URL environment variable is not set");
    }

    console.log(`🔌 Connecting to Zapier MCP (attempt ${connectionAttempts + 1}/${MAX_ATTEMPTS}):`, serverUrl);

    client = new Client(
      { 
        name: "voltagent-zapier-client", 
        version: "1.0.0" 
      },
      { 
        capabilities: {
          // Enable all available capabilities
        } 
      }
    );

    const transport = new StreamableHTTPClientTransport(new URL(serverUrl));
    
    await client.connect(transport);
    
    // Verify connection by listing tools
    const tools = await client.listTools();
    const toolNames = tools.tools?.map(t => t.name).join(", ") || "none";
    
    console.log("✅ Successfully connected to Zapier MCP");
    console.log("📋 Available tools:", toolNames);

    // Verify expected tools exist
    const expectedTools = ["gmail_send_email", "gmail_reply_to_email"];
    const availableToolNames = tools.tools?.map(t => t.name) || [];
    const missingTools = expectedTools.filter(t => !availableToolNames.includes(t));
    
    if (missingTools.length > 0) {
      console.warn("⚠️ Missing expected tools:", missingTools.join(", "));
    }

    connectionAttempts = 0; // Reset on success
    return client;
  } catch (error: any) {
    client = null;
    connectionAttempts++;
    
    console.error(`❌ Failed to connect to Zapier MCP (attempt ${connectionAttempts}/${MAX_ATTEMPTS}):`, error.message);
    
    // Retry with exponential backoff
    if (connectionAttempts < MAX_ATTEMPTS) {
      const backoffMs = Math.min(1000 * Math.pow(2, connectionAttempts), 5000);
      console.log(`⏳ Retrying in ${backoffMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoffMs));
      isConnecting = false;
      return getZapierClient();
    }
    
    connectionAttempts = 0; // Reset for next attempt
    throw new Error(`Failed to connect to Zapier MCP after ${MAX_ATTEMPTS} attempts: ${error.message}`);
  } finally {
    isConnecting = false;
  }
}

// Disconnect function for cleanup
export async function disconnectZapierClient() {
  if (client) {
    try {
      await client.close();
      client = null;
      console.log("🔌 Disconnected from Zapier MCP");
    } catch (error) {
      console.error("Error disconnecting:", error);
    }
  }
}

// Test connection function
export async function testZapierConnection(): Promise<{ 
  connected: boolean; 
  tools?: string[]; 
  error?: string 
}> {
  try {
    const client = await getZapierClient();
    const tools = await client.listTools();
    return {
      connected: true,
      tools: tools.tools?.map(t => t.name) || [],
    };
  } catch (error: any) {
    return {
      connected: false,
      error: error.message,
    };
  }
}