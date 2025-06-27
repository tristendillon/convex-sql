// Example showing the separated package structure

// ========================================
// 1. In your schema file (Convex environment)
// ========================================
// convex/schema.ts
import { defineSchema } from 'convex/server'
import { v } from 'convex/values'
// ✅ Safe import - no Node.js dependencies
import { Table, unique, relation, index } from 'convex-sql'

const Users = Table('users', {
  email: v.string(),
  name: v.string(),
}).constraints((c) => [unique('email'), index(['name'], 'name_idx')])

const Posts = Table('posts', {
  title: v.string(),
  userId: v.id('users'),
}).constraints((c) => [relation('userId', Users, { onDelete: 'cascade' })])

export default defineSchema({
  users: Users.table,
  posts: Posts.table,
})

// ========================================
// 2. In your Convex functions (Convex environment)
// ========================================
// convex/users.ts
import { v } from 'convex/values'
import {
  mutation as rawMutation,
  query as rawQuery,
} from '../_generated/server'
// ✅ Safe import - no Node.js dependencies
import { withConstraints } from '../_sql/db'

const { mutation, query } = withConstraints(rawMutation, rawQuery)

export const createUser = mutation({
  args: { email: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    // ✅ All constraints enforced automatically
    return await ctx.db.insert('users', args)
  },
})

// ========================================
// 3. In build scripts or CLI (Node.js environment)
// ========================================
// scripts/generate-constraints.js (or package.json scripts)
import {
  parseSchemaFile,
  generateConstraintCode,
  writeGeneratedCode,
} from 'convex-sql/generator' // ✅ Separate entry point for Node.js APIs

async function generateConstraints() {
  const schema = parseSchemaFile('./convex/schema.ts')
  const code = generateConstraintCode(schema)
  writeGeneratedCode(code, './convex/_sql')
}

generateConstraints()

// ========================================
// 4. CLI usage (Node.js environment)
// ========================================
// ✅ CLI automatically uses the generator entry point
// npx convex-sql generate
// npx convex-sql watch

/*
Package structure:

convex-sql/
├── dist/
│   ├── index.js        # Core functionality (Convex-safe)
│   ├── index.d.ts
│   ├── generator.js    # Node.js APIs only
│   ├── generator.d.ts
│   └── cli.js         # CLI entry point
└── package.json

Exports:
- "convex-sql" → Core functionality (Table, constraints, runtime)
- "convex-sql/generator" → Node.js APIs (parsing, codegen, file operations)

Benefits:
✅ No Node.js imports in Convex functions
✅ Clean separation of concerns
✅ CLI and build scripts can still use full functionality
✅ Type safety maintained across all entry points
✅ Bundle size optimized for each use case
*/
