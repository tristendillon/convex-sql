import {
  ObjectType,
  v,
  VObject,
  type Validator,
  GenericValidator,
} from 'convex/values'
import type {
  Constraint,
  TableWithConstraints,
  UniqueConstraint,
  RelationConstraint,
  NotNullConstraint,
  DefaultConstraint,
  DeleteAction,
  TypeSafeConstraints,
} from './types.js'
import { getAutoIndexFields, getRelationConstraints } from './constraints.js'
import {
  defineTable,
  Expand,
  GenericTableIndexes,
  GenericTableSearchIndexes,
  GenericTableVectorIndexes,
  IndexTiebreakerField,
  SearchIndexConfig,
  SystemFields,
  TableDefinition,
  VectorIndexConfig,
} from 'convex/server'

type ExtractFieldPaths<T extends Validator<any, any, any>> =
  // Add in the system fields available in index definitions.
  // This should be everything except for `_id` because thats added to indexes
  // automatically.
  T['fieldPaths'] | keyof SystemFields

export function isValidator(v: any): v is GenericValidator {
  return !!v.isConvexValidator
}

/**
 * Enhanced Table function that extends convex-helpers Table with SQL-like constraints
 *
 * @param name The table name
 * @param fields Table fields as you'd pass to defineTable
 * @returns Enhanced table object with constraint support
 */
export function Table<
  TableName extends string,
  DocumentSchema extends Validator<Record<string, any>, 'required', any>
>(
  name: TableName,
  documentSchema: DocumentSchema
): TableDefinitionWithConstraints<TableName, DocumentSchema>

export function Table<
  TableName extends string,
  DocumentSchema extends Record<string, Validator<any, any, any>>
>(
  name: TableName,
  documentSchema: DocumentSchema
): TableDefinitionWithConstraints<
  TableName,
  VObject<ObjectType<DocumentSchema>, DocumentSchema>
>

export function Table<
  TableName extends string,
  DocumentSchema extends
    | Validator<Record<string, any>, 'required', any>
    | Record<string, Validator<any, any, any>>
>(
  name: TableName,
  documentSchema: DocumentSchema
): TableDefinitionWithConstraints<TableName, any, any, any, any> {
  if (isValidator(documentSchema)) {
    return new TableDefinitionWithConstraints(name, documentSchema)
  } else {
    return new TableDefinitionWithConstraints(name, v.object(documentSchema))
  }
}

class TableDefinitionWithConstraints<
  TableName extends string,
  DocumentType extends Validator<any, any, any> = Validator<any, any, any>,
  Indexes extends GenericTableIndexes = {},
  SearchIndexes extends GenericTableSearchIndexes = {},
  VectorIndexes extends GenericTableVectorIndexes = {}
