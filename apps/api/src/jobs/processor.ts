import { Job } from 'bullmq';
import { prisma } from '@gamut/db';
import { newsQueue } from './queue';
import { newsService, NewsItem } from '../services/news';
import { aiService } from '../services/ai';
import { audioService } from '../services/audio';
import { gatekeeperService } from '../services/gatekeeper';
import { clusteringService } from '../services/clustering'; // Imported

// ... (Job Router and Fetch Logic remain same) ...

/**
 * PHASE 2: ANALYZE
 */
const handleAnalysis = async (job: Job) => {
  const item = job.data as NewsItem;

  try {
    // A. Gatekeeper
    if (!gatekeeperService.isValid(item.title, item.description || '', item.url)) {
      return { status: 'skipped', reason: 'gatekeeper_rejected' };
    }

    // B. DB Check
    const exists = await prisma.article.findUnique({ where: { url: item.url } });
    if (exists) return { status: 'skipped', reason: 'already_exists' };

    // C. AI Analysis
    console.log(`🤖 Analyzing: ${item.title}`);
    const fullText = `${item.title}. ${item.description || ''} ${item.content || ''}`;
    const analysis = await aiService.analyzeArticle(fullText, item.title);
    
    // D. Clustering (Now using the Service)
    const { clusterId, clusterTopic } = await clusteringService.findClusterForArticle({
        title: item.title,
        summary: analysis.summary,
        category: analysis.category || 'General',
        source: item.source || 'Unknown',
        primaryNoun: analysis.primaryNoun,
        publishedAt: new Date(item.publishedAt)
    });

    // E. Save Article
    const savedArticle = await prisma.article.create({
      data: {
        headline: item.title,
        url: item.url,
        summary: analysis.summary,
        imageUrl: item.imageUrl,
        source: item.source || "Unknown",
        publishedAt: new Date(item.publishedAt),
        
        category: analysis.category || "General",
        politicalLean: analysis.politicalLean,
        sentiment: analysis.sentiment,
        biasScore: analysis.biasScore,
        trustScore: analysis.trustScore,
        keyFindings: analysis.keyFindings || [],
        
        clusterId: clusterId,
        clusterTopic: clusterTopic,
        primaryNoun: analysis.primaryNoun,
        
        // Default coverages
        coverageLeft: 0,
        coverageCenter: 0,
        coverageRight: 0
      }
    });

    // F. Audio Generation (Awaited)
    if (savedArticle.id) {
       const audioUrl = await audioService.generateForArticle(savedArticle.id, analysis.summary, savedArticle.headline);
       if (audioUrl) {
           await prisma.article.update({
               where: { id: savedArticle.id },
               data: { audioUrl }
           });
       }
    }

    return { status: 'completed', id: savedArticle.id };

  } catch (err) {
    console.error(`❌ Analysis Failed for ${item.title}:`, err);
    throw err;
  }
};
