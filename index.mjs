#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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

function errorResult(message) {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

function jsonResult(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

// --- Server ---

const server = new McpServer({
  name: "speclib-mcp",
  version: "2.0.0",
});

// --- Spec Tools ---

server.tool(
  "search_specs",
  "Search for specs. Returns summaries with parsed tags. Use get_spec to retrieve full content.",
  {
    query: z.string().optional().describe("Search query - matches against title, tags, and content"),
  },
  async ({ query }) => {
    try {
      let specs = await apiFetch("/api/specs");

      if (query) {
        const q = query.toLowerCase();
        specs = specs.filter((spec) => {
          if (spec.title.toLowerCase().includes(q)) return true;
          const tags = parseTags(spec.tags);
          if (tags.some((tag) => tag.toLowerCase().includes(q))) return true;
          if (spec.specIdentifier && spec.specIdentifier.toLowerCase().includes(q)) return true;
          if (spec.content && spec.content.toLowerCase().includes(q)) return true;
          return false;
        });
      }

      const results = specs.map((spec) => ({
        id: spec.id,
        title: spec.title,
        specIdentifier: spec.specIdentifier,
        tags: parseTags(spec.tags),
        isPublic: spec.isPublic,
        userEmail: spec.userEmail,
        createdAt: spec.createdAt,
        updatedAt: spec.updatedAt,
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
  "Get the full spec by its numeric ID, including the frontmatter+body content.",
  {
    id: z.number().int().positive().describe("Spec ID"),
  },
  async ({ id }) => {
    try {
      const spec = await apiFetch(`/api/specs/${id}`);
      return jsonResult({
        ...spec,
        tags: parseTags(spec.tags),
      });
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

server.tool(
  "resolve_spec",
  "Resolve a spec by its identifier (e.g. drupal.module.create). Returns the raw markdown content (frontmatter+body). Only works for public specs.",
  {
    identifier: z.string().describe("Spec identifier using dot notation, e.g. drupal.module.create"),
  },
  async ({ identifier }) => {
    try {
      // The resolve endpoint uses path segments: drupal.module.create -> resolve/drupal/module/create
      const path = identifier.replace(/\./g, "/");
      const data = await apiFetch(`/api/specs/resolve/${path}`);
      return {
        content: [{ type: "text", text: String(data) }],
      };
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

server.tool(
  "create_spec",
  "Create a new spec. Content must be a full frontmatter+body markdown document. The frontmatter must include at minimum: schema (spec/v1), id (dot-separated identifier), title, and version. Requires SPECLIB_API_TOKEN.",
  {
    content: z.string().min(1).max(150000).describe(
      "Full spec document with YAML frontmatter and markdown body, e.g.:\n---\nschema: spec/v1\nid: my.example.spec\nversion: 1.0.0\ntitle: My Example Spec\n---\n\nBody content here..."
    ),
  },
  async ({ content }) => {
    try {
      if (!API_TOKEN) {
        return errorResult("SPECLIB_API_TOKEN environment variable is required to create specs.");
      }
      const spec = await apiFetch("/api/specs", {
        method: "POST",
        body: JSON.stringify({ content }),
      });
      return jsonResult(spec);
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

server.tool(
  "update_spec",
  "Update an existing spec. Content must be a full frontmatter+body markdown document replacing the entire spec. If you are not the owner, this creates a pending revision for the owner to review. Requires SPECLIB_API_TOKEN.",
  {
    id: z.number().int().positive().describe("Spec ID to update"),
    content: z.string().min(1).max(150000).describe("Full replacement spec document with YAML frontmatter and markdown body"),
  },
  async ({ id, content }) => {
    try {
      if (!API_TOKEN) {
        return errorResult("SPECLIB_API_TOKEN environment variable is required to update specs.");
      }
      const spec = await apiFetch(`/api/specs/${id}`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      });
      return jsonResult(spec);
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

server.tool(
  "fork_spec",
  "Fork a spec into your own private copy. The forked spec gets visibility set to private and your email as author. Requires SPECLIB_API_TOKEN.",
  { id: z.number().int().positive().describe("Spec ID to fork") },
  async ({ id }) => {
    try {
      if (!API_TOKEN) {
        return errorResult("SPECLIB_API_TOKEN environment variable is required to fork specs.");
      }
      const spec = await apiFetch(`/api/specs/${id}/fork`, { method: "POST" });
      return jsonResult(spec);
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

// --- Recipe Tools ---

server.tool(
  "list_recipes",
  "List all recipes. Returns public recipes and, if authenticated, your private recipes.",
  {},
  async () => {
    try {
      const recipes = await apiFetch("/api/recipes");
      return jsonResult(recipes);
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

server.tool(
  "get_recipe",
  "Get a recipe by ID, including its linked specs with full content.",
  {
    id: z.number().int().positive().describe("Recipe ID"),
  },
  async ({ id }) => {
    try {
      const recipe = await apiFetch(`/api/recipes/${id}`);
      return jsonResult(recipe);
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

server.tool(
  "create_recipe",
  "Create a new recipe. A recipe bundles multiple specs together with an optional recipe-level spec/instructions. Requires SPECLIB_API_TOKEN.",
  {
    name: z.string().min(1).max(200).describe("Recipe name"),
    description: z.string().max(2000).optional().describe("Short description of the recipe"),
    spec: z.string().max(50000).optional().describe("Recipe-level spec/instructions content"),
    isPublic: z.boolean().default(true).describe("Whether the recipe is public"),
    specIds: z.array(z.number().int().positive()).max(100).default([]).describe("Array of spec IDs to include in this recipe"),
  },
  async (args) => {
    try {
      if (!API_TOKEN) {
        return errorResult("SPECLIB_API_TOKEN environment variable is required to create recipes.");
      }
      const recipe = await apiFetch("/api/recipes", {
        method: "POST",
        body: JSON.stringify(args),
      });
      return jsonResult(recipe);
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

server.tool(
  "update_recipe",
  "Update an existing recipe. If you are not the owner, this creates a pending revision for the owner to review. Requires SPECLIB_API_TOKEN.",
  {
    id: z.number().int().positive().describe("Recipe ID to update"),
    name: z.string().min(1).max(200).describe("Recipe name"),
    description: z.string().max(2000).optional().describe("Short description of the recipe"),
    spec: z.string().max(50000).optional().describe("Recipe-level spec/instructions content"),
    isPublic: z.boolean().optional().describe("Whether the recipe is public"),
    specIds: z.array(z.number().int().positive()).max(100).optional().describe("Array of spec IDs to include in this recipe"),
  },
  async ({ id, ...rest }) => {
    try {
      if (!API_TOKEN) {
        return errorResult("SPECLIB_API_TOKEN environment variable is required to update recipes.");
      }
      const recipe = await apiFetch(`/api/recipes/${id}`, {
        method: "PUT",
        body: JSON.stringify(rest),
      });
      return jsonResult(recipe);
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

// --- Scope Tools ---

server.tool(
  "list_scopes",
  "List all available scopes (categories for organizing specs).",
  {},
  async () => {
    try {
      const scopes = await apiFetch("/api/scopes");
      return jsonResult(scopes);
    } catch (err) {
      return errorResult(err.message);
    }
  }
);

// --- Resources ---

server.resource(
  "spec",
  "spec://{identifier}",
  { mimeType: "text/markdown", description: "Resolve a spec by its dot-notation identifier" },
  async (uri, variables) => {
    const { identifier } = variables;
    const path = identifier.replace(/\./g, "/");
    const content = await apiFetch(`/api/specs/resolve/${path}`);
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
