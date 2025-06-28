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
} from './core/constraints.js'

// Type exports
export type {
  Constraint,
  ConstraintType,
  DeleteAction,
  UniqueConstraint,
  RelationConstraint,
  NotNullConstraint,
  DefaultConstraint,
  TableWithConstraints,
  TableMetadata,
  SchemaMetadata,
} from './core/types.js'

// Re-export convex-helpers for convenience
export { Table as ConvexHelpersTable } from 'convex-helpers/server'
