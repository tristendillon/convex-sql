import { v } from 'convex/values'
import { Table } from './src/core/Table.js'

// Test the enhanced Table function with type safety
const usersTable = Table('users', {
  firstName: v.string(),
  lastName: v.string(),
  name: v.string(),
  email: v.string(),
})

// Test that index method works with proper type safety
const usersWithIndex = usersTable
  .index('by_email', ['email'])
  .index('by_name', ['firstName', 'lastName'])

// Test that field paths are type-safe (this should give autocomplete)
// The following should work:
const validIndex = usersTable.index('by_first_name', ['firstName'])

// Test constraints with type safety
const usersWithConstraints = usersTable.constraints((c) => [
  c.unique('email'), // Type-safe: 'email' should be autocompleted
  c.notNull('firstName'), // Type-safe: 'firstName' should be autocompleted
  c.index(['lastName', 'firstName'], 'by_last_first'), // Type-safe field array
  // The following should give TypeScript errors if uncommented:
  // c.unique('nonExistentField'), // Error: field doesn't exist
  // c.index(['invalidField'], 'invalid_idx'), // Error: field doesn't exist
])

// The following should give a TypeScript error if uncommented:
// const invalidIndex = usersTable.index('invalid', ['nonExistentField'])

console.log('Table tests passed!')
