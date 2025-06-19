import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosResponse } from 'axios';
import * as crypto from 'crypto';

export interface BunnyUploadResponse {
  guid: string;
  libraryId: number;
  videoId: string;
  authorizeTusUpload: {
    authorizationSignature: string;
    authorizationExpire: number;
  };
}

@Injectable()
export class BunnyService {
  private readonly logger = new Logger(BunnyService.name);
  private readonly apiKey: string;
  private readonly libraryId: string;
  private readonly cdnUrl: string;
  private readonly pullZone: string;
  private readonly securityKey: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('BUNNY_STREAM_API_KEY')!;
    this.libraryId = this.configService.get<string>('BUNNY_STREAM_LIBRARY_ID')!;
    this.cdnUrl = this.configService.get<string>('BUNNY_STREAM_CDN_URL')!;
    this.pullZone = this.configService.get<string>('BUNNY_STREAM_PULL_ZONE')!;
    this.securityKey = this.configService.get<string>(
      'BUNNY_STREAM_SECURITY_KEY',
    )!;

    if (!this.apiKey || !this.libraryId || !this.securityKey) {
      throw new Error('Missing required Bunny.net configuration');
    }
  }

  async createVideo(
    title: string,
    collectionId?: string,
  ): Promise<BunnyUploadResponse> {
    try {
      const response: AxiosResponse<BunnyUploadResponse> = await axios.post(
        `https://video.bunnycdn.com/library/${this.libraryId}/videos`,
        {
          title: title,
          ...(collectionId && { collectionId }),
        },
        {
          headers: {
            AccessKey: this.apiKey,
            'Content-Type': 'application/json',
          },
        },
      );

      this.logger.log(`Created video: ${response.data.guid}`);
      return response.data;
    } catch (error) {
      this.logger.error(
        'Failed to create video in Bunny.net',
        error.response?.data || error.message,
      );
      throw new Error('Failed to create video');
    }
  }

  async getTusUploadUrl(videoId: string): Promise<string> {
    return `https://video.bunnycdn.com/tusupload/${this.libraryId}/${videoId}`;
  }

  async getVideoInfo(videoId: string) {
    try {
      const response = await axios.get(
        `https://video.bunnycdn.com/library/${this.libraryId}/videos/${videoId}`,
        {
          headers: {
            AccessKey: this.apiKey,
          },
        },
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        'Failed to get video info',
        error.response?.data || error.message,
      );
      throw new Error('Failed to get video info');
    }
  }

  async deleteVideo(videoId: string): Promise<boolean> {
    try {
      await axios.delete(
        `https://video.bunnycdn.com/library/${this.libraryId}/videos/${videoId}`,
        {
          headers: {
            AccessKey: this.apiKey,
          },
        },
      );
      this.logger.log(`Deleted video: ${videoId}`);
      return true;
    } catch (error) {
      this.logger.error(
        'Failed to delete video',
        error.response?.data || error.message,
      );
      return false;
    }
  }

  getVideoUrl(videoId: string): string {
    const expires = Math.floor(Date.now() / 1000) + 3600; // Link valid for 1 hour
    const hash = crypto
      .createHash('sha256')
      .update(`${this.securityKey}${videoId}${expires}`)
      .digest('hex');
    return `${this.cdnUrl}/${videoId}/playlist.m3u8?token=${hash}&expires=${expires}`;
  }

  getThumbnailUrl(videoId: string): string {
    const expires = Math.floor(Date.now() / 1000) + 3600; // Link valid for 1 hour
    const hash = crypto
      .createHash('sha256')
      .update(`${this.securityKey}${videoId}${expires}`)
      .digest('hex');
    return `${this.cdnUrl}/${videoId}/thumbnail.jpg?token=${hash}&expires=${expires}`;
  }
}
