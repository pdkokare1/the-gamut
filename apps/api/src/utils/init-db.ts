// apps/api/src/utils/init-db.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * DATABASE INITIALIZATION SCRIPT
 * * Purpose: Apply MongoDB-specific indexes that Prisma Schema does not currently support.
 * * 1. GlobalSearchIndex: Weighted Text Index for accurate search results.
 * 2. TTL Index: Automatically expires articles after 90 days (7,776,000 seconds).
 */
async function main() {
  console.log('🔄 Starting Database Index Initialization...');

  try {
    // --- 1. Apply Weighted Text Search Index ---
    // Matches logic from old ArticleModel.ts: 
    // weights: { headline: 10, clusterTopic: 8, primaryNoun: 5, summary: 1 }
    console.log('✨ Applying Weighted Text Index (GlobalSearchIndex)...');
    
    await prisma.$runCommandRaw({
      createIndexes: "articles",
      indexes: [
        {
          key: {
            headline: "text",
            clusterTopic: "text",
            primaryNoun: "text",
            summary: "text"
          },
          name: "GlobalSearchIndex",
          weights: {
            headline: 10,
            clusterTopic: 8,
            primaryNoun: 5,
            summary: 1
          }
        }
      ]
    });
    console.log('✅ GlobalSearchIndex applied successfully.');

    // --- 2. Apply TTL (Time-To-Live) Index ---
    // Matches logic from old ArticleModel.ts: expireAfterSeconds: 7776000 (90 Days)
    console.log('✨ Applying Data Retention Policy (90 Days)...');

    await prisma.$runCommandRaw({
      createIndexes: "articles",
      indexes: [
        {
          key: { createdAt: 1 },
          name: "TTL_90_Days",
          expireAfterSeconds: 7776000
        }
      ]
    });
    console.log('✅ TTL Index applied successfully.');

  } catch (error) {
    // If index already exists with different options, Mongo throws an error.
    // Usually safe to ignore if you haven't changed the weights.
    console.error('⚠️  Index creation warning (might already exist):', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
