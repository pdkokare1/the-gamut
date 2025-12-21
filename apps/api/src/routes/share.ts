import { FastifyInstance } from 'fastify';
import { prisma } from '@gamut/db';
import { z } from 'zod';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export async function shareRoutes(fastify: FastifyInstance) {
  fastify.get('/share/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();

    // 1. Detect Social Bots (Twitter, WhatsApp, Discord, etc.)
    const isBot = /bot|googlebot|crawler|spider|robot|crawling|facebookexternalhit|whatsapp|slackbot|discord|twitterbot/i.test(userAgent);

    // 2. If Human, redirect to App
    if (!isBot) {
      return reply.redirect(`${FRONTEND_URL}/narrative/${id}`);
    }

    // 3. If Bot, fetch data and serve HTML
    try {
      const article = await prisma.article.findUnique({
        where: { id },
        select: { headline: true, summary: true, imageUrl: true }
      });

      if (!article) {
        return reply.redirect(FRONTEND_URL);
      }

      // Generate Static HTML for the Crawler
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="utf-8" />
            <title>${article.headline} | The Gamut</title>
            <meta name="description" content="${article.summary}" />
            
            <meta property="og:type" content="article" />
            <meta property="og:url" content="${FRONTEND_URL}/narrative/${id}" />
            <meta property="og:title" content="${article.headline}" />
            <meta property="og:description" content="${article.summary}" />
            <meta property="og:image" content="${article.imageUrl || ''}" />
            <meta property="og:site_name" content="The Gamut" />
            
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content="${article.headline}" />
            <meta name="twitter:description" content="${article.summary}" />
            <meta name="twitter:image" content="${article.imageUrl || ''}" />
        </head>
        <body>
            <h1>${article.headline}</h1>
            <p>${article.summary}</p>
            <img src="${article.imageUrl}" alt="Article Preview" />
        </body>
        </html>
      `;

      reply.type('text/html').send(html);

    } catch (error) {
      console.error("Share Route Error:", error);
      return reply.redirect(FRONTEND_URL);
    }
  });
}
