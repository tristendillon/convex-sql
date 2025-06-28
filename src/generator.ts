// Generator exports - Node.js environment only
export { parseSchemaFile } from './generator/parser.js'
export {
  generateConstraintCode,
  writeGeneratedCode,
} from './generator/codegen.js'
export { createWatcher } from './generator/watcher.js'

// Type exports for generator
export type { SchemaMetadata, TableMetadata } from './core/types.js'
