import type { Validator } from 'convex/values'
import { SystemFields } from 'convex/server'
import { TableDefinitionWithConstraints } from './Table'

export type ExtractFieldPaths<T extends Validator<any, any, any>> =
  // Add in the system fields available in index definitions.
  // This should be everything except for `_id` because thats added to indexes
  // automatically.
  T['fieldPaths'] | keyof SystemFields

// Base constraint types
export type DeleteAction = 'cascade' | 'restrict' | 'setNull' | 'setDefault'

// Individual constraint definitions
export interface UniqueConstraint {
  type: 'unique'
  field: string
}

export interface RelationConstraint {
  type: 'relation'
  field: string
  targetTable: TableDefinitionWithConstraints<any, any, any, any, any>
  targetField?: string
  onDelete?: DeleteAction
  onUpdate?: DeleteAction
}

// Separate type for relation constraint meta for parsing since the parsing cant actually have the object
export interface RelationConstraintMeta<TargetTable extends string = string> {
  type: 'relation'
  field: string
  targetTable: TargetTable
  targetField?: string
  onDelete?: DeleteAction
  onUpdate?: DeleteAction
}

export type Default = string | number | boolean
export type DefaultValue = (() => Default) | Default

export interface DefaultConstraint {
  type: 'default'
  field: string
  value: DefaultValue
}

export type Constraint =
  | UniqueConstraint
  | RelationConstraint
  | DefaultConstraint

export type ConstrainMeta =
  | RelationConstraintMeta
  | UniqueConstraint
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
      targetField?: ExtractFieldPaths<TargetTable['fields']>
      onDelete?: DeleteAction
      onUpdate?: DeleteAction
    }
  ) => RelationConstraint
  default: (field: FieldPaths, value: DefaultValue) => DefaultConstraint
}

// Metadata extracted from schema parsing
export interface TableMetadata {
  name: string // The actual table name from Table('name', ...)
  variableName?: string // The variable name (e.g., 'Users' from const Users = Table(...))
  exportKey?: string // The key used in defineSchema export (e.g., 'users' from { users: Users.toConvexTable() })
  fields: Record<string, any>
  constraints: ConstrainMeta[]
  autoIndexes: string[] // Fields that get auto-indexes from relations
}

export interface SchemaMetadata {
  tables: Record<string, TableMetadata>
  relations: RelationConstraintMeta[]
}
