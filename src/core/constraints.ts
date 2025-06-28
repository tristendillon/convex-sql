import type {
  Constraint,
  UniqueConstraint,
  RelationConstraint,
} from './types.js'

/**
 * Helper to extract all fields that should have auto-generated indexes
 * This includes:
 * - Fields with unique constraints
 * - Fields with relation constraints
 */
export function getAutoIndexFields(constraints: Constraint[]): string[] {
  const indexFields = new Set<string>()

  for (const constraint of constraints) {
    switch (constraint.type) {
      case 'unique':
        indexFields.add(constraint.field)
        break
      case 'relation':
        indexFields.add(constraint.field)
        break
      default:
        break
    }
  }

  return Array.from(indexFields)
}

/**
 * Helper to get all relation constraints
 */
export function getRelationConstraints(
  constraints: Constraint[]
): RelationConstraint[] {
  return constraints.filter(
    (c): c is RelationConstraint => c.type === 'relation'
  )
}

/**
 * Helper to get all unique constraints
 */
export function getUniqueConstraints(
  constraints: Constraint[]
): UniqueConstraint[] {
  return constraints.filter((c): c is UniqueConstraint => c.type === 'unique')
}
