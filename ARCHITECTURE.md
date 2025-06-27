# Convex-SQL Architecture

## Package Structure

The `convex-sql` package is designed with a clear separation between Convex-safe code and Node.js-specific functionality to avoid bundling issues in serverless environments.

## Entry Points

### Main Entry (`convex-sql`)
**Safe for Convex serverless environment**

```typescript
import { Table, unique, relation, index } from "convex-sql";
```

Exports:
- Core table definition functions (`Table`, constraints)
- Runtime constraint enforcement
- TypeScript types
- No Node.js dependencies

### Generator Entry (`convex-sql/generator`) 
**Node.js environment only**

```typescript
import { parseSchemaFile, generateConstraintCode } from "convex-sql/generator";
```

Exports:
- Schema parsing (uses TypeScript compiler API)
- Code generation (uses file system APIs)
- File watching utilities
- Build-time functionality

## File Organization

```
src/
├── index.ts           # Main entry point (Convex-safe)
├── generator.ts       # Generator entry point (Node.js only)
├── cli.ts            # CLI interface (Node.js only)
├── core/             # Core functionality (Convex-safe)
│   ├── Table.ts      # Table definitions
│   ├── constraints.ts # Constraint builders
│   └── types.ts      # TypeScript types
├── runtime/          # Runtime enforcement (Convex-safe)
│   ├── constraints.ts # Constraint validation
│   └── index.ts      # Runtime exports
└── generator/        # Code generation (Node.js only)
    ├── parser.ts     # Schema parsing
    ├── codegen.ts    # Code generation
    └── watcher.ts    # File watching
```

## Usage Patterns

### ✅ Convex Functions
```typescript
// convex/schema.ts
import { Table, unique, relation } from "convex-sql";

// convex/users.ts  
import { withConstraints } from "./_sql/db";
```

### ✅ Build Scripts
```typescript
// scripts/build.js
import { generateConstraintCode } from "convex-sql/generator";
```

### ✅ CLI
```bash
npx convex-sql generate
```

## Benefits

1. **No Bundle Conflicts**: Core functionality has zero Node.js dependencies
2. **Optimal Bundle Size**: Each entry point only includes necessary code
3. **Clear Separation**: Build-time vs runtime concerns are isolated
4. **Type Safety**: Full TypeScript support across all entry points
5. **Flexibility**: Choose the right entry point for your use case

## Migration Guide

If you're upgrading from a version that mixed concerns:

### Before
```typescript
// ❌ This would cause bundling issues
import { Table, parseSchemaFile } from "convex-sql";
```

### After
```typescript
// ✅ Use appropriate entry points
import { Table } from "convex-sql";                    // In Convex functions
import { parseSchemaFile } from "convex-sql/generator"; // In build scripts
```