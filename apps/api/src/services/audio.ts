import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config'; // Assumes you have CLOUDINARY_ env vars in config
import fs from 'fs';
import path from 'path';
import os from 'os';
// We use dynamic import or standard fetch for OpenAI to keep it lightweight
// If you use a different TTS provider, swap the 'generateAudioFile' logic.

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const audioService = {
  /**
   * Generates audio for an article and returns the secure URL.
   */
  async generateForArticle(articleId: string, text: string, headline: string): Promise<string | null> {
    try {
      console.log(`🎙️ Generating Audio for: ${headline}`);

      // 1. Generate Audio Buffer (Using OpenAI TTS as the standard high-quality upgrade)
      // You can swap this with Google TTS or AWS Polly if preferred.
      const mp3Buffer = await this.generateAudioFromText(text);

      if (!mp3Buffer) return null;

      // 2. Save temporarily
      const tempFilePath = path.join(os.tmpdir(), `${articleId}.mp3`);
      await fs.promises.writeFile(tempFilePath, mp3Buffer);

      // 3. Upload to Cloudinary
      const uploadResult = await cloudinary.uploader.upload(tempFilePath, {
        resource_type: 'video', // Cloudinary treats audio as 'video' type usually
        public_id: `narrative/audio/${articleId}`,
        folder: 'narrative_audio',
        format: 'mp3',
      });

      // 4. Cleanup
      await fs.promises.unlink(tempFilePath);

      return uploadResult.secure_url;
    } catch (error) {
      console.error('❌ Audio Generation Failed:', error);
      return null;
    }
  },

  async generateAudioFromText(text: string): Promise<Buffer | null> {
    try {
      if (!process.env.OPENAI_API_KEY) {
        console.warn("⚠️ No OPENAI_API_KEY found. Skipping Audio Generation.");
        return null;
      }

      // Truncate if too long (OpenAI limit is 4096 chars)
      const safeText = text.slice(0, 4000); 

      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: safeText,
          voice: 'alloy', // Options: alloy, echo, fable, onyx, nova, shimmer
        }),
      });

      if (!response.ok) throw new Error(`OpenAI API Error: ${response.statusText}`);

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      console.error('TTS API Call Failed:', err);
      return null;
    }
  }
};
