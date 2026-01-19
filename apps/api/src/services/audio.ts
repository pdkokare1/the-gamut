// apps/api/src/services/audio.ts
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config';
import { prisma } from '@gamut/db';
import keyManager from '../utils/KeyManager';
import circuitBreaker from '../utils/CircuitBreaker';
import logger from '../utils/logger';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

class AudioService {
  private readonly ELEVENLABS_API_URL = 'https://api.elevenlabs.io/v1';

  /**
   * Cleans text specifically for News Narration.
   * Handles currency ($1.5B -> 1.5 Billion dollars) and removes interruptions.
   */
  private cleanTextForAudio(text: string): string {
    if (!text) return "";
    let clean = text;

    // 1. Currency & Numbers ($1.5M -> 1.5 million dollars)
    clean = clean.replace(/\$([0-9\.,]+)\s?([mM]illion|[bB]illion|[tT]rillion)/gi, (match, num, magnitude) => {
        return `${num} ${magnitude} dollars`;
    });

    // 2. Formatting & Quotes
    let quoteOpen = false;
    clean = clean.replace(/["“”]/g, (char) => {
        if (char === '“') return " quote "; 
        if (char === '”') return "";        
        if (!quoteOpen) { quoteOpen = true; return " quote "; } 
        else { quoteOpen = false; return ""; }
    });

    // 3. Punctuation for pacing
    clean = clean.replace(/[-—–]/g, " "); // Replace dashes with pauses
    // RESTORED: Colon to pause conversion from old ttsService.ts
    clean = clean.replace(/:/g, ". . "); 
    clean = clean.replace(/\s+/g, " ").trim();

    return clean;
  }

  /**
   * Generates audio for an article, uploads to Cloudinary, and returns URL.
   * Includes DB Cache Check and Circuit Breaker.
   */
  async generateForArticle(articleId: string, text: string, headline: string): Promise<string | null> {
    // 1. Cache Check: Did we already make this?
    const existing = await prisma.article.findUnique({
      where: { id: articleId },
      select: { audioUrl: true }
    });
    if (existing?.audioUrl) {
      logger.info(`🎙️ Audio Cache Hit for ${articleId}`);
      return existing.audioUrl;
    }

    // 2. Circuit Breaker Check
    if (await circuitBreaker.isOpen('ELEVENLABS')) {
      logger.warn('Circuit Breaker OPEN for ElevenLabs. Skipping audio.');
      return null;
    }

    try {
      console.log(`🎙️ Generating HQ Audio: ${headline}`);
      const cleanText = this.cleanTextForAudio(text);
      
      // 3. Get API Key with Rotation
      const resultUrl = await keyManager.executeWithRetry('ELEVENLABS', async (apiKey) => {
        
        // A. Call ElevenLabs API (Stream)
        const response = await fetch(`${this.ELEVENLABS_API_URL}/text-to-speech/21m00Tcm4TlvDq8ikWAM/stream?optimize_streaming_latency=3`, {
          method: 'POST',
          headers: {
            'xi-api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg'
          },
          body: JSON.stringify({
            text: cleanText,
            model_id: "eleven_turbo_v2_5", // Fast & High Quality
            voice_settings: {
              stability: 0.50,       
              similarity_boost: 0.75, 
              style: 0.35,           
              use_speaker_boost: true
            }
          })
        });

        if (!response.ok) {
           if (response.status === 401 || response.status === 429) {
             throw new Error('Rate Limit/Auth Error'); // Triggers Key Rotation
           }
           throw new Error(`ElevenLabs Error: ${response.statusText}`);
        }

        // B. Stream directly to Cloudinary
        // We need to convert the web stream to a buffer for the Cloudinary uploader
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        return new Promise<string>((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: 'narrative_audio',
              public_id: `audio_${articleId}`,
              resource_type: 'video', // Cloudinary uses 'video' for audio files
              format: 'mp3',
              overwrite: true
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result?.secure_url || '');
            }
          );
          uploadStream.end(buffer);
        });
      });

      return resultUrl;

    } catch (error) {
      logger.error('❌ Audio Generation Failed:', error);
      await circuitBreaker.recordFailure('ELEVENLABS');
      return null;
    }
  }
}

export const audioService = new AudioService();
