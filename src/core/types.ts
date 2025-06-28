import type { ObjectType, VObject, Validator } from 'convex/values'
import {
  SearchIndexConfig,
  TableDefinition,
  VectorIndexConfig,
  defineTable,
} from 'convex/server'
import type { Table as ConvexHelpersTable } from 'convex-helpers/server'
import { TableDefinitionWithConstraints } from './Table'

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

export interface RelationConstraint<TableName extends string = string> {
  type: 'relation'
  field: string
  targetTable: TableName
  onDelete?: DeleteAction
  onUpdate?: DeleteAction
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
  | NotNullConstraint
  | DefaultConstraint

// Type-safe constraint builders interface
export interface TypeSafeConstraints<FieldPaths extends string> {
  unique: (field: FieldPaths) => UniqueConstraint
  relation: <
    TargetTable extends TableDefinitionWithConstraints<any, any, any, any, any>
  >(
    field: FieldPaths,
    targetTable: TargetTable,
    options?: {
      onDelete?: DeleteAction
      onUpdate?: DeleteAction
    }
  ) => RelationConstraint
  notNull: (field: FieldPaths) => NotNullConstraint
  default: (field: FieldPaths, value: any) => DefaultConstraint
}

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
  name: string // The actual table name from Table('name', ...)
  variableName?: string // The variable name (e.g., 'Users' from const Users = Table(...))
  exportKey?: string // The key used in defineSchema export (e.g., 'users' from { users: Users.toConvexTable() })
  fields: Record<string, any>
  constraints: Constraint[]
  autoIndexes: string[] // Fields that get auto-indexes from relations
}

export interface SchemaMetadata {
  tables: Record<string, TableMetadata>
  relations: RelationConstraint[]
}
