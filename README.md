# speclib-mcp

MCP server for searching and retrieving [SpecLib](https://github.com/rang501/speclib) specs. Allows AI agents to discover and read specifications via the [Model Context Protocol](https://modelcontextprotocol.io).

## Tools

| Tool | Description |
|------|-------------|
| `search_specs` | Search specs by query, scope, and/or content type |
| `get_spec` | Get full spec content by ID or scope/slug |
| `list_scopes` | List all available scopes |
| `get_recipe` | Get a recipe with its bundled specs |

## Resources

| URI | Description |
|-----|-------------|
| `spec://{scope}/{slug}` | Read a spec as markdown |

## Usage

### One-liner

```bash
npx github:rang501/speclib-mcp
```

### Claude Code

Add to your MCP settings (`.mcp.json` or project config):

```json
{
  "mcpServers": {
    "speclib": {
      "command": "npx",
      "args": ["-y", "github:rang501/speclib-mcp"],
      "env": {
        "SPECLIB_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "speclib": {
      "command": "npx",
      "args": ["-y", "github:rang501/speclib-mcp"],
      "env": {
        "SPECLIB_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

### Local development

```bash
git clone https://github.com/rang501/speclib-mcp.git
cd speclib-mcp
npm install
node index.mjs
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `SPECLIB_API_URL` | `http://localhost:3000` | SpecLib instance URL |

## Requirements

- Node.js >= 20
- A running SpecLib instance (public specs are accessible without authentication)
