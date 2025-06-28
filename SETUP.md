# Development Setup

This guide explains how to set up convex-sql for local development using a monorepo approach.

## Quick Setup

### 1. Create a fake monorepo structure

```bash
# Create your workspace directory
mkdir my-workspace
cd my-workspace

# Create your app folder
mkdir app
cd app
# Initialize your Convex app here...
```

### 2. Clone convex-sql alongside your app

```bash
# From your workspace root (not inside app/)
cd ..
git clone https://github.com/tristendillon/convex-sql.git
cd convex-sql
npm build
# or
pnpm build
```

Your directory structure should look like:

```
my-workspace/
├── app/           # Your Convex application
└── convex-sql/    # This package
```

### 3. Link the package in your app

In your app's `package.json`, add:

```json
{
  "dependencies": {
    "convex-sql": "link:../convex-sql"
  }
}
```

Then install dependencies:

```bash
cd app
npm install
# or
pnpm install
```

### 4. Use CLI commands

Now you can use the CLI commands from your app directory:

```bash
# Generate constraint code
pnpm exec convex-sql generate

# Watch for schema changes
pnpm exec convex-sql watch

# Validate your schema
pnpm exec convex-sql validate
```

Or with npm:

```bash
npm exec convex-sql generate
```

## Development Workflow

1. Make changes to convex-sql source code
2. Build the package: `cd ../convex-sql && npm run build`
3. Test in your app: `cd ../app && pnpm exec convex-sql generate`

## Troubleshooting

- If you get "command not found", make sure you built convex-sql: `npm run build`
- If changes aren't reflected, try rebuilding convex-sql and reinstalling in your app
- Use `pnpm exec` or `npm exec` to ensure you're using the linked version
