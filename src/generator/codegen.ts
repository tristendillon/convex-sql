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

  /**
   * Generate the database wrapper that intercepts insert/replace/delete operations
   */
  generateDbWrapper(): string {
    const tableConstraints = this.generateTableConstraintsMap()
    const insertLogic = this.generateInsertLogic()
    const replaceLogic = this.generateReplaceLogic()
    const deleteLogic = this.generateDeleteLogic()

    return `import {
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
  WithOptionalSystemFields,
  WithoutSystemFields,
} from 'convex/server'

// Type-safe table constraints definition
type TableConstraints = {
  [T in TableNames]: {
    unique: Array<keyof Doc<T> & string>
    relations: Array<{
      field: keyof Doc<T> & string
      targetTable: TableNames
      onDelete?: 'cascade' | 'restrict' | 'setNull' | 'setDefault'
      onUpdate?: 'cascade' | 'restrict' | 'setNull' | 'setDefault'
    }>
  }
}

// Table constraints metadata
const TABLE_CONSTRAINTS: TableConstraints = ${tableConstraints};

// Validation helper functions
${this.generateConstraintHelpers()}

/**
 * Database wrapper that enforces constraints on insert, replace, and delete operations
 */
function wrapDb(ctx: MutationCtx, db: GenericDatabaseWriter<DataModel>) {
  return {
    ...db,

    /**
     * Insert with constraint validation
     */
    insert: async (
      table: TableNames,
      value: WithoutSystemFields<DocumentByName<DataModel, TableNames>>
    ) => {
${insertLogic}
      return await db.insert(table, value)
    },

    /**
     * Replace (upsert) with constraint validation
     */
    replace: async (
      id: Id<TableNames>,
      value: WithOptionalSystemFields<DocumentByName<DataModel, TableNames>>
    ) => {
${replaceLogic}
      return await db.replace(id, value)
    },

    /**
     * Delete with cascade/restrict handling
     */
    delete: async (id: Id<TableNames>) => {
${deleteLogic}
      return await db.delete(id)
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
}`
  }

  private generateTableConstraintsMap(): string {
    const tables = Object.entries(this.schema.tables)
      .map(([tableName, table]) => {
        const uniqueFields = table.constraints
          .filter((c) => c.type === 'unique')
          .map((c) => `'${(c as UniqueConstraint).field}'`)

        const relations = table.constraints
          .filter((c) => c.type === 'relation')
          .map((c) => {
            const rel = c as RelationConstraint
            return `      {
        field: '${rel.field}',
        targetTable: '${rel.targetTable}',
        onDelete: '${rel.onDelete || 'restrict'}',
        onUpdate: '${rel.onUpdate || 'restrict'}',
      }`
          })

        return `  ${tableName}: {
    unique: [${uniqueFields.join(', ')}],
    relations: [${
      relations.length > 0 ? '\n' + relations.join(',\n') + '\n    ' : ''
    }],
  }`
      })
      .join(',\n')

    return `{\n${tables},\n}`
  }

  private generateConstraintHelpers(): string {
    return `// Helper to validate unique constraints
async function validateUniqueConstraints<T extends TableNames>(
  ctx: QueryCtx,
  table: T,
  data: Partial<Doc<T>>,
  excludeId?: Id<T>
) {
  const constraints = TABLE_CONSTRAINTS[table]
  if (!constraints || !constraints.unique.length) return

  for (const field of constraints.unique) {
    const fieldValue = data[field]
    if (fieldValue !== undefined) {
      const existing = await ctx.db
        .query(table)
        .withIndex(\`sql_unique_\$\{field\}_idx\`, (q) => q.eq(field, fieldValue))
        .first()

      if (existing && (!excludeId || existing._id !== excludeId)) {
        throw new Error(
          \`Unique constraint violation: \${String(field)} '\${fieldValue}' already exists in \${table}\`
        )
      }
    }
  }
}

// Helper to validate relation constraints
async function validateRelationConstraints<T extends TableNames>(
  ctx: QueryCtx,
  table: T,
  data: Partial<Doc<T>>
) {
  const constraints = TABLE_CONSTRAINTS[table]
  if (!constraints || !constraints.relations.length) return

  for (const relation of constraints.relations) {
    const value = data[relation.field]
    if (value) {
      const target = await ctx.db.get(value)
      if (!target) {
        throw new Error(
          \`Foreign key constraint violation: \${relation.targetTable} with id '\${value}' does not exist\`
        )
      }
    }
  }
}

// Helper to handle cascade/restrict on delete
async function handleDeleteConstraints(
  ctx: MutationCtx,
  targetTable: TableNames,
  targetId: Id<TableNames>
) {
  // Find all tables that reference this record
  for (const [sourceTable, constraints] of Object.entries(TABLE_CONSTRAINTS)) {
    if (!constraints.relations.length) continue

    for (const relation of constraints.relations) {
      if (relation.targetTable === targetTable) {
        const relatedRecords = await ctx.db
          .query(sourceTable)
          .withIndex(\`sql_rel_\${String(relation.field)}_idx\`, (q) =>
            q.eq(String(relation.field), targetId)
          )
          .collect()

        if (relatedRecords.length === 0) continue

        switch (relation.onDelete) {
          case 'cascade':
            // Delete all related records (this will recursively handle cascades)
            for (const record of relatedRecords) {
              await ctx.db.delete(record._id)
            }
            break

          case 'restrict':
            // Prevent deletion if related records exist
            throw new Error(
              \`Cannot delete: \${relatedRecords.length} related \${sourceTable} record(s) exist\`
            )

          case 'setNull':
            // Set foreign key to null
            for (const record of relatedRecords) {
              await ctx.db.patch(record._id, { [relation.field]: null })
            }
            break

          default:
            // Default behavior is restrict
            throw new Error(
              \`Cannot delete: \${relatedRecords.length} related \${sourceTable} record(s) exist\`
            )
        }
      }
    }
  }
}`
  }

  private generateInsertLogic(): string {
    return `      // Validate constraints before insert
      await validateUniqueConstraints(ctx, table, value)
      await validateRelationConstraints(ctx, table, value)`
  }

  private generateReplaceLogic(): string {
    return `      // Get the table name from the ID
      const table = id.__tableName

      // For replace operations, we need to exclude the current record from unique checks
      await validateUniqueConstraints(ctx, table, value, id)
      await validateRelationConstraints(ctx, table, value)`
  }

  private generateDeleteLogic(): string {
    return `      // Get the table name from the ID
      const table = id.__tableName

      // Handle cascade/restrict constraints before delete
      await handleDeleteConstraints(ctx, table, id)`
  }
}

/**
 * Generate constraint code from schema metadata
 */
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
