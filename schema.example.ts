// Example schema.ts showing how to use convex-sql
import { defineSchema } from "convex/server";
import { v } from "convex/values";
import { Table, unique, relation, index } from "convex-sql";

// Define users table with constraints
const Users = Table('users', {
  email: v.string(),
  name: v.string(),
  role: v.union(v.literal("admin"), v.literal("user")),
  createdAt: v.number(),
}).constraints([
  unique('email'),         // Creates unique index on email
  index('name'),          // Creates index on name for search
  index('role'),          // Creates index on role for filtering
]);

// Define categories table
const Categories = Table('categories', {
  name: v.string(),
  slug: v.string(),
  description: v.optional(v.string()),
}).constraints([
  unique('name'),         // Category names must be unique
  unique('slug'),         // Category slugs must be unique
  index('slug'),          // Additional index for slug lookups (unique creates one too)
]);

// Define posts table with relations
const Posts = Table('posts', {
  title: v.string(),
  content: v.string(),
  userId: v.id('users'),      // Foreign key to users - auto-creates index
  categoryId: v.id('categories'), // Foreign key to categories - auto-creates index  
  status: v.union(v.literal("draft"), v.literal("published"), v.literal("archived")),
  publishedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).constraints([
  relation('userId', Users, { onDelete: 'cascade' }),        // Delete posts when user is deleted
  relation('categoryId', Categories, { onDelete: 'restrict' }), // Prevent category deletion if posts exist
  index(['userId', 'status']),    // Composite index for user's posts by status
  index(['categoryId', 'publishedAt']), // Composite index for category posts by publish date
  index('status'),                // Simple index for filtering by status
]);

// Define comments table with nested relations
const Comments = Table('comments', {
  content: v.string(),
  userId: v.id('users'),      // Who wrote the comment - auto-creates index
  postId: v.id('posts'),      // Which post - auto-creates index
  parentId: v.optional(v.id('comments')), // Reply to another comment - auto-creates index
  createdAt: v.number(),
}).constraints([
  relation('userId', Users, { onDelete: 'cascade' }),   // Delete comments when user is deleted
  relation('postId', Posts, { onDelete: 'cascade' }),   // Delete comments when post is deleted
  relation('parentId', Comments, { onDelete: 'cascade' }), // Delete replies when parent comment is deleted
  index(['postId', 'createdAt']), // Get comments for a post ordered by date
  index('parentId'),              // Get replies to a comment
]);

// Define tags table
const Tags = Table('tags', {
  name: v.string(),
  color: v.optional(v.string()),
}).constraints([
  unique('name'),         // Tag names must be unique
]);

// Define many-to-many relationship table for posts and tags
const PostTags = Table('postTags', {
  postId: v.id('posts'),  // Auto-creates index
  tagId: v.id('tags'),    // Auto-creates index
}).constraints([
  relation('postId', Posts, { onDelete: 'cascade' }),   // Delete post-tag links when post is deleted
  relation('tagId', Tags, { onDelete: 'cascade' }),     // Delete post-tag links when tag is deleted
  index(['postId', 'tagId']),  // Composite index for the relationship (also ensures uniqueness in practice)
]);

// Export the schema for Convex
export default defineSchema({
  users: Users.table,
  categories: Categories.table,
  posts: Posts.table,
  comments: Comments.table,
  tags: Tags.table,
  postTags: PostTags.table,
});

/*
Auto-generated indexes from constraints:

Users:
- email (unique)
- name
- role

Categories:  
- name (unique)
- slug (unique)

Posts:
- userId (from relation)
- categoryId (from relation)
- [userId, status] (composite)
- [categoryId, publishedAt] (composite)
- status

Comments:
- userId (from relation)
- postId (from relation)
- parentId (from relation)
- [postId, createdAt] (composite)

Tags:
- name (unique)

PostTags:
- postId (from relation)
- tagId (from relation)
- [postId, tagId] (composite)

Constraint behaviors:
- Deleting a user cascades to their posts and comments
- Deleting a category is restricted if posts exist in that category
- Deleting a post cascades to its comments and post-tag links
- Deleting a comment cascades to its replies
- Deleting a tag cascades to its post-tag links
- All email addresses and category names/slugs must be unique
- Foreign key integrity is enforced for all relations
*/