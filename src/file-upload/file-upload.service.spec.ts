import { Test, TestingModule } from '@nestjs/testing';
import { FileUploadService } from './file-upload.service';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { AxiosError, AxiosResponse } from 'axios';
import { InternalServerErrorException } from '@nestjs/common';

describe('FileUploadService', () => {
  let service: FileUploadService;
  let httpService: HttpService;
  let configService: ConfigService;

  const mockBunnyStreamApiKey = 'mockApiKey';
  const mockBunnyStreamLibraryId = 'mockLibraryId';
  const mockBunnyStreamApiBaseUrl = 'https://mock.bunnycdn.com';
  const mockBunnyTusUploadEndpoint = 'https://mocktus.bunnycdn.com/files/';
  const mockBunnyAuthSignatureExpiresInSeconds = '3600';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileUploadService,
        {
          provide: HttpService,
          useValue: {
            post: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              switch (key) {
                case 'BUNNY_STREAM_API_KEY':
                  return mockBunnyStreamApiKey;
                case 'BUNNY_STREAM_LIBRARY_ID':
                  return mockBunnyStreamLibraryId;
                case 'BUNNY_STREAM_API_BASE_URL':
                  return mockBunnyStreamApiBaseUrl;
                case 'BUNNY_TUS_UPLOAD_ENDPOINT':
                  return mockBunnyTusUploadEndpoint;
                case 'BUNNY_AUTH_SIGNATURE_EXPIRES_IN_SECONDS':
                  return mockBunnyAuthSignatureExpiresInSeconds;
                default:
                  return null;
              }
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FileUploadService>(FileUploadService);
    httpService = module.get<HttpService>(HttpService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initiateTusUpload', () => {
    const filename = 'test-video.mp4';
    const fileSize = 1024;
    const collectionId = 'test-collection-id';
    const mockVideoGuid = 'mock-video-guid';

    it('should successfully initiate TUS upload and return signatured video details', async () => {
      const mockCreateVideoResponse: AxiosResponse = {
        data: { guid: mockVideoGuid },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {
          headers: {} as any, // Cast to any
        },
      };

      jest
        .spyOn(httpService, 'post')
        .mockReturnValueOnce(of(mockCreateVideoResponse));

      // Mock the private generateBunnySignature method
      const generateBunnySignatureSpy = jest.spyOn(
        service as any,
        'generateBunnySignature',
      );
      generateBunnySignatureSpy.mockReturnValue('mockSignature');

      const result = await service.initiateTusUpload(
        filename,
        fileSize,
        collectionId,
      );

      expect(httpService.post).toHaveBeenCalledWith(
        `${mockBunnyStreamApiBaseUrl}/library/${mockBunnyStreamLibraryId}/videos`,
        { title: filename, collectionId: collectionId, size: fileSize },
        {
          headers: {
            AccessKey: mockBunnyStreamApiKey,
            'Content-Type': 'application/json',
          },
          validateStatus: expect.any(Function),
        },
      );

      expect(generateBunnySignatureSpy).toHaveBeenCalledWith(
        mockBunnyStreamLibraryId,
        mockBunnyStreamApiKey,
        expect.any(Number), // expirationTime will be dynamic
        mockVideoGuid,
      );

      expect(result).toEqual({
        endpoint: mockBunnyTusUploadEndpoint,
        authorizationSignature: 'mockSignature',
        authorizationExpire: expect.any(Number),
        videoId: mockVideoGuid,
        libraryId: mockBunnyStreamLibraryId,
      });
    });

    it('should throw InternalServerErrorException if videoId is not returned', async () => {
      const mockCreateVideoResponse: AxiosResponse = {
        data: {}, // Missing guid
        status: 200,
        statusText: 'OK',
        headers: {},
        config: {
          headers: {} as any, // Cast to any
        },
      };

      jest
        .spyOn(httpService, 'post')
        .mockReturnValueOnce(of(mockCreateVideoResponse));

      await expect(
        service.initiateTusUpload(filename, fileSize),
      ).rejects.toThrow(
        new InternalServerErrorException(
          'An unexpected error occurred: Bunny.net did not return a Video ID after creation.',
        ),
      );
    });

    it('should throw InternalServerErrorException on AxiosError during video creation', async () => {
      const mockAxiosError = new AxiosError(
        'Request failed',
        'ERR_BAD_REQUEST',
        undefined,
        undefined,
        {
          status: 400,
          statusText: 'Bad Request', // Added statusText
          data: { Message: 'Invalid request' },
          headers: {},
          config: {
            headers: {}, // Changed undefined to {}
          },
        } as AxiosResponse,
      );

      jest
        .spyOn(httpService, 'post')
        .mockReturnValueOnce(throwError(() => mockAxiosError));

      await expect(
        service.initiateTusUpload(filename, fileSize),
      ).rejects.toThrow(
        new InternalServerErrorException(
          'Failed to create video object or generate signature with Bunny.net: Invalid request',
        ),
      );
    });

    it('should throw InternalServerErrorException on generic error during video creation', async () => {
      const mockGenericError = new Error('Something went wrong');
      jest
        .spyOn(httpService, 'post')
        .mockReturnValueOnce(throwError(() => mockGenericError));

      await expect(
        service.initiateTusUpload(filename, fileSize),
      ).rejects.toThrow(
        new InternalServerErrorException(
          'An unexpected error occurred: Something went wrong',
        ),
      );
    });
  });

  describe('generateBunnySignature', () => {
    it('should generate a correct SHA256 signature', () => {
      const libraryId = 'lib123';
      const apiKey = 'apiABC';
      const expirationTime = 1678886400; // Example Unix timestamp
      const videoId = 'vidXYZ';
      const expectedSignature = require('crypto')
        .createHash('sha256')
        .update(`${libraryId}${apiKey}${expirationTime}${videoId}`)
        .digest('hex');

      // Access the private method using bracket notation for testing purposes
      const signature = (service as any).generateBunnySignature(
        libraryId,
        apiKey,
        expirationTime,
        videoId,
      );

      expect(signature).toBe(expectedSignature);
    });
  });
});
