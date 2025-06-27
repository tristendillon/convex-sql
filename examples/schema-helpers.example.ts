// Example showing how to properly use table definitions in defineSchema

import { defineSchema } from "convex/server";
import { v } from "convex/values";
import { Table, schema, tableEntry } from "convex-sql";

// Define your tables with constraints
const Users = Table('users', {
  email: v.string(),
  name: v.string(),
}).constraints((c) => [
  c.unique('email'),
  c.index(['name'], 'name_idx'),
]);

const Documents = Table('documents', {
  title: v.string(),
  content: v.string(),
  userId: v.id('users'),
}).constraints((c) => [
  c.relation('userId', Users, { onDelete: 'cascade' }),
  c.index(['userId', 'title'], 'user_id_title_idx'),
]);

const Posts = Table('posts', {
  title: v.string(),
  authorId: v.id('users'),
}).constraints((c) => [
  c.relation('authorId', Users, { onDelete: 'cascade' }),
]);

// ========================================
// Method 1: Using the schema() helper (RECOMMENDED)
// ========================================
export default defineSchema(schema(Users, Documents, Posts));

// This generates:
// {
//   users: Users.table,      // ✅ Correct key-value pairs
//   documents: Documents.table,
//   posts: Posts.table,
// }

// ========================================
// Method 2: Using tableEntry() for spreading
// ========================================
export default defineSchema({
  ...tableEntry(Users),      // ✅ Spreads as { users: Users.table }
  ...tableEntry(Documents),  // ✅ Spreads as { documents: Documents.table }
  ...tableEntry(Posts),      // ✅ Spreads as { posts: Posts.table }
});

// ========================================
// Method 3: Manual (what you'd do without helpers)
// ========================================
export default defineSchema({
  users: Users.table,         // ✅ Manual key-value assignment
  documents: Documents.table,
  posts: Posts.table,
});

// ========================================
// ❌ WRONG: Direct spreading (what was happening before)
// ========================================
export default defineSchema({
  ...Users.table,      // ❌ This spreads the table definition object
  ...Documents.table,  // ❌ Not the structure you want
});

/*
The problem with direct spreading:

Users.table is a defineTable() result, which looks like:
{
  validator: {...},
  indexes: [...],
  // other Convex table properties
}

When you spread this directly, you get:
{
  validator: {...},     // ❌ Wrong structure for defineSchema
  indexes: [...],       // ❌ Wrong structure for defineSchema
}

What you want is:
{
  users: Users.table,   // ✅ Table name as key, table definition as value
}

Solutions:

1. schema(Users, Documents, Posts) - Cleanest approach
2. ...tableEntry(Users) - Good for mixing with other tables
3. users: Users.table - Manual but explicit

All generate the same result:
{
  users: Users.table,
  documents: Documents.table,
  posts: Posts.table,
}
*/