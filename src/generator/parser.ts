import ts from 'typescript'
import { existsSync } from 'fs'
import type {
  SchemaMetadata,
  TableMetadata,
  UniqueConstraint,
  NotNullConstraint,
  DefaultConstraint,
  DeleteAction,
  RelationConstraintMeta,
  ConstrainMeta,
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
    const relations: RelationConstraintMeta[] = []
    const variableToTableMap: Record<string, string> = {}

    // First pass: collect all table variable declarations
    ts.forEachChild(this.sourceFile, (node) => {
      this.collectTableVariables(node, variableToTableMap)
    })

    // Second pass: extract full table metadata with constraint resolution
    ts.forEachChild(this.sourceFile, (node) => {
      this.visitNode(node, tables, relations, variableToTableMap)
    })

    // Third pass: parse schema export to understand table mapping
    const schemaExport = this.parseSchemaExport(variableToTableMap)

    // Update table metadata with schema export information
    for (const [exportKey, variableName] of Object.entries(schemaExport)) {
      if (tables[variableName]) {
        tables[variableName].exportKey = exportKey
      }
    }

    return {
      tables,
      relations,
    }
  }

  private collectTableVariables(
    node: ts.Node,
    variableToTableMap: Record<string, string>
  ): void {
    // Look for variable declarations that call Table()
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          const variableName = this.getVariableName(declaration)
          const tableName = this.extractTableNameFromCall(
            declaration.initializer
          )

          if (variableName && tableName) {
            variableToTableMap[variableName] = tableName
          }
        }
      }
    }

    // Recursively visit child nodes
    ts.forEachChild(node, (child) =>
      this.collectTableVariables(child, variableToTableMap)
    )
  }

  private visitNode(
    node: ts.Node,
    tables: Record<string, TableMetadata>,
    relations: RelationConstraintMeta[],
    variableToTableMap: Record<string, string>
  ): void {
    // Look for variable declarations that call Table()
    if (ts.isVariableStatement(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          const tableMetadata = this.extractTableFromDeclaration(
            declaration,
            variableToTableMap
          )
          if (tableMetadata) {
            const variableName = this.getVariableName(declaration)
            if (variableName) {
              tables[variableName] = tableMetadata

              // Extract relations for global tracking
              const tableRelations = tableMetadata.constraints.filter(
                (c): c is RelationConstraintMeta => c.type === 'relation'
              )
              relations.push(...tableRelations)
            }
          }
        }
      }
    }

    // Recursively visit child nodes
    ts.forEachChild(node, (child) =>
      this.visitNode(child, tables, relations, variableToTableMap)
    )
  }

  private getVariableName(declaration: ts.VariableDeclaration): string | null {
    if (ts.isIdentifier(declaration.name)) {
      return declaration.name.text
    }
    return null
  }

  private extractTableNameFromCall(node: ts.Node): string | null {
    const callExpression = this.findTableCall(node)
    if (!callExpression) return null

    return this.extractStringLiteral(callExpression.arguments[0])
  }

  private extractTableFromDeclaration(
    declaration: ts.VariableDeclaration,
    variableToTableMap: Record<string, string>
  ): TableMetadata | null {
    if (!declaration.initializer) return null

    // Check if this is a Table() call
    const callExpression = this.findTableCall(declaration.initializer)
    if (!callExpression) return null

    const tableName = this.extractStringLiteral(callExpression.arguments[0])
    if (!tableName) return null

    const variableName = this.getVariableName(declaration)
    if (!variableName) return null

    const fields = this.extractFieldsFromExpression(callExpression.arguments[1])
    const constraints = this.extractConstraintsFromExpression(
      declaration.initializer,
      variableToTableMap
    )

    // Calculate auto-indexes
    const autoIndexes = this.getAutoIndexFields(constraints)

    return {
      name: tableName,
      variableName,
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

  private extractConstraintsFromExpression(
    node: ts.Node,
    variableToTableMap: Record<string, string>
  ): ConstrainMeta[] {
    const constraints: ConstrainMeta[] = []

    // Recursively search for constraints calls in the entire expression tree
    const findConstraints = (n: ts.Node): void => {
      // Look for .constraints() call
      if (
        ts.isCallExpression(n) &&
        ts.isPropertyAccessExpression(n.expression) &&
        ts.isIdentifier(n.expression.name) &&
        n.expression.name.text === 'constraints'
      ) {
        // Extract constraints from the function argument
        const constraintsArg = n.arguments[0]

        // Handle case where constraints is a function that returns an array
        if (
          ts.isArrowFunction(constraintsArg) ||
          ts.isFunctionExpression(constraintsArg)
        ) {
          const body = constraintsArg.body

          // Handle arrow function with array return
          if (ts.isArrayLiteralExpression(body)) {
            for (const element of body.elements) {
              const constraint = this.parseConstraintExpression(
                element,
                variableToTableMap
              )
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
                  const constraint = this.parseConstraintExpression(
                    element,
                    variableToTableMap
                  )
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
            const constraint = this.parseConstraintExpression(
              element,
              variableToTableMap
            )
            if (constraint) {
              constraints.push(constraint)
            }
          }
        }
      }

      // Continue searching in child nodes
      ts.forEachChild(n, findConstraints)
    }

    findConstraints(node)
    return constraints
  }

  private parseConstraintExpression(
    node: ts.Node,
    variableToTableMap: Record<string, string>
  ): ConstrainMeta | null {
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
        return this.parseRelationConstraint(node, variableToTableMap)
      case 'notNull':
        return this.parseNotNullConstraint(node)
      case 'default':
        return this.parseDefaultConstraint(node)
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

  private parseNotNullConstraint(
    node: ts.CallExpression
  ): NotNullConstraint | null {
    const fieldArg = node.arguments[0]
    const field = this.extractStringLiteral(fieldArg)

    if (!field) return null

    return {
      type: 'notNull',
      field,
    }
  }

  private parseDefaultConstraint(
    node: ts.CallExpression
  ): DefaultConstraint | null {
    const fieldArg = node.arguments[0]
    const valueArg = node.arguments[1]

    const field = this.extractStringLiteral(fieldArg)
    if (!field) return null

    // Extract the default value - for now just get the text representation
    const value = valueArg ? valueArg.getText(this.sourceFile) : null
    if (value === null) return null

    return {
      type: 'default',
      field,
      value,
    }
  }

  private parseRelationConstraint(
    node: ts.CallExpression,
    variableToTableMap: Record<string, string>
  ): RelationConstraintMeta | null {
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
      // This references a table variable - look up the actual table name
      const variableName = targetArg.text
      targetTable =
        variableToTableMap[variableName] || variableName.toLowerCase()
    }

    if (!targetTable) return null

    // Extract options if present
    let targetField: string | undefined
    let onDelete: DeleteAction | undefined
    let onUpdate: DeleteAction | undefined

    if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
      for (const property of optionsArg.properties) {
        if (
          ts.isPropertyAssignment(property) &&
          ts.isIdentifier(property.name)
        ) {
          const value = this.extractStringLiteral(property.initializer)
          if (property.name.text === 'targetField') {
            targetField = value || undefined
          } else if (property.name.text === 'onDelete') {
            onDelete = (value as DeleteAction) || undefined
          } else if (property.name.text === 'onUpdate') {
            onUpdate = (value as DeleteAction) || undefined
          }
        }
      }
    }

    return {
      type: 'relation',
      field,
      targetTable,
      targetField,
      onDelete,
      onUpdate,
    }
  }

  private getAutoIndexFields(constraints: ConstrainMeta[]): string[] {
    const autoIndexes = new Set<string>()

    for (const constraint of constraints) {
      if (constraint.type === 'unique' || constraint.type === 'relation') {
        autoIndexes.add(constraint.field)
      }
    }

    return Array.from(autoIndexes)
  }

  /**
   * Parse the schema export (defineSchema call) to understand table mappings
   */
  private parseSchemaExport(
    _variableToTableMap: Record<string, string>
  ): Record<string, string> {
    const schemaExport: Record<string, string> = {}

    // Look for export default defineSchema() calls
    const exportStatements = this.findExportStatements()

    for (const exportStmt of exportStatements) {
      if (this.isDefineSchemaCall(exportStmt)) {
        const tableMapping = this.extractTableMappingFromDefineSchema(
          exportStmt as ts.ExportAssignment
        )
        Object.assign(schemaExport, tableMapping)
      }
    }

    return schemaExport
  }

  private findExportStatements(): ts.ExportAssignment[] {
    const exports: ts.ExportAssignment[] = []

    const visit = (node: ts.Node) => {
      if (ts.isExportAssignment(node) && node.isExportEquals === false) {
        exports.push(node)
      }
      ts.forEachChild(node, visit)
    }

    visit(this.sourceFile)
    return exports
  }

  private isDefineSchemaCall(node: ts.Node): boolean {
    if (!ts.isExportAssignment(node)) return false

    const expression = node.expression
    if (!ts.isCallExpression(expression)) return false

    return (
      ts.isIdentifier(expression.expression) &&
      expression.expression.text === 'defineSchema'
    )
  }

  private extractTableMappingFromDefineSchema(
    node: ts.ExportAssignment
  ): Record<string, string> {
    const mapping: Record<string, string> = {}

    if (!ts.isCallExpression(node.expression)) return mapping

    const firstArg = node.expression.arguments[0]
    if (!ts.isObjectLiteralExpression(firstArg)) return mapping

    for (const property of firstArg.properties) {
      if (ts.isPropertyAssignment(property)) {
        const key = this.getPropertyKey(property)
        const variableName = this.extractVariableFromToConvexTableCall(
          property.initializer
        )

        if (key && variableName) {
          mapping[key] = variableName
        }
      }
    }

    return mapping
  }

  private getPropertyKey(property: ts.PropertyAssignment): string | null {
    if (ts.isIdentifier(property.name)) {
      return property.name.text
    } else if (ts.isStringLiteral(property.name)) {
      return property.name.text
    }
    return null
  }

  private extractVariableFromToConvexTableCall(node: ts.Node): string | null {
    if (!ts.isCallExpression(node)) return null

    if (
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.name) &&
      node.expression.name.text === 'toConvexTable' &&
      ts.isIdentifier(node.expression.expression)
    ) {
      return node.expression.expression.text
    }

    return null
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
