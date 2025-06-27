import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type {
  SchemaMetadata,
  TableMetadata,
  RelationConstraint,
  UniqueConstraint,
  IndexConstraint,
  GeneratedConstraintCode
} from "../core/types.js";

/**
 * Generates TypeScript code for constraints, indexes, and validation
 */
export class CodeGenerator {
  constructor(private schema: SchemaMetadata) {}

  /**
   * Generate all constraint-related code
   */
  generateAll(): GeneratedConstraintCode {
    return {
      validationFunctions: "", // No longer needed
      indexDefinitions: "",     // No longer needed
      relationHelpers: "",      // No longer needed
      mutationWrappers: this.generateDbWrapper(),
    };
  }


  /**
   * Generate the database wrapper that intercepts insert/replace/delete operations
   */
  generateDbWrapper(): string {
    const tableConstraints = this.generateTableConstraintsMap();
    const insertLogic = this.generateInsertLogic();
    const replaceLogic = this.generateReplaceLogic();
    const deleteLogic = this.generateDeleteLogic();

    return `import { customMutation, customCtx } from "convex-helpers/server/customFunctions";
import { DataModel, TableNames } from "../_generated/dataModel";

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
const TABLE_CONSTRAINTS: TableConstraints = ${tableConstraints};

// Validation helper functions
${this.generateConstraintHelpers()}

/**
 * Database wrapper that enforces constraints on insert, replace, and delete operations
 */
function wrapDb(ctx: any, db: any) {
  return {
    ...db,

    /**
     * Insert with constraint validation
     */
    insert: async (table: string, value: any) => {
${insertLogic}
      return await db.insert(table, value);
    },

    /**
     * Replace (upsert) with constraint validation
     */
    replace: async (id: string, value: any) => {
${replaceLogic}
      return await db.replace(id, value);
    },

    /**
     * Delete with cascade/restrict handling
     */
    delete: async (id: string) => {
${deleteLogic}
      return await db.delete(id);
    },
  };
}

/**
 * Create a mutation wrapper that injects the wrapped db
 */
export function createMutationWithConstraints(rawMutation: any) {
  return customMutation(
    rawMutation,
    customCtx(async (ctx: any) => ({
      db: wrapDb(ctx, ctx.db),
    }))
  );
}

/**
 * Create a query wrapper that injects the wrapped db (queries don't need constraint enforcement but for consistency)
 */
export function createQueryWithConstraints(rawQuery: any) {
  return rawQuery; // Queries don't need constraint enforcement, just pass through
}

/**
 * Export constraint-enforced mutation and query functions
 * Use these instead of importing from _generated/server
 */
export function withConstraints(rawMutation: any, rawQuery: any) {
  return {
    mutation: createMutationWithConstraints(rawMutation),
    query: createQueryWithConstraints(rawQuery),
  };
}`;
  }

  private generateTableConstraintsMap(): string {
    const constraintsMap: Record<string, any> = {};

    for (const [tableName, table] of Object.entries(this.schema.tables)) {
      constraintsMap[tableName] = {
        unique: table.constraints.filter(c => c.type === "unique").map(c => (c as UniqueConstraint).field),
        relations: table.constraints.filter(c => c.type === "relation").map(c => {
          const rel = c as RelationConstraint;
          return {
            field: rel.field,
            targetTable: rel.targetTable,
            onDelete: rel.onDelete || "restrict",
            onUpdate: rel.onUpdate || "restrict"
          };
        })
      };
    }

    return JSON.stringify(constraintsMap, null, 2) + " as const";
  }

