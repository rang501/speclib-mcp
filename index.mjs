#!/usr/bin/env node

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const API_URL = (process.env.SPECLIB_API_URL || "http://localhost:3000").replace(/\/+$/, "");
const API_TOKEN = process.env.SPECLIB_API_TOKEN || "";

// --- Helpers ---

async function apiFetch(path, options = {}) {
  const url = `${API_URL}${path}`;
  const headers = { ...options.headers };
  if (API_TOKEN) {
    headers["Authorization"] = `Bearer ${API_TOKEN}`;
  }
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${body || res.statusText}`);
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }
  return res.text();
}

function parseTags(tags) {
  if (!tags) return [];
  if (Array.isArray(tags)) return tags;
  try {
    return JSON.parse(tags);
  } catch {
    return [];
  }
}

function parseParameters(params) {
  if (!params) return [];
  if (Array.isArray(params)) return params;
  try {
    return JSON.parse(params);
  } catch {
    return [];
  }
}

function errorResult(message) {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

// --- Server ---

const server = new McpServer({
  name: "speclib-mcp",
  version: "1.0.0",
});

// --- Tools ---

server.tool(
  "search_specs",
  "Search for specs in SpecLib. Returns summaries (without full content). Use get_spec to retrieve the full content of a specific spec.",
  {
    query: z.string().optional().describe("Search query - matches against title, tags, and content"),
    scope: z.string().optional().describe("Filter by scope slug or name"),
    type: z.enum(["TEXT", "YAML", "MARKDOWN"]).optional().describe("Filter by content type"),
  },
  async ({ query, scope, type }) => {
    try {
      let specs = await apiFetch("/api/specs");

      if (scope) {
        const s = scope.toLowerCase();
        specs = specs.filter(
          (spec) =>
            spec.scope &&
            (spec.scope.slug.toLowerCase() === s || spec.scope.name.toLowerCase() === s)
        );
      }

      if (type) {
        specs = specs.filter((spec) => spec.type === type);
      }

      if (query) {
        const q = query.toLowerCase();
        specs = specs.filter((spec) => {
          if (spec.title.toLowerCase().includes(q)) return true;
          const tags = parseTags(spec.tags);
          if (tags.some((tag) => tag.toLowerCase().includes(q))) return true;
          if (spec.content && spec.content.toLowerCase().includes(q)) return true;
          return false;
        });
      }

      const results = specs.map((spec) => ({
        id: spec.id,
        title: spec.title,
        type: spec.type,
        slug: spec.slug,
        scope: spec.scope ? { name: spec.scope.name, slug: spec.scope.slug } : null,
        tags: parseTags(spec.tags),
        instructions: spec.instructions || null,
      }));

      return {
        content: [
          {
            type: "text",
            text: results.length
              ? JSON.stringify(results, null, 2)
              : "No specs found matching the criteria.",
          },
        ],
      };
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

server.tool(
  "get_spec",
  "Get the full content of a spec. Provide either an id, or a scope and slug combination.",
  {
    id: z.number().int().positive().optional().describe("Spec ID"),
    scope: z.string().optional().describe("Scope slug (use with slug)"),
    slug: z.string().optional().describe("Spec slug (use with scope)"),
  },
  async ({ id, scope, slug }) => {
    try {
      if (id) {
        const spec = await apiFetch(`/api/specs/${id}`);
        const result = {
          ...spec,
          tags: parseTags(spec.tags),
          parameters: parseParameters(spec.parameters),
          scope: spec.scope ? { name: spec.scope.name, slug: spec.scope.slug } : null,
        };
        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      }

      if (scope && slug) {
        const content = await apiFetch(`/api/specs/${encodeURIComponent(scope)}/${encodeURIComponent(slug)}`);
        return {
          content: [{ type: "text", text: content }],
        };
      }

      return errorResult("Provide either 'id' or both 'scope' and 'slug'.");
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

server.tool(
  "list_scopes",
  "List all available scopes in SpecLib. Use scope slugs to filter specs or retrieve specs by scope/slug.",
  {},
  async () => {
    try {
      const scopes = await apiFetch("/api/scopes");
      const results = scopes.map((s) => ({
        id: s.id,
        name: s.name,
        slug: s.slug,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

server.tool(
  "get_recipe",
  "Get a recipe by ID, including all its bundled specs with full content.",
  {
    id: z.number().int().positive().describe("Recipe ID"),
  },
  async ({ id }) => {
    try {
      const recipe = await apiFetch(`/api/recipes/${id}`);
      return {
        content: [{ type: "text", text: JSON.stringify(recipe, null, 2) }],
      };
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

server.tool(
  "create_spec",
  "Create a new spec in SpecLib. Requires SPECLIB_API_TOKEN to be configured.",
  {
    title: z.string().min(1).max(200).describe("Spec title"),
    content: z.string().min(1).max(50000).describe("Spec content"),
    type: z.enum(["TEXT", "YAML", "MARKDOWN"]).optional().describe("Content type (default: TEXT)"),
    tags: z.array(z.string()).optional().describe("Tags for the spec"),
    scope_id: z.number().int().positive().optional().describe("Scope ID to assign the spec to"),
    is_public: z.boolean().optional().describe("Whether the spec is public (default: true)"),
    instructions: z.string().optional().describe("Usage instructions for the spec"),
  },
  async ({ title, content, type, tags, scope_id, is_public, instructions }) => {
    try {
      if (!API_TOKEN) {
        return errorResult("SPECLIB_API_TOKEN environment variable is required to create specs.");
      }
      const body = { title, content };
      if (type) body.type = type;
      if (tags) body.tags = tags;
      if (scope_id) body.scopeId = scope_id;
      if (is_public !== undefined) body.isPublic = is_public;
      if (instructions) body.instructions = instructions;

      const spec = await apiFetch("/api/specs", {
        method: "POST",
        body: JSON.stringify(body),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(spec, null, 2) }],
      };
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

server.tool(
  "update_spec",
  "Update an existing spec in SpecLib. Requires SPECLIB_API_TOKEN to be configured.",
  {
    id: z.number().int().positive().describe("Spec ID to update"),
    title: z.string().min(1).max(200).optional().describe("New title"),
    content: z.string().min(1).max(50000).optional().describe("New content"),
    type: z.enum(["TEXT", "YAML", "MARKDOWN"]).optional().describe("New content type"),
    tags: z.array(z.string()).optional().describe("New tags"),
    is_public: z.boolean().optional().describe("Whether the spec is public"),
    instructions: z.string().optional().describe("New usage instructions"),
  },
  async ({ id, title, content, type, tags, is_public, instructions }) => {
    try {
      if (!API_TOKEN) {
        return errorResult("SPECLIB_API_TOKEN environment variable is required to update specs.");
      }
      const body = {};
      if (title) body.title = title;
      if (content) body.content = content;
      if (type) body.type = type;
      if (tags) body.tags = tags;
      if (is_public !== undefined) body.isPublic = is_public;
      if (instructions !== undefined) body.instructions = instructions;

      const spec = await apiFetch(`/api/specs/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(spec, null, 2) }],
      };
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

// --- Resources ---

server.resource(
  "spec",
  new ResourceTemplate("spec://{scope}/{slug}", { list: undefined }),
  { mimeType: "text/markdown" },
  async (uri, variables) => {
    const { scope, slug } = variables;
    const content = await apiFetch(`/api/specs/${encodeURIComponent(scope)}/${encodeURIComponent(slug)}`);
    return {
      contents: [{ uri: uri.href, text: content, mimeType: "text/markdown" }],
    };
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`speclib-mcp server running (API: ${API_URL})`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
