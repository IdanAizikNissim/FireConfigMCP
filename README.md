# fire_config_mcp

## Setup

### 1. Install dependencies

```bash
bun install
```

### 2. Create a Google Cloud service account for Firebase Remote Config

To access Firebase Remote Config, you must create a service account in your Google Cloud Console and grant it the correct permissions.

#### How to create a service account in Google Cloud Console

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Select your project (the one that owns your Firebase app).
3. In the left sidebar, go to **IAM & Admin → Service Accounts**.
4. Click **Create Service Account**.
   - **Name:** Any name (e.g., `mcp-remote-config`)
   - **Description:** (Optional) e.g., “MCP server – Remote Config access”
5. Click **Create and Continue**.
6. **Grant this service account access to project:**
   - In the role picker, search for and add:
     - **Remote Config Admin** (or **Remote Config Viewer** if you only need read access)
     - (Optional) **Firebase Analytics Viewer** if your Remote Config template conditions reference GA4 audiences
7. Click **Continue** and then **Done**.
8. In the list of service accounts, click the one you just created.
9. Go to the **Keys** tab.
10. Click **Add Key → Create new key**.
11. Choose **JSON** and click **Create**. This will download a JSON key file to your computer.

> **Important:** Keep this file secure. Do not share it or commit it to version control.

### 3. Place service account files for each environment

Rename and place the downloaded JSON file(s) in your project root as follows:
- `serviceAccount_dev.json` for your development environment
- `serviceAccount_stg.json` for your staging environment
- `serviceAccount_prod.json` for your production environment

> **Note:** Do **not** commit any `serviceAccount_*.json` files to version control. They are already in `.gitignore`.

### 4. Run the server with one or more environments

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
