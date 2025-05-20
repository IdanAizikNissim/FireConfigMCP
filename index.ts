import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";
import express from "express";
import { initializeApp, cert } from "firebase-admin/app";
import { getRemoteConfig } from "firebase-admin/remote-config";

// Helper to load service account and initialize Firebase for a given env
function getFirebaseConfig(env: string = "dev") {
  let serviceAccount;
  try {
    serviceAccount = require(`./serviceAccount_${env}.json`);
  } catch (e) {
    throw new Error(`serviceAccount_${env}.json not found. Please create one and place it in the root directory.`);
  }
  const firebaseApp = initializeApp({
    credential: cert(serviceAccount as Record<string, string>),
  }, env); // Use env as app name for isolation
  const remoteConfig = getRemoteConfig(firebaseApp);
  return { firebaseApp, remoteConfig };
}

// Get envs from CLI args (default to ["dev"])
const envs = process.argv.slice(2);
const firebaseEnvs = envs.length > 0 ? envs : ["dev"];

// Map of env name to { firebaseApp, remoteConfig }
const firebaseConfigs: Record<string, { firebaseApp: ReturnType<typeof initializeApp>, remoteConfig: ReturnType<typeof getRemoteConfig> }> = {};
firebaseEnvs.forEach(env => {
  console.log(`Loading Firebase config for env: ${env}`);
  firebaseConfigs[env] = getFirebaseConfig(env);
});

const server = new McpServer({
  name: "fire-config-mcp",
  version: "0.1.0",
});

// Helper to get the default env
function getDefaultEnv(env?: string): string {
  if (typeof env === "string" && env in firebaseConfigs) return env;
  const firstEnv = firebaseEnvs[0];
  if (typeof firstEnv === "string" && firstEnv && firstEnv in firebaseConfigs) return firstEnv;
  if ("dev" in firebaseConfigs) return "dev";
  const available = Object.keys(firebaseConfigs);
  if (available.length > 0) return available[0]!!;
  return "dev";
}

server.tool(
  "remoteConfig",
  "Fetches the active Firebase Remote Config template or a single parameter",
  { key: z.string().optional(), env: z.string().optional() },
  async ({ key, env }) => {
    const useEnv = getDefaultEnv(env ?? "");
    const config = firebaseConfigs[useEnv];
    if (!config) {
      return {
        content: [
          { type: "text", text: `❌ Unknown env: ${useEnv}` },
        ],
      };
    }
    const remoteConfig = config.remoteConfig;
    // 1. Get the current template
    const template = await remoteConfig.getTemplate();
    // 2. If caller requested a single key, extract it
    if (key) {
      const param = template.parameters[key];
      if (!param) {
        return {
          content: [
            {
              type: "text",
              text: `⚠️ Parameter “${key}” not found in Remote Config`,
            },
          ],
        };
      }
      return {
        // return just that parameter
        content: [{ type: "text", text: JSON.stringify({ [key]: param }) }],
      };
    }
    // 3. Otherwise return the whole template (parameters only to keep it small)
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            version: template.version,
            etag: template.etag,
            parameters: template.parameters,
          }),
        },
      ],
    };
  }
);

