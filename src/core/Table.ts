import {
  ObjectType,
  v,
  VObject,
  type Validator,
  GenericValidator,
} from 'convex/values'
import type {
  Constraint,
  UniqueConstraint,
  RelationConstraint,
  NotNullConstraint,
  DefaultConstraint,
  DeleteAction,
  TypeSafeConstraints,
} from './types.js'
import {
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
 * @example
 * ```ts
 * const users = Table("users", {
 *   name: v.string(),
 *   email: v.string(),
 *   age: v.number()
 * }).constraints(c => [
 *   c.unique("email"), // Add unique constraint on email
 *   c.notNull("name"), // Name cannot be null
 *   c.default("age", 18), // Default age to 18
 *   c.relation("userId", Users, { // Add foreign key relation
 *     onDelete: "restrict"
 *   })
 * ])
 * ```
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

/**
 * A table definition with constraints and indexes.
 *
 * This class extends Convex's table definition to add support for:
 * - SQL-like constraints (unique, foreign key, etc.)
 * - Automatic index generation based on constraints
 *
 * Create a new table definition using the {@link Table} function.
 *
 * @typeParam TableName - The name of the table in convex
 * @typeParam DocumentType - The validator type for documents in this table
 * @typeParam Indexes - Type information about indexes on this table
 * @typeParam SearchIndexes - Type information about search indexes
 * @typeParam VectorIndexes - Type information about vector indexes
 */

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

  /**
   * Add an index to the table.
   *
   * This method is equivalent to the index method in Convex's TableDefinition.
   * It allows you to create an index on one or more fields to optimize queries.
   *
   * @param name - The name of the index
   * @param fields - Array of field paths to index
   * @returns The table definition with the new index
   */
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

  /**
   * Add a search index to the table.
   *
   * This method is equivalent to the searchIndex method in Convex's TableDefinition.
   * It creates a search index on a text field to enable full-text search queries.
   *
   * @param name - The name of the search index
   * @param indexConfig - Configuration object specifying the search field and optional filter fields
   * @returns The table definition with the new search index
   */
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

  /**
   * Add a vector index to the table.
   *
   * This method is equivalent to the vectorIndex method in Convex's TableDefinition.
   * It creates a vector index to enable similarity search on vector embeddings.
   *
   * @param name - The name of the vector index
   * @param indexConfig - Configuration object specifying the vector field, dimensions and optional filter fields
   * @returns The table definition with the new vector index
   */
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

  /**
   * Add constraints to the table
   * @param constraintsFn - A function that returns an array of constraints
   * @returns The table definition with constraints
   */
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

  /**
   * Export the table definition
   * @returns The table definition
   */

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

      relation: <
        TargetTable extends TableDefinitionWithConstraints<
          any,
          any,
          any,
          any,
          any
        >
      >(
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
    for (const constraint of this._constraints) {
      if (
        this.indexes.find(
          (idx) => idx.indexDescriptor === `convex_sql_${constraint.field}`
        )
      ) {
        continue
      }
      switch (constraint.type) {
        case 'unique':
          // Add unique index
          this.index(`convex_sql_${constraint.field}`, [
            constraint.field as any,
          ]) as any
          break

        case 'relation':
          // Add index for foreign key
          this.index(`convex_sql_${constraint.field}`, [
            constraint.field as any,
          ]) as any
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
}