  private generateConstraintHelpers(): string {
    return `
// Helper to validate unique constraints
async function validateUniqueConstraints<T extends TableNames>(
  ctx: any,
  table: T,
  data: Partial<DataModel[T]["document"]>,
  excludeId?: string
) {
  const constraints = TABLE_CONSTRAINTS[table];
  if (!constraints || !constraints.unique.length) return;

  for (const field of constraints.unique) {
    const fieldValue = data[field];
    if (fieldValue !== undefined) {
      const existing = await ctx.db
        .query(table)
        .withIndex(field as string, (q: any) => q.eq(field as string, fieldValue))
        .first();

      if (existing && (!excludeId || existing._id !== excludeId)) {
        throw new Error(\`Unique constraint violation: \${String(field)} '\${fieldValue}' already exists in \${table}\`);
      }
    }
  }
}

// Helper to validate relation constraints
async function validateRelationConstraints<T extends TableNames>(
  ctx: any,
  table: T,
  data: Partial<DataModel[T]["document"]>
) {
  const constraints = TABLE_CONSTRAINTS[table];
  if (!constraints || !constraints.relations.length) return;

  for (const relation of constraints.relations) {
    const value = data[relation.field];
    if (value) {
      const target = await ctx.db.get(value);
      if (!target) {
        throw new Error(\`Foreign key constraint violation: \${relation.targetTable} with id '\${value}' does not exist\`);
      }
    }
  }
}

// Helper to handle cascade/restrict on delete
async function handleDeleteConstraints(ctx: any, targetTable: TableNames, targetId: string) {
  // Find all tables that reference this record
  for (const [sourceTable, constraints] of Object.entries(TABLE_CONSTRAINTS) as Array<[TableNames, TableConstraints[TableNames]]>) {
    if (!constraints.relations.length) continue;

    for (const relation of constraints.relations) {
      if (relation.targetTable === targetTable) {
        const relatedRecords = await ctx.db
          .query(sourceTable)
          .withIndex(\`\${String(relation.field)}_idx\`, (q: any) => q.eq(String(relation.field), targetId))
          .collect();

        if (relatedRecords.length === 0) continue;

        switch (relation.onDelete) {
          case "cascade":
            // Delete all related records (this will recursively handle cascades)
            for (const record of relatedRecords) {
              await ctx.db.delete(record._id);
            }
            break;

          case "restrict":
            // Prevent deletion if related records exist
            throw new Error(\`Cannot delete: \${relatedRecords.length} related \${sourceTable} record(s) exist\`);

          case "setNull":
            // Set foreign key to null
            for (const record of relatedRecords) {
              await ctx.db.patch(record._id, { [relation.field]: null });
            }
            break;

          default:
            // Default behavior is restrict
            throw new Error(\`Cannot delete: \${relatedRecords.length} related \${sourceTable} record(s) exist\`);
        }
      }
    }
  }
}

// Helper to get table name from document ID
function getTableFromId(id: string): TableNames {
  // Extract table name from Convex ID format
  const parts = id.split('|');
  return parts[0] as TableNames || '' as TableNames;
}`;
  }

  private generateInsertLogic(): string {
    return `      // Validate constraints before insert
      await validateUniqueConstraints(ctx, table as TableNames, value);
      await validateRelationConstraints(ctx, table as TableNames, value);`;
  }

  private generateReplaceLogic(): string {
    return `      // Get the table name from the ID
      const table = getTableFromId(id);

      // For replace operations, we need to exclude the current record from unique checks
      await validateUniqueConstraints(ctx, table, value, id);
      await validateRelationConstraints(ctx, table, value);`;
  }

  private generateDeleteLogic(): string {
    return `      // Get the table name from the ID
      const table = getTableFromId(id);

      // Handle cascade/restrict constraints before delete
      await handleDeleteConstraints(ctx, table, id);`;
  }

  private capitalize(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

/**
 * Generate constraint code from schema metadata
 */
export function generateConstraintCode(schema: SchemaMetadata): GeneratedConstraintCode {
  const generator = new CodeGenerator(schema);
  return generator.generateAll();
}

/**
 * Write generated code to files
 */
export function writeGeneratedCode(
  code: GeneratedConstraintCode,
  outputDir: string
): void {
  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }

  // Write only the database wrapper
  writeFileSync(
    join(outputDir, 'db.ts'),
    `// Auto-generated database wrapper with constraints\n// Do not edit manually\n\n${code.mutationWrappers}`
  );
}