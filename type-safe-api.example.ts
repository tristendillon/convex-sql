// Example showing the new type-safe constraint API

import { defineSchema } from "convex/server";
import { v } from "convex/values";
import { Table } from "convex-sql";

// 1. Define tables with type-safe constraints
const Users = Table('users', {
  email: v.string(),
  name: v.string(),
  age: v.number(),
}).constraints((c) => [
  c.unique('email'),    // ✅ Type-safe: only 'email', 'name', 'age' allowed
  c.index('name'),      // ✅ Type-safe: IntelliSense shows available fields
  c.index(['name', 'age'])  // ✅ Type-safe: composite index with field validation
]);

const Posts = Table('posts', {
  title: v.string(),
  content: v.string(),
  userId: v.id('users'),
  categoryId: v.optional(v.id('categories')),
}).constraints((c) => [
  c.relation('userId', Users, { onDelete: 'cascade' }),        // ✅ Uses table name from Users
  c.relation('categoryId', Categories, { onDelete: 'restrict' }), // ✅ References table object
  c.index(['userId', 'title']),  // ✅ Type-safe composite index
  c.notNull('title'),           // ✅ Type-safe field validation
]);

const Categories = Table('categories', {
  name: v.string(),
  slug: v.string(),
}).constraints((c) => [
  c.unique('name'),     // ✅ Type-safe: only 'name', 'slug' allowed
  c.unique('slug'),     // ✅ Multiple unique constraints
  c.default('slug', '')  // ✅ Type-safe default value
]);

export default defineSchema({
  users: Users.table,     // ✅ Auto-generated indexes included
  posts: Posts.table,     // ✅ Auto-generated indexes included
  categories: Categories.table, // ✅ Auto-generated indexes included
});

/*
✅ Type Safety Benefits:

1. Field Name Validation:
   c.unique('invalid_field')  // ❌ TypeScript error: field doesn't exist
   c.unique('email')          // ✅ Valid: email exists in Users table

2. Relation Table References:
   c.relation('userId', 'invalid_table')  // ❌ TypeScript error: must use table object
   c.relation('userId', Users)            // ✅ Valid: uses actual table reference

3. IntelliSense Support:
   c.unique('...')  // ✅ Auto-complete shows: 'email', 'name', 'age'
   c.index(['...']) // ✅ Auto-complete for composite indexes

4. Composite Index Validation:
   c.index(['userId', 'invalid_field'])  // ❌ TypeScript error
   c.index(['userId', 'title'])          // ✅ Valid fields

5. Consistent API:
   - All constraint functions are type-safe
   - Relation target tables are validated at compile time
   - No string-based table name references in relations

Generated Schema Features:
- users.email (unique index)
- users.name (regular index)  
- posts.userId_idx (auto-generated from relation)
- posts.categoryId_idx (auto-generated from relation)
- posts.[userId, title] (composite index)
- categories.name (unique index)
- categories.slug (unique index)

Constraint Enforcement:
- Email uniqueness enforced across users
- Foreign key validation for userId → users
- Foreign key validation for categoryId → categories  
- Cascade delete: deleting user deletes their posts
- Restrict delete: cannot delete category if posts exist
*/