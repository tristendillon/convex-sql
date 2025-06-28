#!/usr/bin/env node

import { Command } from 'commander'
import { watch } from 'chokidar'
import { resolve } from 'path'
import { existsSync, mkdirSync } from 'fs'
import {
  parseSchemaFile,
  generateConstraintCode,
  writeGeneratedCode,
} from './generator/index.js'

const program = new Command()

program
  .name('convex-sql')
  .description('SQL-like constraints and relations for Convex')
  .version('0.1.0')

program
  .command('generate')
  .description('Generate constraint code from schema file')
  .option('-s, --schema <file>', 'Schema file path', 'convex/schema.ts')
  .option('-o, --output <dir>', 'Output directory', 'convex/_sql')
  .action(async (options) => {
    try {
      await generateFromSchema(options.schema, options.output)
      console.log('✅ Constraint code generated successfully')
    } catch (error) {
      console.error('❌ Error generating constraint code:', error)
      process.exit(1)
    }
  })

program
  .command('watch')
  .description('Watch schema file and regenerate constraint code on changes')
  .option('-s, --schema <file>', 'Schema file path', 'convex/schema.ts')
  .option('-o, --output <dir>', 'Output directory', 'convex/_sql')
  .action(async (options) => {
    console.log(`🔍 Watching ${options.schema} for changes...`)

    // Generate initial code
    try {
      await generateFromSchema(options.schema, options.output)
      console.log('✅ Initial constraint code generated')
    } catch (error) {
      console.error('❌ Error generating initial constraint code:', error)
    }

    // Watch for changes
    const watcher = watch(options.schema, {
      persistent: true,
      ignoreInitial: true,
    })

    watcher.on('change', async () => {
      console.log('📝 Schema file changed, regenerating...')
      try {
        await generateFromSchema(options.schema, options.output)
        console.log('✅ Constraint code regenerated')
      } catch (error) {
        console.error('❌ Error regenerating constraint code:', error)
      }
    })

    watcher.on('error', (error) => {
      console.error('❌ Watcher error:', error)
    })

    // Keep the process running
    process.on('SIGINT', () => {
      console.log('\n👋 Stopping watcher...')
      watcher.close()
      process.exit(0)
    })
  })

program
  .command('init')
  .description('Initialize convex-sql in your project')
  .option('-s, --schema <file>', 'Schema file path', 'convex/schema.ts')
  .action(async (options) => {
    try {
      await initProject(options.schema)
      console.log('✅ Convex-SQL initialized successfully')
    } catch (error) {
      console.error('❌ Error initializing project:', error)
      process.exit(1)
    }
  })

program
  .command('validate')
  .description('Validate schema constraints without generating code')
  .option('-s, --schema <file>', 'Schema file path', 'convex/schema.ts')
  .option('-f, --full', 'Show full schema')
  .action(async (options) => {
    try {
      const schema = parseSchemaFile(resolve(options.schema))

      console.log('📋 Schema validation results:')
      console.log(`- Found ${Object.keys(schema.tables).length} tables`)
      console.log(`- Found ${schema.relations.length} relations`)

      for (const [tableName, table] of Object.entries(schema.tables)) {
        console.log(`\n📄 Table: ${tableName}`)
        console.log(`  - Fields: ${Object.keys(table.fields).length}`)
        console.log(`  - Constraints: ${table.constraints.length}`)
        console.log(`  - Auto-indexes: ${table.autoIndexes.length}`)

        if (table.autoIndexes.length > 0) {
          console.log(`    - ${table.autoIndexes.join(', ')}`)
        }
      }

      console.log('✅ Schema is valid')

      if (options.full) {
        console.log('\nFull schema:')
        console.log(JSON.stringify(schema, null, 2))
      }
    } catch (error) {
      console.error('❌ Schema validation failed:', error)
      process.exit(1)
    }
  })

async function generateFromSchema(
  schemaPath: string,
  outputDir: string
): Promise<void> {
  const resolvedSchemaPath = resolve(schemaPath)
  const resolvedOutputDir = resolve(outputDir)

  if (!existsSync(resolvedSchemaPath)) {
    throw new Error(`Schema file not found: ${resolvedSchemaPath}`)
  }

  // Parse schema
  const schema = parseSchemaFile(resolvedSchemaPath)

  // Generate code
  const code = generateConstraintCode(schema)

  // Write generated code
  writeGeneratedCode(code, resolvedOutputDir)
}

async function initProject(schemaPath: string): Promise<void> {
  const resolvedSchemaPath = resolve(schemaPath)

  if (!existsSync(resolvedSchemaPath)) {
    throw new Error(
      `Schema file not found: ${resolvedSchemaPath}. Please create your schema first.`
    )
  }

  // Create output directory
  const outputDir = resolve('convex/_sql')
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
  }

  // Generate initial code
  await generateFromSchema(schemaPath, outputDir)

  console.log('🎉 Project initialized with convex-sql!')
  console.log('\nNext steps:')
  console.log('1. Update your schema.ts to use the enhanced Table function')
  console.log(
    '2. Run `convex-sql watch` to automatically regenerate code on changes'
  )
  console.log(
    '3. Import and use the generated constraint functions in your Convex functions'
  )
  console.log('\nExample schema.ts:')
  console.log(`
import { Table, unique, relation, index } from 'convex-sql';
import { defineSchema } from 'convex/server';
import { v } from 'convex/values';

const Users = Table('users', {
  email: v.string(),
  name: v.string(),
}).constraints([
  unique('email'),
  index('name')
]);

const Posts = Table('posts', {
  title: v.string(),
  userId: v.id('users'),
}).constraints([
  relation('userId', Users, { onDelete: 'cascade' }),
  index(['userId', 'title'])
]);

export default defineSchema({
  users: Users.table,
  posts: Posts.table,
});
`)
}

// Show help if no command provided
if (process.argv.length <= 2) {
  program.help()
}

program.parse()
