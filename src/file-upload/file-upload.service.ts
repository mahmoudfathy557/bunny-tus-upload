import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private readonly bunnyStreamApiKey: string;
  private readonly bunnyStreamLibraryId: string;
  private readonly bunnyStreamApiBaseUrl: string;
  private readonly bunnyTusUploadEndpoint: string;
  private readonly bunnyAuthSignatureExpiresInSeconds: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.bunnyStreamApiKey = this.configService.get<string>(
      'BUNNY_STREAM_API_KEY',
    )!;
    this.bunnyStreamLibraryId = this.configService.get<string>(
      'BUNNY_STREAM_LIBRARY_ID',
    )!;
    this.bunnyStreamApiBaseUrl = this.configService.get<string>(
      'BUNNY_STREAM_API_BASE_URL',
      'https://video.bunnycdn.com',
    );
    this.bunnyTusUploadEndpoint = this.configService.get<string>(
      'BUNNY_TUS_UPLOAD_ENDPOINT',
      'https://tus.bunnycdn.com/files/',
    )!;
    this.bunnyAuthSignatureExpiresInSeconds = parseInt(
      this.configService.get<string>(
        'BUNNY_AUTH_SIGNATURE_EXPIRES_IN_SECONDS',
        '3600',
      ),
      10,
    )!;

    if (
      !this.bunnyStreamApiKey ||
      !this.bunnyStreamLibraryId ||
      !this.bunnyTusUploadEndpoint ||
      !this.bunnyAuthSignatureExpiresInSeconds
    ) {
      this.logger.error(
        'Bunny.net API key, Library ID, TUS Upload Endpoint, or Auth Signature Expiration is not configured.',
      );
      throw new InternalServerErrorException(
        'Bunny.net API configuration missing.',
      );
    }
  }

  /**
   * Generates a SHA256 signature for Bunny.net presigned TUS uploads.
   * Pseudo-function: sha256(library_id + api_key + expiration_time + video_id)
   * @param libraryId The ID of the Bunny.net video library.
   * @param apiKey Your Bunny.net Stream API key.
   * @param expirationTime Unix timestamp in seconds when the signature expires.
   * @param videoId The GUID of the video object on Bunny.net.
   * @returns The SHA256 signature as a hexadecimal string.
   */
  private generateBunnySignature(
    libraryId: string,
    apiKey: string,
    expirationTime: number,
    videoId: string,
  ): string {
    const dataToSign = `${libraryId}${apiKey}${expirationTime}${videoId}`;
    return crypto.createHash('sha256').update(dataToSign).digest('hex');
  }

  /**
   * Initiates a TUS resumable upload session with Bunny.net Stream.
   * This method sends a POST request to Bunny.net to create a new video object
   * and returns the TUS upload URL from the 'Location' header.
   *
   * @param filename The desired filename for the video.
   * @param fileSize The total size of the file in bytes.
   * @param collectionId Optional ID of the collection to add the video to.
   * @returns The TUS upload URL provided by Bunny.net.
   * @throws InternalServerErrorException if the Bunny.net API call fails.
   */
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
      this.logger.debug(
        `Request Headers: ${JSON.stringify(createVideoHeaders)}`,
      );

      // Construct the request body based on provided parameters
      const createVideoBody: any = {
        title: filename,
      };

      // Add collectionId to the request body if provided
      if (collectionId && collectionId !== 'your-optional-collection-id') {
        createVideoBody.collectionId = collectionId;
      }

      // Add fileSize to the request body if provided
      if (fileSize) {
        createVideoBody.size = fileSize;
      }

      this.logger.debug(`Request Body: ${JSON.stringify(createVideoBody)}`);

      // Make the POST request to create the video object
      const createVideoResponse = await firstValueFrom(
        this.httpService.post(createVideoUrl, createVideoBody, {
          headers: createVideoHeaders,
          validateStatus: (status) => status === 200, // Expect 200 OK for video creation
        }),
      );

      // Check if the videoId is present in the response
      const videoId = createVideoResponse.data.guid; // Get the GUID of the newly created video

      if (!videoId) {
        throw new Error('Bunny.net did not return a Video ID after creation.');
      }
      this.logger.log(`Video object created. Video ID: ${videoId}`);

      // Step 2: Generate the presigned signature for TUS upload
      // The signature is generated using the libraryId, apiKey, expirationTime, and videoId
      const authorizationExpire =
        Math.floor(Date.now() / 1000) + this.bunnyAuthSignatureExpiresInSeconds;
      const authorizationSignature = this.generateBunnySignature(
        this.bunnyStreamLibraryId,
        this.bunnyStreamApiKey,
        authorizationExpire,
        videoId,
      );
      this.logger.log(
        `Signature generated successfully for video ID: ${videoId}`,
      );

      // Step 3: Return the TUS upload URL and signature
      const signaturedVideo = {
        endpoint: this.bunnyTusUploadEndpoint,
        authorizationSignature: authorizationSignature,
        authorizationExpire: authorizationExpire,
        videoId: videoId,
        libraryId: this.bunnyStreamLibraryId, // Include LibraryId for client
      };

      return signaturedVideo;
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(
          `Bunny.net API error: ${error.response?.status} - ${error.response?.data?.Message || error.message}`,
          error.response, // Log the full response object for more details
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
