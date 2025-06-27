import type { ObjectType, VObject, Validator } from 'convex/values'
import { TableDefinition, defineTable } from 'convex/server'
import type { Table as ConvexHelpersTable } from 'convex-helpers/server'

// Base constraint types
export type ConstraintType =
  | 'unique'
  | 'relation'
  | 'index'
  | 'composite'
  | 'notNull'
  | 'default'

export type DeleteAction = 'cascade' | 'restrict' | 'setNull' | 'setDefault'

// Individual constraint definitions
export interface UniqueConstraint {
  type: 'unique'
  field: string
}

export interface RelationConstraint {
  type: 'relation'
  field: string
  targetTable: string
  onDelete?: DeleteAction
  onUpdate?: DeleteAction
}

export type IndexConstraint<
  Fields extends string = string,
  IndexName extends string = string
> = {
  type: 'index'
  fields: [Fields, ...Fields[]]
  name: IndexName
}

export type ConstraintToIndexMap<Cs extends readonly Constraint[]> = {
  [C in Cs[number] as C extends IndexConstraint<any, infer IndexName>
    ? IndexName
    : never]: C extends IndexConstraint<infer Fields, any>
    ? [...Fields[], '_id'] // convex auto-appends _id for tiebreaker
    : never
}

export interface NotNullConstraint {
  type: 'notNull'
  field: string
}

export interface DefaultConstraint {
  type: 'default'
  field: string
  value: any
}

export type Constraint =
  | UniqueConstraint
  | RelationConstraint
  | IndexConstraint
  | NotNullConstraint
  | DefaultConstraint

// Enhanced table definition that includes constraints
export interface TableWithConstraints<
  T extends Record<string, Validator<any, any, any>>,
  TableName extends string
> {
  name: TableName
  table: TableDefinition<VObject<ObjectType<T>, T>>
  constraints: Constraint[]
  fields: T
  // Re-export convex-helpers Table properties
  doc: ReturnType<typeof ConvexHelpersTable>['doc']
  withSystemFields: ReturnType<typeof ConvexHelpersTable>['withSystemFields']
  withoutSystemFields: ReturnType<
    typeof ConvexHelpersTable
  >['withoutSystemFields']
  systemFields: ReturnType<typeof ConvexHelpersTable>['systemFields']
  _id: ReturnType<typeof ConvexHelpersTable>['_id']
}

// Metadata extracted from schema parsing
export interface TableMetadata {
  name: string
  fields: Record<string, any>
  constraints: Constraint[]
  autoIndexes: string[] // Fields that get auto-indexes from relations
}

export interface SchemaMetadata {
  tables: Record<string, TableMetadata>
  relations: RelationConstraint[]
}

// Generated code interfaces
export interface GeneratedConstraintCode {
  validationFunctions: string
  indexDefinitions: string
  relationHelpers: string
  mutationWrappers: string
}

// Type-safe constraint builders
export interface TypeSafeConstraints<
  T extends Record<string, any>,
  _TableName extends string = string
> {
  unique: (field: keyof T & string) => UniqueConstraint
  relation: <TargetTable extends TableWithConstraints<any, any>>(
    field: keyof T & string,
    targetTable: TargetTable,
    options?: {
      onDelete?: DeleteAction
      onUpdate?: DeleteAction
    }
  ) => RelationConstraint
  index: (
    fields: [keyof T & string, ...(keyof T & string)[]],
    name: string
  ) => IndexConstraint
  notNull: (field: keyof T & string) => NotNullConstraint
  default: (field: keyof T & string, value: any) => DefaultConstraint
}
