import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { BunnyService } from './bunny.service';
import { v4 as uuidv4 } from 'uuid';

export interface UploadSession {
  id: string;
  videoId: string;
  bunnyVideoId: string;
  filename: string;
  filesize: number;
  uploadOffset: number;
  tusUploadUrl: string;
  createdAt: Date;
  expiresAt: Date;
  metadata?: Record<string, string>;
}

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private readonly uploadSessions = new Map<string, UploadSession>();
  private readonly SESSION_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

  constructor(private bunnyService: BunnyService) {
    // Clean up expired sessions every hour
    setInterval(() => this.cleanupExpiredSessions(), 60 * 60 * 1000);
  }

  async createUploadSession(
    filename: string,
    filesize: number,
    metadata?: Record<string, string>,
  ): Promise<UploadSession> {
    try {
      // Create video in Bunny.net
      const bunnyResponse = await this.bunnyService.createVideo(filename);

      // Get TUS upload URL
      const tusUploadUrl = await this.bunnyService.getTusUploadUrl(
        bunnyResponse.videoId,
      );

      const session: UploadSession = {
        id: uuidv4(),
        videoId: bunnyResponse.guid,
        bunnyVideoId: bunnyResponse.videoId,
        filename,
        filesize,
        uploadOffset: 0,
        tusUploadUrl,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + this.SESSION_TIMEOUT),
        metadata,
      };

      this.uploadSessions.set(session.id, session);
      this.logger.log(
        `Created upload session: ${session.id} for video: ${session.videoId}`,
      );

      return session;
    } catch (error) {
      this.logger.error('Failed to create upload session', error);
      throw new BadRequestException('Failed to create upload session');
    }
  }

  getUploadSession(sessionId: string): UploadSession | undefined {
    const session = this.uploadSessions.get(sessionId);
    if (session && session.expiresAt > new Date()) {
      return session;
    }
    if (session) {
      this.uploadSessions.delete(sessionId);
    }
    return undefined;
  }

  updateUploadOffset(sessionId: string, offset: number): void {
    const session = this.uploadSessions.get(sessionId);
    if (session) {
      session.uploadOffset = offset;
      this.logger.log(
        `Updated upload offset for session ${sessionId}: ${offset}/${session.filesize}`,
      );
    }
  }

  completeUploadSession(sessionId: string): void {
    const session = this.uploadSessions.get(sessionId);
    if (session) {
      this.uploadSessions.delete(sessionId);
      this.logger.log(`Completed upload session: ${sessionId}`);
    }
  }

  private cleanupExpiredSessions(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [sessionId, session] of this.uploadSessions.entries()) {
      if (session.expiresAt <= now) {
        this.uploadSessions.delete(sessionId);
        // Optionally delete the video from Bunny.net if upload was never completed
        this.bunnyService.deleteVideo(session.bunnyVideoId).catch(() => {
          // Ignore errors during cleanup
        });
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired upload sessions`);
    }
  }

  getAllSessions(): UploadSession[] {
    return Array.from(this.uploadSessions.values());
  }
}
