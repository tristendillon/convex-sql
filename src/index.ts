// Core exports
export {
  Table,
  isTableWithConstraints,
  getTableConstraints,
  getTableAutoIndexes,
} from './core/Table.js'
export {
  getAutoIndexFields,
  getRelationConstraints,
  getUniqueConstraints,
  getExplicitIndexConstraints,
} from './core/constraints.js'

// Type exports
export type {
  Constraint,
  ConstraintType,
  DeleteAction,
  UniqueConstraint,
  RelationConstraint,
  IndexConstraint,
  NotNullConstraint,
  DefaultConstraint,
  TableWithConstraints,
  TableMetadata,
  SchemaMetadata,
  GeneratedConstraintCode,
} from './core/types.js'

// Re-export convex-helpers for convenience
export { Table as ConvexHelpersTable } from 'convex-helpers/server'
