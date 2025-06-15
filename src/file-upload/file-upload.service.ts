import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private readonly bunnyStreamApiKey: string;
  private readonly bunnyStreamLibraryId: string;
  private readonly bunnyStreamCdnUrl: string; // Consumed
  private readonly bunnyStreamPullZone: string; // Consumed
  private readonly bunnyTusUploadEndpoint: string; // Consumed
  private readonly bunnyStreamApiBaseUrl: string; // Consumed

  private readonly bunnyAuthSignatureExpiresInSeconds: number; // Consumed

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.bunnyStreamApiBaseUrl = this.configService.get<string>(
      'BUNNY_STREAM_API_BASE_URL',
      'https://video.bunnycdn.com',
    );
    this.bunnyStreamApiKey = this.configService.get<string>(
      'BUNNY_STREAM_API_KEY',
    )!;
    this.bunnyStreamLibraryId = this.configService.get<string>(
      'BUNNY_STREAM_LIBRARY_ID',
    )!;
    this.bunnyStreamCdnUrl = this.configService.get<string>(
      'BUNNY_STREAM_CDN_URL',
    )!;
    this.bunnyStreamPullZone = this.configService.get<string>(
      'BUNNY_STRAM_PULL_ZONE',
    )!;
    this.bunnyTusUploadEndpoint = this.configService.get<string>(
      'BUNNY_TUS_UPLOAD_ENDPOINT',
    )!;
    this.bunnyAuthSignatureExpiresInSeconds = parseInt(
      this.configService.get<string>(
        'BUNNY_AUTH_SIGNATURE_EXPIRES_IN_SECONDS',
        '3600',
      ),
      10,
    )!;

    // Check for essential API credentials and configuration
    if (
      !this.bunnyStreamApiKey ||
      !this.bunnyStreamLibraryId ||
      !this.bunnyTusUploadEndpoint ||
      !this.bunnyStreamCdnUrl ||
      !this.bunnyStreamPullZone
    ) {
      this.logger.error(
        'Bunny.net API key, Library ID, or TUS Upload Endpoint is not configured.',
      );
      throw new InternalServerErrorException(
        'Bunny.net API configuration missing.',
      );
    }
  }

  private generateBunnySignature(
    libraryId: string,
    apiKey: string,
    expirationTime: number,
    videoId: string,
  ): string {
    const dataToSign = `${libraryId}${apiKey}${expirationTime}${videoId}`;
    return crypto.createHash('sha256').update(dataToSign).digest('hex');
  }

  async initiateTusUpload(
    filename: string,
    fileSize: number,
    collectionId?: string,
  ): Promise<{
    endpoint: string;
    authorizationSignature: string;
    authorizationExpire: number;
    videoId: string;
    libraryId: string;
  }> {
    // API endpoint for creating video objects on Bunny Stream
    const createVideoUrl = `${this.bunnyStreamApiBaseUrl}/library/${this.bunnyStreamLibraryId}/videos`;
    this.logger.log(
      `Creating video object on Bunny.net Stream: ${createVideoUrl}`,
    );

    try {
      // Step 1: Create a video object to get the videoId (GUID)
      const createVideoHeaders = {
        AccessKey: this.bunnyStreamApiKey,
        'Content-Type': 'application/json',
      };

      const createVideoBody: any = {
        title: filename,
      };
      console.log(
        '🚀 ~ file: file-upload.service.ts:108 ~ createVideoBody:',
        createVideoBody,
      );

      if (collectionId) {
        createVideoBody.collectionId = collectionId;
      }

      const createVideoResponse = await firstValueFrom(
        this.httpService.post(createVideoUrl, createVideoBody, {
          headers: createVideoHeaders,
          validateStatus: (status) => status === 200,
        }),
      );
      console.log(
        '🚀 ~ file: file-upload.service.ts:117 ~ createVideoResponse:',
        createVideoResponse,
      );

      const videoId = createVideoResponse.data.guid; // Get the GUID of the newly created video
      console.log('🚀 ~ file: file-upload.service.ts:125 ~ videoId:', videoId);

      if (!videoId) {
        throw new Error('Bunny.net did not return a Video ID after creation.');
      }
      this.logger.log(`Video object created. Video ID: ${videoId}`);

      // Step 2: Generate the presigned signature for TUS upload
      const authorizationExpire =
        Math.floor(Date.now() / 1000) + this.bunnyAuthSignatureExpiresInSeconds;
      const authorizationSignature = this.generateBunnySignature(
        this.bunnyStreamLibraryId,
        this.bunnyStreamApiKey,
        authorizationExpire,
        videoId,
      );
      console.log(
        '🚀 ~ file: file-upload.service.ts:136 ~ authorizationSignature:',
        authorizationSignature,
      );
      this.logger.log(
        `Signature generated successfully for video ID: ${videoId}`,
      );

      return {
        endpoint: this.bunnyTusUploadEndpoint,
        authorizationSignature: authorizationSignature,
        authorizationExpire: authorizationExpire,
        videoId: videoId,
        libraryId: this.bunnyStreamLibraryId, // Include LibraryId for client
      };
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(
          `Bunny.net API error: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`,
        );
        throw new InternalServerErrorException(
          `Failed to create video object or generate signature with Bunny.net: ${error.response?.data?.Message || error.message}`,
        );
      }
      this.logger.error(`An unexpected error occurred: ${error.message}`);
      throw new InternalServerErrorException(
        `An unexpected error occurred: ${error.message}`,
      );
    }
  }
}
