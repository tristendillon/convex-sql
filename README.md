# Convex-SQL

SQL-like constraints and relations for Convex with automatic index generation and constraint enforcement.

## Features

- 🔗 **SQL-like Relations**: Define foreign keys with cascade/restrict behavior
- 🔒 **Unique Constraints**: Enforce uniqueness across your data
- 📊 **Auto-generated Indexes**: Automatically create indexes for relations and unique fields
- 🛡️ **Runtime Validation**: Constraint enforcement at the database level
- 🔄 **Live Code Generation**: Watch your schema and auto-generate constraint code
- 📝 **TypeScript Support**: Full type safety for your constraints

## Quick Start

### 1. Installation

```bash
npm install convex-sql
```

### 2. Update your schema

```typescript
// convex/schema.ts
import { defineSchema } from "convex/server";
import { v } from "convex/values";
import { Table, unique, relation, index } from "convex-sql";

const Users = Table('users', {
  email: v.string(),
  name: v.string(),
}).constraints([
  unique('email'),         // Creates unique index on email
  index('name'),          // Creates index on name for search
]);

const Posts = Table('posts', {
  title: v.string(),
  content: v.string(),
  userId: v.id('users'),  // Auto-creates index on userId
}).constraints([
  relation('userId', Users, { onDelete: 'cascade' }),
  index(['title', 'userId'])  // Composite index
]);

export default defineSchema({
  users: Users.table,
  posts: Posts.table,
});
```

### 3. Generate constraint code

```bash
# One-time generation
npx convex-sql generate

# Watch mode (regenerates on schema changes)
npx convex-sql watch
```

### 4. Use generated constraints in your functions

```typescript
// convex/posts.ts
import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { validateUsersEmailUnique, validatePostsUserIdRelation } from "./_sql/validators";

export const createPost = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Constraint validation happens automatically
    await validatePostsUserIdRelation(ctx, args.userId);
    
    return await ctx.db.insert("posts", args);
  },
});
```

## API Reference

### Table Function

Enhanced version of convex-helpers Table with constraint support:

```typescript
const MyTable = Table('tableName', {
  field1: v.string(),
  field2: v.number(),
}).constraints([
  // Add constraints here
]);
```

### Constraint Types

#### `unique(field)`
Creates a unique constraint and index on the specified field.

```typescript
unique('email')  // Email must be unique across all records
```

#### `relation(field, targetTable, options?)`
Creates a foreign key relationship with automatic index generation.

```typescript
relation('userId', Users, { onDelete: 'cascade' })
relation('categoryId', 'categories', { onDelete: 'restrict' })
```

**Options:**
- `onDelete`: `'cascade'` | `'restrict'` | `'setNull'` | `'setDefault'`
- `onUpdate`: `'cascade'` | `'restrict'` | `'setNull'` | `'setDefault'`

#### `index(fields, name?)`
Creates an index on one or more fields.

```typescript
index('name')                    // Simple index
index(['userId', 'createdAt'])   // Composite index
index('status', 'status_idx')    // Named index
```

### CLI Commands

#### `convex-sql generate`
Generate constraint code from your schema file.

```bash
convex-sql generate --schema convex/schema.ts --output convex/_sql
```

#### `convex-sql watch`
Watch your schema file and regenerate code on changes.

```bash
convex-sql watch --schema convex/schema.ts --output convex/_sql
```

#### `convex-sql validate`
Validate your schema without generating code.

```bash
convex-sql validate --schema convex/schema.ts
```

#### `convex-sql init`
Initialize convex-sql in your project.

```bash
convex-sql init
```

## Auto-Generated Files

The CLI generates the following files:

- `validators.ts` - Constraint validation functions
- `indexes.ts` - Index definitions for your schema
- `relations.ts` - Helper functions for navigating relations
- `mutations.ts` - Mutation wrappers with constraint enforcement

## Examples

### Blog Schema

```typescript
const Users = Table('users', {
  email: v.string(),
  name: v.string(),
}).constraints([
  unique('email'),
  index('name'),
]);

const Posts = Table('posts', {
  title: v.string(),
  content: v.string(),
  userId: v.id('users'),
  categoryId: v.id('categories'),
  status: v.union(v.literal("draft"), v.literal("published")),
}).constraints([
  relation('userId', Users, { onDelete: 'cascade' }),
  relation('categoryId', 'categories', { onDelete: 'restrict' }),
  index(['userId', 'status']),
  index('categoryId'),
]);
```

This automatically creates:
- Unique index on `users.email`
- Index on `users.name`
- Index on `posts.userId` (from relation)
- Index on `posts.categoryId` (from relation)
- Composite index on `[posts.userId, posts.status]`

### Constraint Enforcement

```typescript
// Deleting a user will cascade delete their posts
await deleteUserWithConstraints(ctx, { id: userId });

// Trying to delete a category with posts will throw an error
await deleteCategoryWithConstraints(ctx, { id: categoryId }); // Error!

// Inserting a post with invalid userId will throw an error
await createPostWithConstraints(ctx, { 
  title: "Test",
  userId: "invalid-id"  // Error: User does not exist
});
```

## License

MIT