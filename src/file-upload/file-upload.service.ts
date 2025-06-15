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

    if (
      !this.bunnyStreamApiKey ||
      !this.bunnyStreamLibraryId ||
      !this.bunnyTusUploadEndpoint
    ) {
      this.logger.error(
        'Bunny.net API key, Library ID, or TUS Upload Endpoint is not configured.',
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
  ): Promise<{ uploadUrl: string; videoId: string }> {
    const url = `${this.bunnyStreamApiBaseUrl}/library/${this.bunnyStreamLibraryId}/videos`;
    this.logger.log(`Initiating TUS upload to: ${url}`);

    try {
      const headers = {
        AccessKey: this.bunnyStreamApiKey,
        'Content-Type': 'application/json',
      };
      this.logger.debug(`Request Headers: ${JSON.stringify(headers)}`);

      const body: any = {
        title: filename, // Use filename as title by default
      };

      if (collectionId && collectionId !== 'your-optional-collection-id') {
        body.collectionId = collectionId;
      }
      this.logger.debug(`Request Body: ${JSON.stringify(body)}`);

      // Use firstValueFrom to convert the Observable to a Promise
      const response = await firstValueFrom(
        this.httpService.post(url, body, {
          headers,
          maxRedirects: 0,
          validateStatus: (status) => status === 200,
        }),
      );

      const videoId = response.data.guid; // The unique ID for the video on Bunny.net
      const uploadUrl = `${this.bunnyTusUploadEndpoint}${videoId}`; // Construct the TUS upload URL

      if (!videoId) {
        // Only check for videoId, uploadUrl is constructed
        throw new Error('Bunny.net did not return a Video ID.');
      }

      this.logger.log(
        `TUS upload initiated successfully. Video ID: ${videoId}, Upload URL: ${uploadUrl}`,
      );
      return { uploadUrl, videoId };
    } catch (error) {
      if (error instanceof AxiosError) {
        this.logger.error(
          `Bunny.net API error: ${error.response?.status} - ${JSON.stringify(error.response?.data)}`,
          error.response, // Log the full response object for more details
        );
        throw new InternalServerErrorException(
          `Failed to initiate TUS upload with Bunny.net: ${error.response?.data?.Message || error.message}`,
        );
      }
      this.logger.error(`An unexpected error occurred: ${error.message}`);
      throw new InternalServerErrorException(
        `An unexpected error occurred: ${error.message}`,
      );
    }
  }
}
