import type { 
  Constraint,
  RelationConstraint, 
  UniqueConstraint,
  DeleteAction 
} from "../core/types.js";

/**
 * Runtime constraint enforcement utilities
 */
export class ConstraintEnforcer {
  constructor(private ctx: { db: any }) {}

  /**
   * Validate all constraints for a table before insertion
   */
  async validateInsert(
    tableName: string,
    data: Record<string, any>,
    constraints: Constraint[]
  ): Promise<void> {
    for (const constraint of constraints) {
      await this.validateConstraint(tableName, constraint, data);
    }
  }

  /**
   * Validate all constraints for a table before update
   */
  async validateUpdate(
    tableName: string,
    id: string,
    patch: Record<string, any>,
    constraints: Constraint[]
  ): Promise<void> {
    for (const constraint of constraints) {
      // Only validate constraints for fields that are being updated
      if (this.constraintAffectsFields(constraint, Object.keys(patch))) {
        await this.validateConstraint(tableName, constraint, patch, id);
      }
    }
  }

  /**
   * Handle cascading operations before deletion
   */
  async handleDelete(
    tableName: string,
    id: string,
    allTableConstraints: Record<string, Constraint[]>
  ): Promise<void> {
    // Find all relations that reference this table
    for (const [otherTableName, constraints] of Object.entries(allTableConstraints)) {
      for (const constraint of constraints) {
        if (constraint.type === "relation" && constraint.targetTable === tableName) {
          await this.handleRelationDelete(
            otherTableName,
            constraint,
            id
          );
        }
      }
    }
  }

  private async validateConstraint(
    tableName: string,
    constraint: Constraint,
    data: Record<string, any>,
    excludeId?: string
  ): Promise<void> {
    switch (constraint.type) {
      case "unique":
        await this.validateUniqueConstraint(tableName, constraint, data, excludeId);
        break;
      case "relation":
        await this.validateRelationConstraint(constraint, data);
        break;
      case "notNull":
        this.validateNotNullConstraint(constraint, data);
        break;
      // Add more constraint types as needed
    }
  }

  private async validateUniqueConstraint(
    tableName: string,
    constraint: UniqueConstraint,
    data: Record<string, any>,
    excludeId?: string
  ): Promise<void> {
    const value = data[constraint.field];
    
    if (value === undefined) {
      return; // No value to validate
    }

    const existing = await this.ctx.db
      .query(tableName)
      .withIndex(constraint.field, (q: any) => q.eq(constraint.field, value))
      .first();

    if (existing && (!excludeId || existing._id !== excludeId)) {
      throw new Error(
        `Unique constraint violation: ${constraint.field} '${value}' already exists in ${tableName}`
      );
    }
  }

  private async validateRelationConstraint(
    constraint: RelationConstraint,
    data: Record<string, any>
  ): Promise<void> {
    const value = data[constraint.field];
    
    if (!value) {
      return; // Null/undefined foreign keys are allowed unless explicitly not null
    }

    const target = await this.ctx.db.get(value);
    if (!target) {
      throw new Error(
        `Foreign key constraint violation: ${constraint.targetTable} with id '${value}' does not exist`
      );
    }
  }

  private validateNotNullConstraint(
    constraint: { field: string },
    data: Record<string, any>
  ): void {
    const value = data[constraint.field];
    
    if (value === null || value === undefined) {
      throw new Error(
        `Not null constraint violation: ${constraint.field} cannot be null or undefined`
      );
    }
  }

  private async handleRelationDelete(
    sourceTableName: string,
    constraint: RelationConstraint,
    targetId: string
  ): Promise<void> {
    const relatedRecords = await this.ctx.db
      .query(sourceTableName)
      .withIndex(`${constraint.field}_idx`, (q: any) => q.eq(constraint.field, targetId))
      .collect();

    if (relatedRecords.length === 0) {
      return; // No related records
    }

    switch (constraint.onDelete) {
      case "cascade":
        // Delete all related records
        for (const record of relatedRecords) {
          await this.ctx.db.delete(record._id);
        }
        break;
        
      case "restrict":
        // Prevent deletion if related records exist
        throw new Error(
          `Cannot delete: ${relatedRecords.length} related ${sourceTableName} record(s) exist`
        );
        
      case "setNull":
        // Set foreign key to null
        for (const record of relatedRecords) {
          await this.ctx.db.patch(record._id, { [constraint.field]: null });
        }
        break;
        
      case "setDefault":
        // Set foreign key to default value (implementation depends on constraint definition)
        throw new Error("setDefault action not yet implemented");
        
      default:
        // Default behavior is restrict
        throw new Error(
          `Cannot delete: ${relatedRecords.length} related ${sourceTableName} record(s) exist`
        );
    }
  }

  private constraintAffectsFields(constraint: Constraint, fields: string[]): boolean {
    switch (constraint.type) {
      case "unique":
      case "notNull":
      case "default":
      case "relation":
        return fields.includes(constraint.field);
      default:
        return false;
    }
  }
}

/**
 * Higher-order function that wraps a mutation with constraint enforcement
 */
export function withConstraints<T extends any[], R>(
  tableName: string,
  constraints: Constraint[],
  allTableConstraints: Record<string, Constraint[]>,
  mutationFn: (ctx: any, ...args: T) => Promise<R>
) {
  return async (ctx: any, ...args: T): Promise<R> => {
    const enforcer = new ConstraintEnforcer(ctx);
    
    // The exact implementation depends on the mutation type
    // This is a simplified version - in practice you'd need to detect
    // the operation type (insert/update/delete) and handle accordingly
    
    return await mutationFn(ctx, ...args);
  };
}

/**
 * Create a mutation wrapper for inserts with constraint validation
 */
export function createInsertWithConstraints<T extends Record<string, any>>(
  tableName: string,
  constraints: Constraint[]
) {
  return async (ctx: { db: any }, data: T): Promise<string> => {
    const enforcer = new ConstraintEnforcer(ctx);
    await enforcer.validateInsert(tableName, data, constraints);
    return await ctx.db.insert(tableName, data);
  };
}

/**
 * Create a mutation wrapper for updates with constraint validation
 */
export function createUpdateWithConstraints<T extends Record<string, any>>(
  tableName: string,
  constraints: Constraint[]
) {
  return async (ctx: { db: any }, id: string, patch: Partial<T>): Promise<void> => {
    const enforcer = new ConstraintEnforcer(ctx);
    await enforcer.validateUpdate(tableName, id, patch, constraints);
    await ctx.db.patch(id, patch);
  };
}

/**
 * Create a mutation wrapper for deletes with constraint handling
 */
export function createDeleteWithConstraints(
  tableName: string,
  allTableConstraints: Record<string, Constraint[]>
) {
  return async (ctx: { db: any }, id: string): Promise<void> => {
    const enforcer = new ConstraintEnforcer(ctx);
    await enforcer.handleDelete(tableName, id, allTableConstraints);
    await ctx.db.delete(id);
  };
}