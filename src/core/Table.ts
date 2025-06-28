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

/**
 * @internal
 */
export type VectorIndex = {
  indexDescriptor: string
  vectorField: string
  dimensions: number
  filterFields: string[]
}

/**
 * @internal
 */
export type Index = {
  indexDescriptor: string
  fields: string[]
}

/**
 * @internal
 */
export type SearchIndex = {
  indexDescriptor: string
  searchField: string
  filterFields: string[]
}

export class TableDefinitionWithConstraints<
  TableName extends string,
  DocumentType extends Validator<any, any, any> = Validator<any, any, any>,
  Indexes extends GenericTableIndexes = {},
  SearchIndexes extends GenericTableSearchIndexes = {},
  VectorIndexes extends GenericTableVectorIndexes = {}
> {
  private indexes: Index[]
  private searchIndexes: SearchIndex[]
  private vectorIndexes: VectorIndex[]
  // The type of documents stored in this table.
  validator: DocumentType
  private _constraints: Constraint[] = []
  constructor(
    public readonly name: TableName,
    public readonly fields: DocumentType
  ) {
    this.indexes = []
    this.searchIndexes = []
    this.vectorIndexes = []
    this.validator = fields
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
    this.indexes.push({
      indexDescriptor: name,
      fields: fields,
    })
    return this
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
    this.searchIndexes.push({
      indexDescriptor: name,
      searchField: indexConfig.searchField,
      filterFields: indexConfig.filterFields || [],
    })
    return this
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
    this.vectorIndexes.push({
      indexDescriptor: name,
      vectorField: indexConfig.vectorField,
      dimensions: indexConfig.dimensions,
      filterFields: indexConfig.filterFields || [],
    })
    return this
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

  // Make the class act like a TableDefinition when used in schema
  get [Symbol.toStringTag]() {
    return 'TableDefinition'
  }

  export() {
    const documentType = (this.validator as any).json
    if (typeof documentType !== 'object') {
      throw new Error(
        'Invalid validator: please make sure that the parameter of `defineTable` is valid (see https://docs.convex.dev/database/schemas)'
      )
    }

    return {
      indexes: this.indexes,
      searchIndexes: this.searchIndexes,
      vectorIndexes: this.vectorIndexes,
      documentType,
    }
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

      relation: <TargetTable extends string>(
        field: ExtractFieldPaths<DocumentType>,
        targetTable: TargetTable,
        options?: {
          onDelete?: DeleteAction
          onUpdate?: DeleteAction
        }
      ): RelationConstraint => ({
        type: 'relation',
        field: field as string,
        targetTable: targetTable,
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
    for (const constraint of this._constraints) {
      if (
        this.indexes.find(
          (idx) => idx.indexDescriptor === `by_${constraint.field}`
        )
      ) {
        continue
      }
      switch (constraint.type) {
        case 'unique':
          // Add unique index
          this.index(`by_${constraint.field}`, [constraint.field as any]) as any
          break

        case 'relation':
          // Add index for foreign key
          this.index(`by_${constraint.field}`, [constraint.field as any]) as any
          break
        default:
          break
      }
    }

    return this
  }

  /**
   * Validate that constraints reference valid fields
   */
  private validateConstraints(): void {
    let fieldNames: string[] = []

    if (isValidator(this.fields)) {
      // For validator objects, get fields from the type property
      const validator = this.fields as any
      if (validator.type && typeof validator.type === 'object') {
        fieldNames = Object.keys(validator.type)
      } else if (validator.fields) {
        fieldNames = Object.keys(validator.fields)
      }
    } else {
      // For plain objects, get field names directly
      fieldNames = Object.keys(this.fields)
    }

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

  toConvexTable(): TableDefinition<
    DocumentType,
    Indexes,
    SearchIndexes,
    VectorIndexes
  > {
    return this as unknown as TableDefinition<
      DocumentType,
      Indexes,
      SearchIndexes,
      VectorIndexes
    >
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
