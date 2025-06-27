import type { 
  Constraint,
  UniqueConstraint,
  RelationConstraint,
  IndexConstraint,
  NotNullConstraint,
  DefaultConstraint,
  DeleteAction,
  TableWithConstraints
} from "./types.js";

/**
 * Create a unique constraint on a field
 * Automatically creates a unique index
 */
export function unique(field: string): UniqueConstraint {
  return {
    type: "unique",
    field,
  };
}

/**
 * Create a relation constraint with foreign key behavior
 * Automatically creates an index on the foreign key field
 */
export function relation<T extends TableWithConstraints<any, any>>(
  field: string,
  targetTable: T | string,
  options?: {
    onDelete?: DeleteAction;
    onUpdate?: DeleteAction;
  }
): RelationConstraint {
  const targetTableName = typeof targetTable === 'string' 
    ? targetTable 
    : targetTable.name;

  return {
    type: "relation",
    field,
    targetTable: targetTableName,
    onDelete: options?.onDelete,
    onUpdate: options?.onUpdate,
  };
}

/**
 * Create an index on one or more fields
 */
export function index(
  fields: string | string[], 
  name?: string
): IndexConstraint {
  return {
    type: "index",
    fields,
    name,
  };
}

/**
 * Mark a field as not null (for validation)
 */
export function notNull(field: string): NotNullConstraint {
  return {
    type: "notNull",
    field,
  };
}

/**
 * Set a default value for a field
 */
export function defaultValue(field: string, value: any): DefaultConstraint {
  return {
    type: "default",
    field,
    value,
  };
}

// Convenience exports
export const constraints = {
  unique,
  relation,
  index,
  notNull,
  default: defaultValue,
};

/**
 * Helper to extract all fields that should have auto-generated indexes
 * This includes:
 * - Fields with unique constraints
 * - Fields with relation constraints
 */
export function getAutoIndexFields(constraints: Constraint[]): string[] {
  const indexFields = new Set<string>();
  
  for (const constraint of constraints) {
    switch (constraint.type) {
      case "unique":
        indexFields.add(constraint.field);
        break;
      case "relation":
        indexFields.add(constraint.field);
        break;
      case "index":
        if (typeof constraint.fields === "string") {
          indexFields.add(constraint.fields);
        } else {
          // For composite indexes, we don't add individual fields to auto-index
          // as they're explicitly defined
        }
        break;
    }
  }
  
  return Array.from(indexFields);
}

/**
 * Helper to get all relation constraints
 */
export function getRelationConstraints(constraints: Constraint[]): RelationConstraint[] {
  return constraints.filter((c): c is RelationConstraint => c.type === "relation");
}

/**
 * Helper to get all unique constraints
 */
export function getUniqueConstraints(constraints: Constraint[]): UniqueConstraint[] {
  return constraints.filter((c): c is UniqueConstraint => c.type === "unique");
}

/**
 * Helper to get all index constraints (excluding auto-generated ones)
 */
export function getExplicitIndexConstraints(constraints: Constraint[]): IndexConstraint[] {
  return constraints.filter((c): c is IndexConstraint => c.type === "index");
}