// Example of how to use the generated DB wrapper

// 1. First, define your schema using convex-sql
// convex/schema.ts
import { defineSchema } from "convex/server";
import { v } from "convex/values";
import { Table, unique, relation, index } from "convex-sql";

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
}).constraints([
  relation('userId', Users, { onDelete: 'cascade' }),
  index(['userId', 'title']),
]);

export default defineSchema({
  users: Users.table,
  posts: Posts.table,
});

// 2. Generate the constraint code
// Run: npx convex-sql generate

// 3. Use the generated DB wrapper in your functions
// convex/users.ts
import { v } from "convex/values";
import { 
  mutation as rawMutation, 
  query as rawQuery 
} from "./_generated/server";
import { withConstraints } from "./_sql/db";

// Create constraint-enforced mutation and query functions
const { mutation, query } = withConstraints(rawMutation, rawQuery);

export const createUser = mutation({
  args: {
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // The DB wrapper automatically validates constraints:
    // - Email uniqueness will be enforced
    // - No foreign key validation needed for users table
    return await ctx.db.insert("users", args);
  },
});

export const createPost = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // The DB wrapper automatically validates:
    // - Foreign key constraint (userId must exist in users table)
    // - Creates auto-index on userId field
    return await ctx.db.insert("posts", args);
  },
});

export const updateUser = mutation({
  args: {
    id: v.id("users"),
    email: v.optional(v.string()),
    name: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { id, ...updates } = args;
    
    // The DB wrapper handles:
    // - Email uniqueness validation (excluding current record)
    return await ctx.db.replace(id, updates);
  },
});

export const deleteUser = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    // The DB wrapper automatically handles:
    // - Cascade delete all posts by this user (due to onDelete: 'cascade')
    await ctx.db.delete(args.id);
  },
});

export const getUser = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    // Queries don't need constraint enforcement
    return await ctx.db.get(args.id);
  },
});

// 4. Alternative: Use the wrapper functions directly if you prefer
// convex/posts.ts
import { v } from "convex/values";
import { mutation as rawMutation } from "./_generated/server";
import { createMutationWithConstraints } from "./_sql/db";

const mutation = createMutationWithConstraints(rawMutation);

export const createPost = mutation({
  args: {
    title: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // All constraint enforcement happens automatically in ctx.db
    return await ctx.db.insert("posts", args);
  },
});

/*
Generated constraint behavior:

1. Insert operations:
   - Validates unique constraints (e.g., email uniqueness)
   - Validates foreign key constraints (e.g., userId exists)
   
2. Replace/Update operations:
   - Validates unique constraints (excluding current record)
   - Validates foreign key constraints for updated fields
   
3. Delete operations:
   - Handles cascade deletes (deletes related records)
   - Handles restrict deletes (prevents deletion if related records exist)
   - Handles setNull (sets foreign keys to null)

4. Auto-generated indexes:
   - users.email (unique index)
   - users.name (regular index)
   - posts.userId (auto-generated from relation)
   - posts.[userId, title] (composite index)

5. Error examples:
   - Insert user with duplicate email: "Unique constraint violation: email 'test@example.com' already exists in users"
   - Insert post with invalid userId: "Foreign key constraint violation: users with id 'invalid-id' does not exist"
   - Delete user with posts (if restrict): "Cannot delete: 3 related posts record(s) exist"
*/