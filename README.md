# Convex-SQL

SQL-like constraints & relations for Convex that give you relational DB ergonomics on top of Convex’s NoSQL model.

---

## 📌 Why?

I love Convex’s NoSQL style — but for many projects, I still end up recreating relational patterns.  
Handling cascading deletes, ensuring unique fields, managing relations, writing your own checks... it’s all repetitive.

So I built a toolkit that adds:
- 🔗 **Relations** (with `cascade`, `restrict`, `setNull`)
- 🔒 **Unique constraints**
- ⚡ **Auto-generated indexes**
- 🛡️ **Runtime constraint validation**
- 📝 **Type-safe code generation**

---

## ✨ Example API

```typescript
import { Table } from 'convex-sql'
import { defineSchema } from 'convex/server'
import { v } from 'convex/values'

const Users = Table('users', {
  firstName: v.string(),
  lastName: v.string(),
  username: v.string(),
  email: v.string(),
})
  .constraints((c) => [
    c.unique('email')
  ])
  .index('by_name', ['firstName', 'lastName'])
  .index('by_username', ['username'])

const Documents = Table('documents', {
  userId: v.id('users'),
  name: v.string(),
  content: v.string(),
}).constraints((c) => [
  c.relation('userId', Users, { onDelete: 'restrict' }),
])

export default defineSchema({
  users: Users.toConvexTable(),
  documents: Documents.toConvexTable(),
})
```

✅ **Unique constraints auto-create indexes**  
✅ **Relations auto-create indexes & enforce on insert/delete**

---

## 🛠 Generated Code

Run:

```bash
npx convex-sql generate
```

to produce validators & enhanced `mutation` / `query` wrappers.

```typescript
import { withConstraints } from './_sql/db'
import { mutation, query } from './_generated/server'

const { mutation: mutationWithConstraints } = withConstraints(mutation, query)

export const createDocument = mutationWithConstraints({
  args: { name: v.string(), userId: v.id('users'), content: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db.insert('documents', args)
  }
})
```

---

### 🔥 Errors you get out of the box

Try to delete a user who still has documents:

```json
{
  "error": "Cannot delete: 1 related documents record(s) exist"
}
```

Or insert with a foreign key that doesn’t exist:

```json
{
  "error": "Foreign key constraint violation: documents with id 'xxx' does not exist"
}
```

---

## ⚙ More Complex: Custom target fields & defaults

You can build relations not just to system IDs, but to any unique field.  
Also supports `default` constraints to auto-set values on insert.

```typescript
const Documents = Table('documents', {
  userId: v.id('users'),
  name: v.string(),
  documentId: v.string(),
  content: v.string(),
}).constraints((c) => [
  c.relation('userId', Users, { onDelete: 'restrict' }),
  c.default('documentId', () => crypto.randomUUID()),
])

const Attachments = Table('attachments', {
  attachmentId: v.string(),
  name: v.string(),
  url: v.string(),
  docId: v.string(),
}).constraints((c) => [
  c.unique('attachmentId'),
  c.relation('docId', Documents, {
    targetField: 'documentId',
    onDelete: 'restrict',
  }),
  c.default('attachmentId', () => crypto.randomUUID()),
])
```

✅ Now inserts to `attachments` must reference a valid `documentId`.

---

## 🚀 CLI

- `convex-sql generate` - generate constraint code
- `convex-sql watch` - auto-regenerate on schema changes
- `convex-sql validate` - validate your schema only

---

## 🔍 Wrap Up

Is this interesting to anyone else?  
It’s still rough around the edges, but the ergonomics are already way nicer for relational data in Convex.

Want to try it out or help shape it? Drop me a message on discord!

@kickedsoda

---

✅ **Type-safe**  
✅ **No manual index juggling**  
✅ **Runtime-safe deletes & inserts**

---

MIT License.
