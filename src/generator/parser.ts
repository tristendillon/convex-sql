import ts from 'typescript'
import { existsSync } from 'fs'
import type {
  SchemaMetadata,
  TableMetadata,
  Constraint,
  RelationConstraint,
  UniqueConstraint,
} from '../core/types.js'

/**
 * Parse a schema.ts file and extract table definitions with constraints
 */
export class SchemaParser {
  private sourceFile: ts.SourceFile

  constructor(filePath: string) {
    const program = ts.createProgram([filePath], {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    })

    this.sourceFile = program.getSourceFile(filePath)!

    if (!this.sourceFile) {
      throw new Error(`Could not parse file: ${filePath}`)
    }
  }

  /**
   * Parse the schema file and extract all table metadata
   */
  parseSchema(): SchemaMetadata {
    const tables: Record<string, TableMetadata> = {}
    const relations: RelationConstraint[] = []

    // Visit all nodes in the AST
    ts.forEachChild(this.sourceFile, (node) => {
      this.visitNode(node, tables, relations)
    })

    return {
      tables,
      relations,
    }
  }

  private visitNode(
    node: ts.Node,
    tables: Record<string, TableMetadata>,
    relations: RelationConstraint[]
  ): void {
    // Look for variable declarations that call Table()
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          const tableMetadata = this.extractTableFromDeclaration(declaration)
          if (tableMetadata) {
            tables[tableMetadata.name] = tableMetadata

            // Extract relations for global tracking
            const tableRelations = tableMetadata.constraints.filter(
              (c): c is RelationConstraint => c.type === 'relation'
            )
            relations.push(...tableRelations)
          }
        }
      }
    }

    // Recursively visit child nodes
    ts.forEachChild(node, (child) => this.visitNode(child, tables, relations))
  }

  private extractTableFromDeclaration(
    declaration: ts.VariableDeclaration
  ): TableMetadata | null {
    if (!declaration.initializer) return null

    // Check if this is a Table() call
    const callExpression = this.findTableCall(declaration.initializer)
    if (!callExpression) return null

    const tableName = this.extractStringLiteral(callExpression.arguments[0])
    if (!tableName) return null

    const fields = this.extractFieldsFromExpression(callExpression.arguments[1])
    const constraints = this.extractConstraintsFromExpression(
      declaration.initializer
    )

    // Calculate auto-indexes
    const autoIndexes = this.getAutoIndexFields(constraints)

    return {
      name: tableName,
      fields,
      constraints,
      autoIndexes,
    }
  }

  private findTableCall(node: ts.Node): ts.CallExpression | null {
    if (ts.isCallExpression(node)) {
      // Check if this is a direct Table() call
      if (
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'Table'
      ) {
        return node
      }

      // Check if this is a chained call that starts with Table()
      if (ts.isPropertyAccessExpression(node.expression)) {
        return this.findTableCall(node.expression.expression)
      }
    }

    if (ts.isPropertyAccessExpression(node) && node.expression) {
      return this.findTableCall(node.expression)
    }

    return null
  }

  private extractStringLiteral(node: ts.Node): string {
    if (ts.isStringLiteral(node)) {
      return node.text
    }
    return ''
  }

  private extractFieldsFromExpression(node: ts.Node): Record<string, any> {
    const fields: Record<string, any> = {}

    if (ts.isObjectLiteralExpression(node)) {
      for (const property of node.properties) {
        if (
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name)
        ) {
          fields[property.name.text] = this.extractValidatorType(
            property.initializer
          )
        }
      }
    }

    return fields
  }

  private extractValidatorType(node: ts.Node): string {
    // For now, just return a string representation
    // In a full implementation, you'd want to parse the actual validator types
    return node.getText(this.sourceFile)
  }

  private extractConstraintsFromExpression(node: ts.Node): Constraint[] {
    const constraints: Constraint[] = []

    // Look for .constraints() call
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.name) &&
      node.expression.name.text === 'constraints'
    ) {
      // Extract constraints from the function argument
      const constraintsArg = node.arguments[0]

      // Handle case where constraints is a function that returns an array
      if (
        ts.isArrowFunction(constraintsArg) ||
        ts.isFunctionExpression(constraintsArg)
      ) {
        const body = constraintsArg.body

        // Handle arrow function with array return
        if (ts.isArrayLiteralExpression(body)) {
          for (const element of body.elements) {
            const constraint = this.parseConstraintExpression(element)
            if (constraint) {
              constraints.push(constraint)
            }
          }
        }

        // Handle function with return statement
        if (ts.isBlock(body)) {
          ts.forEachChild(body, (stmt) => {
            if (
              ts.isReturnStatement(stmt) &&
              stmt.expression &&
              ts.isArrayLiteralExpression(stmt.expression)
            ) {
              for (const element of stmt.expression.elements) {
                const constraint = this.parseConstraintExpression(element)
                if (constraint) {
                  constraints.push(constraint)
                }
              }
            }
          })
        }
      }

      // Handle direct array argument
      if (ts.isArrayLiteralExpression(constraintsArg)) {
        for (const element of constraintsArg.elements) {
          const constraint = this.parseConstraintExpression(element)
          if (constraint) {
            constraints.push(constraint)
          }
        }
      }
    }

    return constraints
  }

  private parseConstraintExpression(node: ts.Node): Constraint | null {
    if (!ts.isCallExpression(node)) return null

    let functionName = this.getFunctionName(node.expression)

    // Handle method calls like c.unique('email')
    if (!functionName && ts.isPropertyAccessExpression(node.expression)) {
      functionName = node.expression.name.text
    }

    if (!functionName) return null

    switch (functionName) {
      case 'unique':
        return this.parseUniqueConstraint(node)
      case 'relation':
        return this.parseRelationConstraint(node)
      default:
        return null
    }
  }

  private getFunctionName(node: ts.Node): string | null {
    if (ts.isIdentifier(node)) {
      return node.text
    }
    return null
  }

  private parseUniqueConstraint(
    node: ts.CallExpression
  ): UniqueConstraint | null {
    const fieldArg = node.arguments[0]
    const field = this.extractStringLiteral(fieldArg)

    if (!field) return null

    return {
      type: 'unique',
      field,
    }
  }

  private parseRelationConstraint(
    node: ts.CallExpression
  ): RelationConstraint | null {
    const fieldArg = node.arguments[0]
    const targetArg = node.arguments[1]
    const optionsArg = node.arguments[2]

    const field = this.extractStringLiteral(fieldArg)
    if (!field) return null

    // Extract target table name
    let targetTable: string | null = null
    if (ts.isStringLiteral(targetArg)) {
      targetTable = targetArg.text
    } else if (ts.isIdentifier(targetArg)) {
      // This references a table variable - convert to lowercase for table name
      targetTable = targetArg.text.toLowerCase()
    }

    if (!targetTable) return null

    // Extract options if present
    let onDelete: string | undefined
    let onUpdate: string | undefined

    if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
      for (const property of optionsArg.properties) {
        if (
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name)
        ) {
          const value = this.extractStringLiteral(property.initializer)
          if (property.name.text === 'onDelete') {
            onDelete = value || undefined
          } else if (property.name.text === 'onUpdate') {
            onUpdate = value || undefined
          }
        }
      }
    }

    return {
      type: 'relation',
      field,
      targetTable,
      onDelete: onDelete as any,
      onUpdate: onUpdate as any,
    }
  }

  private getAutoIndexFields(constraints: Constraint[]): string[] {
    const autoIndexes = new Set<string>()

    for (const constraint of constraints) {
      if (constraint.type === 'unique' || constraint.type === 'relation') {
        autoIndexes.add(constraint.field)
      }
    }

    return Array.from(autoIndexes)
  }
}

/**
 * Convenience function to parse a schema file
 */
export function parseSchemaFile(filePath: string): SchemaMetadata {
  if (!existsSync(filePath)) {
    throw new Error(`Schema file not found: ${filePath}`)
  }

  const parser = new SchemaParser(filePath)
  return parser.parseSchema()
}
