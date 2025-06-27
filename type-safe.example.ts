// Example of the generated type-safe DB wrapper

// Generated db.ts will look like this:
import { customMutation, customCtx } from "convex-helpers/server/customFunctions";
import { DataModel, TableNames } from "../dataModel";

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

// Table constraints metadata (example for a users/posts schema)
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

// Type-safe validation functions
async function validateUniqueConstraints<T extends TableNames>(
  ctx: any, 
  table: T, 
  data: Partial<DataModel[T]["document"]>, 
  excludeId?: string
) {
  const constraints = TABLE_CONSTRAINTS[table];
  if (!constraints || !constraints.unique.length) return;

  for (const field of constraints.unique) {
    const fieldValue = data[field]; // ✅ Type-safe field access
    if (fieldValue !== undefined) {
      const existing = await ctx.db
        .query(table)  // ✅ Type-safe table name
        .withIndex(field as string, (q: any) => q.eq(field as string, fieldValue))
        .first();
        
      if (existing && (!excludeId || existing._id !== excludeId)) {
        throw new Error(`Unique constraint violation: ${String(field)} '${fieldValue}' already exists in ${table}`);
      }
    }
  }
}

async function validateRelationConstraints<T extends TableNames>(
  ctx: any, 
  table: T, 
  data: Partial<DataModel[T]["document"]>
) {
  const constraints = TABLE_CONSTRAINTS[table];
  if (!constraints || !constraints.relations.length) return;

  for (const relation of constraints.relations) {
    const value = data[relation.field]; // ✅ Type-safe field access
    if (value) {
      const target = await ctx.db.get(value);
      if (!target) {
        throw new Error(`Foreign key constraint violation: ${relation.targetTable} with id '${value}' does not exist`);
      }
    }
  }
}

// Benefits of this type-safe approach:

// 1. ✅ Field names are validated at compile time
//    TABLE_CONSTRAINTS.users.unique = ["invalid_field"] // ❌ TypeScript error

// 2. ✅ Table names are validated at compile time
//    TABLE_CONSTRAINTS.invalid_table // ❌ TypeScript error

// 3. ✅ Relation target tables are validated
//    relation.targetTable = "invalid_table" // ❌ TypeScript error

// 4. ✅ Auto-completion works for all field names
//    data[relation.field] // ✅ Auto-complete shows actual field names

// 5. ✅ Type inference works throughout the constraint system
//    validateUniqueConstraints(ctx, "users", userData) // ✅ userData typed as Partial<User>

/*
This ensures that:
- All constraint definitions match your actual schema
- Refactoring table/field names will cause TypeScript errors if constraints aren't updated
- IDE auto-completion works for all constraint-related code
- Runtime errors are caught at compile time where possible
*/