server.tool(
  "upsertRemoteConfig",
  "Update an existing Remote Config key; optionally override an EXISTING condition.",
  {
    key: z.string().min(1, "key is required"),
    value: z.string(),
    conditionName: z.string().optional(), // must point to an existing condition
    env: z.string().optional(), // add env
  },
  async ({ key, value, conditionName, env }) => {
    const useEnv = getDefaultEnv(env ?? "");
    const config = firebaseConfigs[useEnv];
    if (!config) {
      return {
        content: [
          { type: "text", text: `❌ Unknown env: ${useEnv}` },
        ],
      };
    }
    const remoteConfig = config.remoteConfig;
    // 2. Fetch the current template
    const template = await remoteConfig.getTemplate();
    // 3. Make sure the parameter object exists
    const param = (template.parameters[key] ??= {
      valueType: "STRING",
      defaultValue: { value: "" },
    });
    // 4. If no condition ‑> update default value
    if (!conditionName) {
      param.defaultValue = { value };
    } else {
      //-------------------------------------------------------------------
      // 4a.  Look up the condition; abort if not found
      //-------------------------------------------------------------------
      const condExists = template.conditions.some(
        (c: { name: string }) => c.name === conditionName
      );
      if (!condExists) {
        return {
          content: [
            {
              type: "text",
              text:
                `❌ Condition “${conditionName}” doesn't exist in the template. ` +
                `Update aborted.`,
            },
          ],
        };
      }
      //-------------------------------------------------------------------
      // 4b.  Condition exists → upsert its conditional value
      //-------------------------------------------------------------------
      param.conditionalValues ??= {};
      param.conditionalValues[conditionName] = { value };
    }
    // 5.  Publish (force:true bypasses ETag conflicts)
    const published = await remoteConfig.publishTemplate(template, {
      force: true,
    });
    // 6.  Confirmation message
    const msg = conditionName
      ? `✅ Updated “${key}” for condition “${conditionName}” → “${value}” (v${published.version?.versionNumber}).`
      : `✅ Updated default “${key}” → “${value}” (v${published.version?.versionNumber}).`;
    return { content: [{ type: "text", text: msg }] };
  }
);

server.tool(
  "removeRemoteConfig",
  "Delete a Remote Config key, or a specific conditional value on that key.",
  {
    key: z.string().min(1, "key is required"),
    conditionName: z.string().optional(), // if omitted we delete the whole key
    env: z.string().optional(), // add env
  },
  async ({ key, conditionName, env }) => {
    const useEnv = getDefaultEnv(env ?? "");
    const config = firebaseConfigs[useEnv];
    if (!config) {
      return {
        content: [
          { type: "text", text: `❌ Unknown env: ${useEnv}` },
        ],
      };
    }
    const remoteConfig = config.remoteConfig;
    // 1. Fetch current template
    const template = await remoteConfig.getTemplate();
    // 2. Check the parameter exists
    const param = template.parameters[key];
    if (!param) {
      return {
        content: [
          {
            type: "text",
            text: `❌ Parameter “${key}” doesn't exist. Nothing removed.`,
          },
        ],
      };
    }
    // 3. If no condition → delete the entire parameter
    if (!conditionName) {
      delete template.parameters[key];
    } else {
      //--------------------------------------------------------------
      // 3a.  Only delete a conditional override
      //--------------------------------------------------------------
      const cv = param.conditionalValues ?? {};
      if (!cv[conditionName]) {
        return {
          content: [
            {
              type: "text",
              text:
                `❌ Parameter “${key}” has no override for condition ` +
                `“${conditionName}”. Nothing removed.`,
            },
          ],
        };
      }
      delete cv[conditionName];
      // clean up if no overrides left
      if (Object.keys(cv).length === 0) delete param.conditionalValues;
    }
    // 4. Publish (force:true to ignore ETag conflicts)
    const published = await remoteConfig.publishTemplate(template, {
      force: true,
    });
    // 5. Confirmation
    const action = conditionName
      ? `override for condition “${conditionName}” on parameter “${key}”`
      : `parameter “${key}”`;
    return {
      content: [
        {
          type: "text",
          text:
            `✅ Removed ${action}. ` +
            `Template v${published.version?.versionNumber} published.`,
        },
      ],
    };
  }
);

let transport: SSEServerTransport;

const app = express();

app.get("/mcp", async (req, res) => {
  transport = new SSEServerTransport("/message", res);
  console.log(`connecting to transport ${transport.sessionId}`);
  await server.connect(transport);
});

app.post("/message", async (req, res) => {
  console.log("received message, checking for transport");

  if (!transport) {
    console.log("no transport available");
    res.status(500);
    res.json({ error: "No transport" });
    return;
  }

  console.log(`posting message to transport ${transport.sessionId}`);
  await transport.handlePostMessage(req, res);
});

app.listen(3000, () => {
  console.log("listening on port 3000");
});
