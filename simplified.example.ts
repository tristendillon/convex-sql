// Example of the simplified convex-sql architecture

// 1. Schema definition with auto-generated indexes
// convex/schema.ts
import { defineSchema } from "convex/server";
import { v } from "convex/values";
import { Table, unique, relation, index } from "convex-sql";

const Users = Table('users', {
  email: v.string(),
  name: v.string(),
}).constraints([
  unique('email'),    // ✨ Automatically creates unique index on email
  index('name'),      // ✨ Creates regular index on name
]);

const Posts = Table('posts', {
  title: v.string(),
  content: v.string(),
  userId: v.id('users'),
}).constraints([
  relation('userId', Users, { onDelete: 'cascade' }), // ✨ Auto-creates index on userId
  index(['userId', 'title']),  // ✨ Composite index
]);

export default defineSchema({
  users: Users.table,  // ✨ Table already includes all indexes
  posts: Posts.table,  // ✨ Table already includes all indexes
});

// 2. Generate only the DB wrapper
// Run: npx convex-sql generate --output convex/_sql

// 3. Generated file: convex/_sql/db.ts
/*
import { customMutation, customCtx } from "convex-helpers/server/customFunctions";
import { DataModel, TableNames } from "./dataModel";

// Type-safe table constraints definition
type TableConstraints = {
  [T in TableNames]: {
    unique: Array<keyof DataModel[T]["document"]>;
    relations: Array<{
      field: keyof DataModel[T]["document"];
      targetTable: TableNames;
      onDelete?: "cascade" | "restrict" | "setNull" | "setDefault";
      onUpdate?: "cascade" | "restrict" | "setNull" | "setDefault";
    }>;
  };
};

// Table constraints metadata
const TABLE_CONSTRAINTS: TableConstraints = {
  "users": {
    "unique": ["email"],
    "relations": []
  },
  "posts": {
    "unique": [],
    "relations": [
      {
        "field": "userId",
        "targetTable": "users",
        "onDelete": "cascade",
        "onUpdate": "restrict"
      }
    ]
  }
} as const;

// All constraint logic is handled here...
function wrapDb(ctx: any, db: any) { ... }

export function withConstraints(rawMutation: any, rawQuery: any) {
  return {
    mutation: createMutationWithConstraints(rawMutation),
    query: createQueryWithConstraints(rawQuery),
  };
}
*/

// 4. Use in your functions
// convex/users.ts
import { v } from "convex/values";
import { 
  mutation as rawMutation, 
  query as rawQuery 
} from "./_generated/server";
import { withConstraints } from "./_sql/db";

const { mutation, query } = withConstraints(rawMutation, rawQuery);

export const createUser = mutation({
  args: {
    email: v.string(),
    name: v.string(),
  },
  handler: async (ctx, args) => {
    // ✨ All constraints enforced automatically:
    // - Email uniqueness validated
    // - Uses the auto-generated unique index on email
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
    // ✨ All constraints enforced automatically:
    // - Foreign key validation (userId must exist)
    // - Uses the auto-generated index on userId for fast lookup
    return await ctx.db.insert("posts", args);
  },
});

export const deleteUser = mutation({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    // ✨ Cascade delete automatically handled:
    // - All posts by this user will be deleted first
    // - Uses the auto-generated index on posts.userId for fast cascade
    await ctx.db.delete(args.id);
  },
});

/*
Benefits of the simplified architecture:

1. ✅ Single generated file (db.ts) instead of multiple files
2. ✅ Indexes automatically generated and included in table definitions
3. ✅ Type-safe constraint definitions using DataModel
4. ✅ All constraint logic centralized in the DB wrapper
5. ✅ Clean integration - just wrap your mutation/query functions
6. ✅ No need to manually import validators or relation helpers
7. ✅ Automatic constraint enforcement on all DB operations

Generated artifacts:
- Only convex/_sql/db.ts (no more validators.ts, relations.ts, indexes.ts)
- Table definitions automatically include all necessary indexes
- Type-safe constraint metadata with full IntelliSense support
*/