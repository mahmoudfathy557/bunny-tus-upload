import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBody,
  ApiSecurity,
  ApiResponse,
} from '@nestjs/swagger';
import { FileUploadService } from './file-upload.service';
import { InitiateUploadDto } from './dto/initiate-file-upload.dto';
import { InitiateTusUploadResponseDto } from './dto/initiate-tus-upload-response.dto';

@ApiTags('File Upload') // Group endpoints under 'File Upload' tag in Swagger
@Controller('file-upload')
export class FileUploadController {
  constructor(private readonly bunnyCdnService: FileUploadService) {}

  @Post('initiate-tus-upload')
  @ApiOperation({
    summary: 'Initiate a TUS resumable upload session with Bunny.net Stream',
    description:
      'This endpoint first creates a video object on Bunny.net and then generates a presigned signature. The client should use the returned endpoint and authorization headers for the actual TUS upload.',
  })
  @ApiSecurity('BunnyNetApiKey') // Refers to the security scheme defined in main.ts
  @ApiBody({
    type: InitiateUploadDto,
    description: 'Details required to initiate the TUS upload.',
    examples: {
      a: {
        summary: 'Example: Large Video File',
        value: {
          filename: 'my-presentation-video.mp4',
          fileSize: 150 * 1024 * 1024, // 150 MB
          collectionId: 'your-optional-collection-id', // Optional
        } as InitiateUploadDto,
      },
      b: {
        summary: 'Example: Small Audio File',
        value: {
          filename: 'my-podcast-episode.mp3',
          fileSize: 10 * 1024 * 1024, // 10 MB
        } as InitiateUploadDto,
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request (e.g., invalid filename or fileSize).',
  })
  @ApiResponse({
    status: 500,
    description:
      'Internal Server Error (e.g., Bunny.net API call or signature generation failed).',
  })
  @ApiResponse({
    status: 200,
    description:
      'Successfully initiated the TUS upload session. Returns the presigned URL and authorization headers.',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized (e.g., missing or invalid API key).',
  })
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    type: InitiateTusUploadResponseDto,
  })
  async initiateTusUpload(@Body() initiateUploadDto: InitiateUploadDto) {
    const { filename, fileSize, collectionId } = initiateUploadDto;
    console.log(
      '🚀 ~ file: file-upload.controller.ts:41 ~ initiateUploadDto:',
      initiateUploadDto,
    );
    return this.bunnyCdnService.initiateTusUpload(
      filename,
      fileSize,
      collectionId,
    );
  }
}
