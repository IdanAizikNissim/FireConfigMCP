# fire_config_mcp

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Create and place service account files for each environment

To allow the server to access Firebase Remote Config, you need a Google Cloud service account key file for each environment you want to use (e.g., dev, stg, prod):

#### A. Google Cloud Console (point‑and‑click)
1. Open **IAM & Admin → Service Accounts** inside the same GCP project that owns your Firebase app.
2. Click **Create Service Account**
   - Name: `mcp-remote-config` (any name is fine)
   - Description: “MCP server – Remote Config access”
3. Grant this service account access:
   - In the role picker, search for **Remote Config Viewer** or **Remote Config Admin** (as needed) and select it.
   - Optionally add **Firebase Analytics Viewer** if your template conditions reference GA4 audiences.
4. Finish → Done.
5. In the list, click the account → **Keys** tab → **Add Key** → **Create new key** → **JSON**.
6. Download the JSON file and place it in the project root as:
   - `serviceAccount_dev.json` for your development environment
   - `serviceAccount_stg.json` for your staging environment
   - `serviceAccount_prod.json` for your production environment

> **Note:** Do **not** commit any `serviceAccount_*.json` files to version control. They are already in `.gitignore`.

### 3. Run the server with one or more environments

You can specify which environments to load by passing them as arguments. For example:

```bash
bun run index.ts dev stg prod
```

This will load all three environments. You can specify any subset (e.g., just `dev`, or `stg prod`). If no arguments are provided, it defaults to `dev`.

The server will start on port 3000 by default.

## Usage

### Add this MCP server to a client (e.g., Cursor, Claude Desktop, or your own MCP client)

#### In Cursor:
1. Open Cursor Settings → Features → Add new MCP server.
2. For the command, use:
   ```
npx -y supergateway --sse http://localhost:3000/mcp
   ```
   ```
"fire-config-mcp": {
    "command": "npx",
    "args": [
    "-y",
    "supergateway",
    "--sse",
    "http://localhost:3000/mcp"
    ]
}
    ```
   (Or use the path/command as configured in your environment.)
3. Save and connect.

#### In your own MCP client (TypeScript example):

You can connect to this server using the [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) client:

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";

const client = new Client({ name: "my-client", version: "1.0.0" });
const transport = new SSEClientTransport("http://localhost:3000/mcp");
await client.connect(transport);

// Now you can list tools, call tools, etc.
const tools = await client.listTools();
```

For more details, see the [MCP TypeScript SDK documentation](https://github.com/modelcontextprotocol/typescript-sdk#writing-mcp-clients).

---

This project was created using `bun init` in bun v1.2.7. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.
