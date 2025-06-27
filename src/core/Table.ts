import {
  GenericId,
  ObjectType,
  v,
  VObject,
  type Validator,
} from 'convex/values'
import type {
  Constraint,
  TableWithConstraints,
  TypeSafeConstraints,
  UniqueConstraint,
  RelationConstraint,
  IndexConstraint,
  NotNullConstraint,
  DefaultConstraint,
  DeleteAction,
  ConstraintToIndexMap,
} from './types.js'
import { getAutoIndexFields, getRelationConstraints } from './constraints.js'
import {
  defineTable,
  Expand,
  GenericTableIndexes,
  TableDefinition,
} from 'convex/server'

/**
 * Enhanced Table function that extends convex-helpers Table with SQL-like constraints
 *
 * @param name The table name
 * @param fields Table fields as you'd pass to defineTable
 * @returns Enhanced table object with constraint support
 */
export function Table<
  T extends Record<string, Validator<any, any, any>>,
  TableName extends string
>(name: TableName, fields: T): TableWithConstraintsBuilder<T, TableName> {
  return new TableWithConstraintsBuilder(name, fields)
}


class TableWithConstraintsBuilder<
  T extends Record<string, Validator<any, any, any>>,
  TableName extends string,
  Indexes extends GenericTableIndexes = {}
> {
  private _constraints: Constraint[] = []
  private table: TableDefinition<VObject<ObjectType<T>, T>, Indexes>
  private _id: Validator<GenericId<TableName>>
  private systemFields: Record<string, Validator<any, any, any>>
  private withSystemFields: Expand<T & typeof this.systemFields>
  constructor(public readonly name: TableName, public readonly fields: T) {
    this.table = defineTable(fields)
    this._id = v.id(name)
    this.systemFields = {
      _id: this._id,
      _creationTime: v.number(),
    }

    this.withSystemFields = {
      ...fields,
      ...this.systemFields,
    } as Expand<T & typeof this.systemFields>
  }

  /**
   * Add constraints to the table with type safety
   */
  constraints(
    constraintsFn: (c: TypeSafeConstraints<T, TableName>) => Constraint[]
  ): TableWithConstraints<T, TableName> {
    // Create type-safe constraint builders
    const constraintBuilders = this.createConstraintBuilders()

    // Call the function with type-safe builders
    this._constraints = constraintsFn(constraintBuilders)

    type Indexes = ConstraintToIndexMap<typeof this._constraints>

    // Validate constraints
    this.validateConstraints()

    // Create table with auto-generated indexes
    const tableWithIndexes: TableDefinition<
      VObject<ObjectType<T>, T>,
      Indexes
    > = this.addAutoIndexes()

    return {
      name: this.name,
      table: tableWithIndexes,
      constraints: this._constraints,
      fields: this.fields,
      // Pass through all convex-helpers properties
      doc: this.withSystemFields,
      withSystemFields: this.withSystemFields,
      withoutSystemFields: this.fields,
      systemFields: this.systemFields,
      _id: this._id,
    }
  }

  /**
   * Create type-safe constraint builders for this table
   */
  private createConstraintBuilders(): TypeSafeConstraints<T, TableName> {
    return {
      unique: (field: keyof T & string): UniqueConstraint => ({
        type: 'unique',
        field,
      }),

      relation: <TargetTable extends TableWithConstraints<any, any>>(
        field: keyof T & string,
        targetTable: TargetTable,
        options?: {
          onDelete?: DeleteAction
          onUpdate?: DeleteAction
        }
      ): RelationConstraint => ({
        type: 'relation',
        field,
        targetTable: targetTable.name,
        onDelete: options?.onDelete,
        onUpdate: options?.onUpdate,
      }),

      index: (
        fields: [keyof T & string, ...(keyof T & string)[]],
        name: string
      ): IndexConstraint => ({
        type: 'index',
        fields,
        name,
      }),

      notNull: (field: keyof T & string): NotNullConstraint => ({
        type: 'notNull',
        field,
      }),

      default: (field: keyof T & string, value: any): DefaultConstraint => ({
        type: 'default',
        field,
        value,
      }),
    }
  }

  /**
   * Add auto-generated indexes for constraints
   */
  private addAutoIndexes() {
    let table = this.table

    for (const constraint of this._constraints) {
      switch (constraint.type) {
        case 'unique':
          // Add unique index
          table = table.index(`sql_unique_${constraint.field}_idx`, [
            constraint.field,
          ])
          break

        case 'relation':
          // Add index for foreign key
          table = table.index(`sql_rel_${constraint.field}_idx`, [
            constraint.field,
          ])
          break

        case 'index':
          // Add explicit index
          const fields = constraint.fields
          const indexName = constraint.name
          if (fields.length === 0) {
            throw new Error(
              `Index must have at least one field in table '${this.name}'`
            )
          }
          table = table.index(indexName, fields)
          break
      }
    }

    return table
  }

  /**
   * Validate that constraints reference valid fields
   */
  private validateConstraints(): void {
    const fieldNames = Object.keys(this.fields)

    for (const constraint of this._constraints) {
      switch (constraint.type) {
        case 'unique':
        case 'notNull':
        case 'default':
        case 'relation':
          if (!fieldNames.includes(constraint.field)) {
            throw new Error(
              `Constraint field '${constraint.field}' does not exist in table '${this.name}'. ` +
                `Available fields: ${fieldNames.join(', ')}`
            )
          }
          break
        case 'index': {
          const indexFields =
            typeof constraint.fields === 'string'
              ? [constraint.fields]
              : constraint.fields

          for (const field of indexFields) {
            if (!fieldNames.includes(field)) {
              throw new Error(
                `Index field '${field}' does not exist in table '${this.name}'. ` +
                  `Available fields: ${fieldNames.join(', ')}`
              )
            }
          }
          break
        }
      }
    }
  }

  /**
   * Get all fields that should have auto-generated indexes
   */
  getAutoIndexFields(): string[] {
    return getAutoIndexFields(this._constraints)
  }

  /**
   * Get all relation constraints for this table
   */
  getRelations(): Array<{
    field: string
    targetTable: string
    onDelete?: string
    onUpdate?: string
  }> {
    return getRelationConstraints(this._constraints).map((rel) => ({
      field: rel.field,
      targetTable: rel.targetTable,
      onDelete: rel.onDelete,
      onUpdate: rel.onUpdate,
    }))
  }
}

// Export helper functions for working with enhanced tables
export function isTableWithConstraints<
  T extends Record<string, Validator<any, any, any>>
>(table: any): table is TableWithConstraints<T, string> {
  return table && typeof table === 'object' && 'constraints' in table
}

export function getTableConstraints<T extends TableWithConstraints<any, any>>(
  table: T
): Constraint[] {
  return table.constraints
}

export function getTableAutoIndexes<T extends TableWithConstraints<any, any>>(
  table: T
): string[] {
  return getAutoIndexFields(table.constraints)
}
