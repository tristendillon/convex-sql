import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import type {
  SchemaMetadata,
  TableMetadata,
  RelationConstraint,
  UniqueConstraint,
} from '../core/types.js'

/**
 * Generates TypeScript code for constraints, indexes, and validation
 */
export class CodeGenerator {
  constructor(private schema: SchemaMetadata) {}

  generateTableConstraintsMap(): string {
    const tableConstraints: Record<string, any> = {}

    // Build constraints for each table using export keys
    for (const [variableName, table] of Object.entries(this.schema.tables)) {
      const exportKey = table.exportKey || table.name

      // Extract unique constraints
      const uniqueConstraints = table.constraints
        .filter((c) => c.type === 'unique')
        .map((c) => c.field)

      // Extract relation constraints
      const relationConstraints = table.constraints
        .filter((c) => c.type === 'relation')
        .map((c) => {
          // For TS we just add this even though it will never happen
          if (c.type !== 'relation') {
            return undefined
          }
          return {
            field: c.field,
            targetTable: c.targetTable,
            targetField: c.targetField,
            onDelete: c.onDelete || 'restrict',
            onUpdate: c.onUpdate || 'restrict',
          }
        })

      tableConstraints[exportKey] = {
        unique: uniqueConstraints,
        relations: relationConstraints,
      }
    }

    return `
    const TABLE_CONSTRAINTS: TableConstraints = ${JSON.stringify(
      tableConstraints,
      null,
      2
    )};
    `
  }