> {
  private table: TableDefinition<
    DocumentType,
    Indexes,
    SearchIndexes,
    VectorIndexes
  >
  private _constraints: Constraint[] = []
  constructor(
    public readonly name: TableName,
    public readonly fields: DocumentType
  ) {
    this.table = defineTable(fields as any)
  }

  index<
    IndexName extends string,
    FirstFieldPath extends ExtractFieldPaths<DocumentType>,
    RestFieldPaths extends ExtractFieldPaths<DocumentType>[]
  >(
    name: IndexName,
    fields: [FirstFieldPath, ...RestFieldPaths]
  ): TableDefinitionWithConstraints<
    TableName,
    DocumentType,
    // Update `Indexes` to include the new index and use `Expand` to make the
    // types look pretty in editors.
    Expand<
      Indexes &
        Record<
          IndexName,
          [FirstFieldPath, ...RestFieldPaths, IndexTiebreakerField]
        >
    >,
    SearchIndexes,
    VectorIndexes
  > {
    const newTable = this.table.index(name, fields)
    const newInstance = new TableDefinitionWithConstraints(
      this.name,
      this.fields
    )
    newInstance.table = newTable as any
    newInstance._constraints = [...this._constraints]
    return newInstance as any
  }

  searchIndex<
    IndexName extends string,
    SearchField extends ExtractFieldPaths<DocumentType>,
    FilterFields extends ExtractFieldPaths<DocumentType> = never
  >(
    name: IndexName,
    indexConfig: Expand<SearchIndexConfig<SearchField, FilterFields>>
  ): TableDefinitionWithConstraints<
    TableName,
    DocumentType,
    Indexes,
    // Update `SearchIndexes` to include the new index and use `Expand` to make
    // the types look pretty in editors.
    Expand<
      SearchIndexes &
        Record<
          IndexName,
          {
            searchField: SearchField
            filterFields: FilterFields
          }
        >
    >,
    VectorIndexes
  > {
    const newTable = this.table.searchIndex(name, indexConfig)
    const newInstance = new TableDefinitionWithConstraints(
      this.name,
      this.fields
    )
    newInstance.table = newTable as any
    newInstance._constraints = [...this._constraints]
    return newInstance as any
  }

  vectorIndex<
    IndexName extends string,
    VectorField extends ExtractFieldPaths<DocumentType>,
    FilterFields extends ExtractFieldPaths<DocumentType> = never
  >(
    name: IndexName,
    indexConfig: Expand<VectorIndexConfig<VectorField, FilterFields>>
  ): TableDefinitionWithConstraints<
    TableName,
    DocumentType,
    Indexes,
    SearchIndexes,
    Expand<
      VectorIndexes &
        Record<
          IndexName,
          {
            vectorField: VectorField
            dimensions: number
            filterFields: FilterFields
          }
        >
    >
  > {
    const newTable = this.table.vectorIndex(name, indexConfig)
    const newInstance = new TableDefinitionWithConstraints(
      this.name,
      this.fields
    )
    newInstance.table = newTable as any
    newInstance._constraints = [...this._constraints]
    return newInstance as any
  }

  export() {
    return (this.table as any).export()
  }

  constraints(
    constraintsFn: (
      c: TypeSafeConstraints<ExtractFieldPaths<DocumentType>>
    ) => Constraint[]
  ): TableDefinitionWithConstraints<
    TableName,
    DocumentType,
    Indexes,
    SearchIndexes,
    VectorIndexes
  > {
    const constraintBuilders = this.createConstraintBuilders()
    this._constraints = constraintsFn(constraintBuilders)
    this.validateConstraints()
    return this.addAutoIndexes()
  }

  /**
   * Create type-safe constraint builders for this table
   */
  private createConstraintBuilders(): TypeSafeConstraints<
    ExtractFieldPaths<DocumentType>
  > {
    return {
      unique: (field: ExtractFieldPaths<DocumentType>): UniqueConstraint => ({
        type: 'unique',
        field: field as string,
      }),

      relation: <TargetTable extends TableWithConstraints<any, any>>(
        field: ExtractFieldPaths<DocumentType>,
        targetTable: TargetTable,
        options?: {
          onDelete?: DeleteAction
          onUpdate?: DeleteAction
        }
      ): RelationConstraint => ({
        type: 'relation',
        field: field as string,
        targetTable: targetTable.name,
        onDelete: options?.onDelete,
        onUpdate: options?.onUpdate,
      }),

      notNull: (field: ExtractFieldPaths<DocumentType>): NotNullConstraint => ({
        type: 'notNull',
        field: field as string,
      }),

      default: (
        field: ExtractFieldPaths<DocumentType>,
        value: any
      ): DefaultConstraint => ({
        type: 'default',
        field: field as string,
        value,
      }),
    }
  }

  /**
   * Add auto-generated indexes for constraints
   */
  private addAutoIndexes(): TableDefinitionWithConstraints<
    TableName,
    DocumentType,
    Indexes,
    SearchIndexes,
    VectorIndexes
  > {
    let currentInstance = this

    for (const constraint of this._constraints) {
      switch (constraint.type) {
        case 'unique':
          // Add unique index
          currentInstance = currentInstance.index(
            `sql_unique_${constraint.field}_idx`,
            [constraint.field as any]
          ) as any
          break

        case 'relation':
          // Add index for foreign key
          currentInstance = currentInstance.index(
            `sql_rel_${constraint.field}_idx`,
            [constraint.field as any]
          ) as any
          break
        default:
          break
      }
    }

    return currentInstance
  }

  /**
   * Validate that constraints reference valid fields
   */
  private validateConstraints(): void {
    const fieldNames = Object.keys((this.fields as any).type || this.fields)

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
        default:
          break
      }
    }
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
