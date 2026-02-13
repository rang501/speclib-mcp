# speclib-mcp

MCP server for searching, retrieving, and creating [SpecLib](https://github.com/rang501/speclib) specs. Allows AI agents to discover, read, and write specifications via the [Model Context Protocol](https://modelcontextprotocol.io).

## Tools

| Tool | Description |
|------|-------------|
| `search_specs` | Search specs by query, scope, and/or content type |
| `get_spec` | Get full spec content by ID or scope/slug |
| `list_scopes` | List all available scopes |
| `get_recipe` | Get a recipe with its bundled specs |
| `create_spec` | Create a new spec (requires API token) |
| `update_spec` | Update an existing spec (requires API token) |

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
        "SPECLIB_API_URL": "http://localhost:3000",
        "SPECLIB_API_TOKEN": "your-api-token"
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
        "SPECLIB_API_URL": "http://localhost:3000",
        "SPECLIB_API_TOKEN": "your-api-token"
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
| `SPECLIB_API_TOKEN` | _(none)_ | API token for write operations (generate in Account > API Tokens) |

## Authentication

Reading public specs works without authentication. To create or update specs, you need an API token:

1. Log in to your SpecLib instance
2. Go to **Account** > **API Tokens**
3. Create a new token and copy it
4. Set it as `SPECLIB_API_TOKEN` in your MCP client config

Tokens that have not been used for over a year are automatically expired.

## Requirements

- Node.js >= 20
- A running SpecLib instance
