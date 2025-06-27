// Runtime constraint enforcement exports
export {
  ConstraintEnforcer,
  withConstraints,
  createInsertWithConstraints,
  createUpdateWithConstraints,
  createDeleteWithConstraints
} from './constraints.js';

// Re-export types that might be needed at runtime
export type { Constraint, DeleteAction } from '../core/types.js';