  /**
   * Generate the database wrapper that intercepts insert/replace/delete operations
   */
  generateDbWrapper(): string {
    const tableConstraintsCode = this.generateTableConstraintsMap()

    const importCode = `
    import {
  customMutation,
  customCtx,
} from 'convex-helpers/server/customFunctions'
import { DataModel, Doc, Id, TableNames } from '../_generated/dataModel'
import { MutationCtx, QueryCtx } from '../_generated/server'
import {
  DocumentByName,
  FunctionVisibility,
  GenericDatabaseWriter,
  MutationBuilder,
  QueryBuilder,
  TableNamesInDataModel,
  WithOptionalSystemFields,
  WithoutSystemFields,
} from 'convex/server'
import { GenericId } from 'convex/values'
import { DeleteAction } from 'convex-sql'
    `

    const tableConstraintsType = `
type TableConstraints = {
  [T in TableNames]?: {
    unique?: Array<keyof WithoutSystemFields<Doc<T>>>
    relations?: Array<
      {
        field: keyof WithoutSystemFields<Doc<T>>
      } & {
        targetTable: TableNames
        targetField?: keyof WithoutSystemFields<Doc<any>>
        onDelete?: DeleteAction
        onUpdate?: DeleteAction
      }
    >
  }
}
    `
    const staticWrapperCode = `
    // STATIC WRAPPER CODE... WILL NOT BE REGENERATED EVERY TIME.

// Validation helper functions
// Helper to validate unique constraints
async function validateUniqueConstraints<T extends TableNames>(
  ctx: QueryCtx,
  table: T,
  data: Partial<WithoutSystemFields<Doc<T>>>,
  excludeId?: Id<T>
) {
  const constraints = TABLE_CONSTRAINTS[table]
  if (!constraints || !constraints.unique?.length) return

  for (const field of constraints.unique) {
    const fieldValue = data[field]
    if (fieldValue !== undefined) {
      const existing = await ctx.db
        .query(table)
        .withIndex(\`convex_sql_\${String(field)}\`, (q) =>
          q.eq(String(field), fieldValue)
        )
        .first()

      if (existing && (!excludeId || existing._id !== excludeId)) {
        throw new Error(
          \`Unique constraint violation: \$\{String(field)\} '\$\{fieldValue\}' already exists in \$\{table\}\`
        )
      }
    }
  }
}

// Helper to validate relation constraints
async function validateRelationConstraints<T extends TableNames>(
  ctx: QueryCtx,
  table: T,
  data: Partial<WithoutSystemFields<Doc<T>>>
) {
  const constraints = TABLE_CONSTRAINTS[table]
  if (!constraints || !constraints.relations?.length) return

  for (const relation of constraints.relations) {
    const value = data[relation.field]

    // if the target field is not set, related field is the _id of the table
    if (!relation.targetField) {
      const target = await ctx.db.get(value as unknown as Id<T>)
      if (!target) {
        throw new Error(
          \`Foreign key constraint violation: \$\{relation.targetTable\} with id '\$\{value\}' does not exist\`
        )
      }
    } else {
      const idxName = \`convex_sql_\${String(relation.targetField)}\`
      console.log(idxName)
      console.log(relation)
      const target = await ctx.db
        .query(relation.targetTable)
        .withIndex(idxName as any, (q) =>
          q.eq(String(relation.targetField), value)
        )
        .first()
      if (!target) {
        throw new Error(
          \`Foreign key constraint violation: \$\{relation.targetTable\} with id '\$\{value\}' does not exist\`
        )
      }
    }
  }
}

// Helper to handle cascade/restrict on delete
async function handleDeleteConstraints<T extends TableNames>(
  ctx: MutationCtx,
  targetTable: T,
  targetId: Id<T>
) {
  // Find all tables that reference this record
  for (const [sourceTable, constraints] of Object.entries(TABLE_CONSTRAINTS)) {
    if (!constraints?.relations?.length) continue

    for (const relation of constraints.relations) {
      let relatedRecords: Doc<T>[] = []
      if (relation.targetField) {
        const target = await ctx.db.get(targetId as unknown as Id<T>)
        if (!target) {
          throw new Error(\`Item to delete does not exist\`)
        }
        const targetValue = target[relation.targetField]
        const idxName = \`convex_sql_\${String(relation.field)}\`
        relatedRecords = await ctx.db
          .query(sourceTable as any)
          .withIndex(idxName as any, (q) =>
            q.eq(String(relation.field), targetValue)
          )
          .collect()
      } else if (relation.targetTable === targetTable) {
        const idxName = \`convex_sql_\${String(relation.field)}\`
        relatedRecords = await ctx.db
          .query(sourceTable as any)
          .withIndex(idxName as any, (q) =>
            q.eq(String(relation.field), targetId)
          )
          .collect()
      }
      if (relatedRecords.length === 0) continue

      switch (relation.onDelete) {
        case 'cascade':
          // Delete all related records (this will recursively handle cascades)
          for (const record of relatedRecords) {
            await ctx.db.delete(record._id)
          }
          throw new Error(
            \`Cannot delete: \$\{relatedRecords.length\} related \$\{sourceTable\} record(s) exist\`
          )

        case 'restrict':
          // Prevent deletion if related records exist
          throw new Error(
            \`Cannot delete: \$\{relatedRecords.length\} related \$\{sourceTable\} record(s) exist\`
          )

        case 'setNull':
          // Set foreign key to optional field must be of v.optional()
          for (const record of relatedRecords) {
            await ctx.db.patch(record._id, {
              [relation.field]: undefined,
            } as any)
          }
          break

        default:
          // Default behavior is restrict
          throw new Error(
            \`Cannot delete: \$\{relatedRecords.length\} related \$\{sourceTable\} record(s) exist\`
          )
      }
    }
  }
}

/**
 * Database wrapper that enforces constraints on insert, replace, and delete operations
 */
function wrapDb(ctx: MutationCtx, db: GenericDatabaseWriter<DataModel>) {
  return {
    ...db,

    /**
     * Insert with constraint validation
     */
    insert: async <TableName extends TableNamesInDataModel<DataModel>>(
      table: TableName,
      value: WithoutSystemFields<DocumentByName<DataModel, TableName>>
    ): Promise<{
      data: GenericId<TableName> | null
      error: string | null
    }> => {
      // Validate constraints before insert
      try {
        await validateUniqueConstraints(ctx, table, value)
        await validateRelationConstraints(ctx, table, value)
        const result = await db.insert(table, value)
        return {
          data: result,
          error: null,
        }
      } catch (error) {
        return {
          data: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    },

    /**
     * Replace (upsert) with constraint validation
     */
    replace: async <TableName extends TableNamesInDataModel<DataModel>>(
      id: GenericId<TableName>,
      value: WithOptionalSystemFields<DocumentByName<DataModel, TableName>>
    ): Promise<{
      data: GenericId<TableName> | null
      error: string | null
    }> => {
      // Get the table name from the ID
      const table = id.__tableName

      // For replace operations, we need to exclude the current record from unique checks
      try {
        await validateUniqueConstraints(ctx, table, value, id)
        await validateRelationConstraints(ctx, table, value)
        await db.replace(id, value)
        return {
          data: id,
          error: null,
        }
      } catch (error) {
        return {
          data: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    },

    /**
     * Delete with cascade/restrict handling
     */
    delete: async (
      table: TableNamesInDataModel<DataModel>,
      id: GenericId<TableNamesInDataModel<DataModel>>
    ): Promise<{
      data: GenericId<TableNamesInDataModel<DataModel>> | null
      error: string | null
    }> => {
      // Handle cascade/restrict constraints before delete
      try {
        await handleDeleteConstraints(ctx, table, id)
        await db.delete(id)
        return { data: id, error: null }
      } catch (error) {
        return {
          data: null,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    },
  }
}

/**
 * Create a mutation wrapper that injects the wrapped db
 */
export function createMutationWithConstraints<
  Visibility extends FunctionVisibility,
>(rawMutation: MutationBuilder<DataModel, Visibility>) {
  return customMutation(
    rawMutation,
    customCtx(async (ctx) => ({
      db: wrapDb(ctx, ctx.db),
    }))
  )
}

/**
 * Export constraint-enforced mutation and query functions
 * Use these instead of importing from _generated/server
 */
export function withConstraints<Visibility extends FunctionVisibility>(
  rawMutation: MutationBuilder<DataModel, Visibility>,
  rawQuery: QueryBuilder<DataModel, Visibility>
) {
  return {
    mutation: createMutationWithConstraints(rawMutation),
    query: rawQuery,
  }
}

    `

    return `
    ${importCode}
    ${tableConstraintsType}
    ${tableConstraintsCode}
    ${staticWrapperCode}
    `
  }
}

export function generateConstraintCode(schema: SchemaMetadata): string {
  const generator = new CodeGenerator(schema)
  return generator.generateDbWrapper()
}

/**
 * Write generated code to files
 */
export function writeGeneratedCode(code: string, outputDir: string): void {
  // Ensure output directory exists
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  // Write only the database wrapper
  writeFileSync(
    join(outputDir, 'db.ts'),
    `// Auto-generated database wrapper with constraints\n// Do not edit manually\n\n${code}`
  )
}
