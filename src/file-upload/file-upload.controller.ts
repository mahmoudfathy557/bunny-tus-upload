import {
  Controller,
  Post,
  Get,
  Patch,
  Head,
  Options,
  Req,
  Res,
  Headers,
  BadRequestException,
  NotFoundException,
  Logger,
  HttpStatus,
  InternalServerErrorException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BunnyService } from './bunny.service';
import axios from 'axios';
import { FileUploadService } from './file-upload.service';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiHeader,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { CreateUploadResponseDto } from './dto/create-upload-response.dto';
import { GetUploadSessionResponseDto } from './dto/get-upload-session-response.dto';
import { ListUploadSessionsResponseDto } from './dto/list-upload-sessions-response.dto';
import { HealthCheckResponseDto } from './dto/health-check-response.dto';
import { UploadCompletedResponseDto } from './dto/upload-completed-response.dto';

const TUS_RESUMABLE_VERSION = '1.0.0';
const TUS_MAX_SIZE = 5368709120; // 5GB
const TUS_EXTENSIONS = 'creation,termination,checksum';

@ApiTags('TUS File Upload') // Group endpoints under 'TUS File Upload' tag in Swagger
@Controller('uploads')
export class FileUploadController {
  private readonly logger = new Logger(FileUploadController.name);

  constructor(
    private uploadService: FileUploadService,
    private bunnyService: BunnyService,
  ) {}

  private setTusHeaders(res: Response) {
    res.setHeader('Tus-Resumable', TUS_RESUMABLE_VERSION);
    res.setHeader('Tus-Version', TUS_RESUMABLE_VERSION);
    res.setHeader('Tus-Max-Size', TUS_MAX_SIZE.toString());
    res.setHeader('Tus-Extension', TUS_EXTENSIONS);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader(
      'Access-Control-Allow-Methods',
      'POST,GET,HEAD,PATCH,PUT,OPTIONS',
    );
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Origin,X-Requested-With,Content-Type,Upload-Length,Upload-Offset,Tus-Resumable,Upload-Metadata,Authorization,X-HTTP-Method-Override',
    );
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Upload-Offset,Location,Upload-Length,Tus-Version,Tus-Resumable,Tus-Max-Size,Tus-Extension,Upload-Metadata,Upload-Expires,Upload-Concat',
    );
  }

  @ApiOperation({
    summary: 'Handle TUS OPTIONS request for CORS and capabilities',
    description:
      'Responds with TUS protocol versions, extensions, and allowed headers for CORS preflight.',
  })
  @ApiResponse({
    status: 204,
    description: 'No Content - TUS capabilities and CORS headers returned.',
    headers: {
      'Tus-Resumable': {
        description: 'The TUS protocol version supported by the server.',
        schema: { type: 'string', example: '1.0.0' },
      },
      'Tus-Version': {
        description: 'The TUS protocol versions supported by the server.',
        schema: { type: 'string', example: '1.0.0' },
      },
      'Tus-Max-Size': {
        description:
          'The maximum upload size supported by the server (in bytes).',
        schema: { type: 'string', example: '5368709120' },
      },
      'Tus-Extension': {
        description: 'Comma-separated list of TUS extensions supported.',
        schema: { type: 'string', example: 'creation,termination,checksum' },
      },
      'Access-Control-Allow-Origin': {
        description: 'Allowed origins for CORS.',
        schema: { type: 'string', example: '*' },
      },
      'Access-Control-Allow-Methods': {
        description: 'Allowed HTTP methods for CORS.',
        schema: { type: 'string', example: 'POST,GET,HEAD,PATCH,PUT,OPTIONS' },
      },
      'Access-Control-Allow-Headers': {
        description: 'Allowed request headers for CORS.',
        schema: {
          type: 'string',
          example:
            'Origin,X-Requested-With,Content-Type,Upload-Length,Upload-Offset,Tus-Resumable,Upload-Metadata,Authorization,X-HTTP-Method-Override',
        },
      },
      'Access-Control-Expose-Headers': {
        description: 'Headers exposed to the client for CORS.',
        schema: {
          type: 'string',
          example:
            'Upload-Offset,Location,Upload-Length,Tus-Version,Tus-Resumable,Tus-Max-Size,Tus-Extension,Upload-Metadata',
        },
      },
    },
  })
  // TUS Protocol: OPTIONS request for CORS and capabilities
  @Options('*')
  async handleOptions(@Res() res: Response) {
    this.setTusHeaders(res);
    return res.status(204).end();
  }

  @ApiOperation({
    summary: 'Create a new TUS upload session',
    description:
      'Initiates a new resumable upload. The client must provide the Upload-Length and Upload-Metadata headers.',
  })
  @ApiHeader({
    name: 'Upload-Length',
    description: 'The size of the entire upload in bytes.',
    required: true,
    schema: { type: 'string', example: '1024000' }, // 1MB
  })
  @ApiHeader({
    name: 'Upload-Metadata',
    description:
      'Comma-separated key-value pairs of metadata. Values are base64 encoded.',
    required: false,
    schema: {
      type: 'string',
      example: 'filename bXlfdmlkZW8ubXA0,filetype dmlkZW8vbXA0',
    },
  })
  @ApiHeader({
    name: 'Tus-Resumable',
    description: 'The TUS protocol version used by the client.',
    required: true,
    schema: { type: 'string', example: '1.0.0' },
  })
  @ApiResponse({
    status: 201,
    description: 'Upload session created successfully.',
    headers: {
      'Tus-Resumable': {
        description: 'The TUS protocol version supported by the server.',
        schema: { type: 'string', example: '1.0.0' },
      },
      Location: {
        description: 'The URL of the newly created upload resource.',
        schema: { type: 'string', example: '/uploads/your-session-id' },
      },
      'Upload-Expires': {
        description: 'The expiration date/time of the upload session.',
        schema: { type: 'string', format: 'date-time' },
      },
    },
    type: CreateUploadResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request (e.g., missing or invalid Upload-Length).',
  })
  @ApiResponse({
    status: 412,
    description: 'Precondition Failed (Unsupported TUS version).',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error (Failed to create upload session).',
  })
  // TUS Protocol: Create upload session
  /**
   * Parses the TUS Upload-Metadata header into a key-value pair object.
   * @param uploadMetadata The raw Upload-Metadata header string.
   * @returns An object containing the parsed metadata.
   */
  private parseUploadMetadata(uploadMetadata: string): {
    metadata: Record<string, string>;
    filename: string;
  } {
    let metadata: Record<string, string> = {};
    let filename = 'untitled';

    if (uploadMetadata) {
      try {
        const pairs = uploadMetadata.split(',');
        for (const pair of pairs) {
          const [key, encodedValue] = pair.trim().split(' ');
          if (key && encodedValue) {
            metadata[key] = Buffer.from(encodedValue, 'base64').toString(
              'utf-8',
            );
          }
        }
        filename = metadata.name || filename;
      } catch (error) {
        this.logger.warn('Failed to parse upload metadata', error);
      }
    }
    return { metadata, filename };
  }

  @Post()
  async createUpload(
    @Headers('upload-length') uploadLength: string,
    @Headers('upload-metadata') uploadMetadata: string,
    @Headers('tus-resumable') tusResumable: string,
    @Res() res: Response,
  ) {
    this.logger.log('Creating new upload session');

    if (tusResumable !== TUS_RESUMABLE_VERSION) {
      throw new BadRequestException('Unsupported TUS version');
    }

    if (!uploadLength) {
      throw new BadRequestException('Upload-Length header is required');
    }

    const filesize = parseInt(uploadLength, 10);
    if (isNaN(filesize) || filesize <= 0) {
      throw new BadRequestException('Invalid Upload-Length');
    }

    const { metadata, filename } = this.parseUploadMetadata(uploadMetadata);

    try {
      const session = await this.uploadService.createUploadSession(
        filename,
        filesize,
        metadata,
      );

      res.setHeader('tus-resumable', TUS_RESUMABLE_VERSION);
      res.setHeader('location', `/uploads/${session.id}`);
      res.setHeader('upload-expires', session.expiresAt.toISOString());

      return res.status(HttpStatus.CREATED).json({
        id: session.id,
        location: `/uploads/${session.id}`,
        expires: session.expiresAt.toISOString(),
      });
    } catch (error) {
      this.logger.error('Failed to create upload session', error.stack);
      throw new InternalServerErrorException('Failed to create upload session');
    }
  }

  @ApiOperation({
    summary: 'Get TUS upload information (HEAD request)',
    description:
      'Retrieves the current offset and total length of an upload session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Upload information retrieved successfully.',
    headers: {
      'Tus-Resumable': {
        description: 'The TUS protocol version supported by the server.',
        schema: { type: 'string', example: '1.0.0' },
      },
      'Upload-Offset': {
        description: 'The current offset of the uploaded bytes.',
        schema: { type: 'string', example: '512000' },
      },
      'Upload-Length': {
        description: 'The total size of the upload in bytes.',
        schema: { type: 'string', example: '1024000' },
      },
      'Cache-Control': {
        description: 'Cache control header.',
        schema: { type: 'string', example: 'no-store' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Upload session not found.',
  })
  // TUS Protocol: Get upload info
  @Head(':id')
  async getUploadInfo(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.params.id;
    const session = this.uploadService.getUploadSession(sessionId);

    if (!session) {
      throw new NotFoundException('Upload session not found');
    }

    res.setHeader('tus-resumable', TUS_RESUMABLE_VERSION);
    res.setHeader('upload-offset', session.uploadOffset.toString());
    res.setHeader('upload-length', session.filesize.toString());
    res.setHeader('cache-control', 'no-store');

    return res.status(HttpStatus.OK).end();
  }

  @ApiOperation({
    summary: 'Upload a chunk of data to an existing TUS upload session',
    description:
      'Appends a chunk of data to the upload resource at the specified offset.',
  })
  @ApiConsumes('application/offset+octet-stream') // Specify content type for binary data
  @ApiHeader({
    name: 'Upload-Offset',
    description: 'The current offset of the uploaded bytes.',
    required: true,
    schema: { type: 'string', example: '0' },
  })
  @ApiHeader({
    name: 'Content-Type',
    description: 'Must be application/offset+octet-stream.',
    required: true,
    schema: { type: 'string', example: 'application/offset+octet-stream' },
  })
  @ApiHeader({
    name: 'Tus-Resumable',
    description: 'The TUS protocol version used by the client.',
    required: true,
    schema: { type: 'string', example: '1.0.0' },
  })
  @ApiBody({
    description: 'Binary data chunk to upload.',
    required: true,
    schema: {
      type: 'string',
      format: 'binary', // Indicate binary content
    },
  })
  @ApiResponse({
    status: 204,
    description: 'No Content - Chunk uploaded successfully.',
    headers: {
      'Tus-Resumable': {
        description: 'The TUS protocol version supported by the server.',
        schema: { type: 'string', example: '1.0.0' },
      },
      'Upload-Offset': {
        description: 'The new offset of the uploaded bytes after this chunk.',
        schema: { type: 'string', example: '1024000' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Upload completed successfully.',
    type: UploadCompletedResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Bad Request (e.g., missing headers, invalid content-type).',
  })
  @ApiResponse({
    status: 404,
    description: 'Upload session not found.',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict (Upload offset mismatch).',
  })
  @ApiResponse({
    status: 412,
    description: 'Precondition Failed (Unsupported TUS version).',
  })
  @ApiResponse({
    status: 500,
    description: 'Internal Server Error (Failed to upload chunk).',
  })
  // TUS Protocol: Upload chunk
  @Patch(':id')
  async uploadChunk(
    @Req() req: Request,
    @Res() res: Response,
    @Headers('upload-offset') uploadOffset: string,
    @Headers('content-type') contentType: string,
    @Headers('tus-resumable') tusResumable: string,
  ) {
    const sessionId = req.params.id;
    this.logger.log(
      `Uploading chunk for session: ${sessionId}, offset: ${uploadOffset}`,
    );

    if (tusResumable !== TUS_RESUMABLE_VERSION) {
      throw new BadRequestException('Unsupported TUS version');
    }

    const session = this.uploadService.getUploadSession(sessionId);
    if (!session) {
      this.logger.error(`Upload session not found: ${sessionId}`);
      throw new NotFoundException('Upload session not found');
    }

    if (!uploadOffset) {
      throw new BadRequestException('Upload-Offset header is required');
    }

    const offset = parseInt(uploadOffset, 10);
    if (isNaN(offset)) {
      throw new BadRequestException('Invalid Upload-Offset header');
    }

    this.logger.log(
      `Session ${sessionId}: Client offset=${offset}, Server offset=${session.uploadOffset}`,
    );

    if (offset < session.uploadOffset) {
      this.logger.warn(
        `Client offset ${offset} is behind server offset ${session.uploadOffset} for session ${sessionId}`,
      );
      res.setHeader('tus-resumable', TUS_RESUMABLE_VERSION);
      res.setHeader('upload-offset', session.uploadOffset.toString());
      return res.status(HttpStatus.CONFLICT).json({
        error: 'Upload offset behind server state',
        expected: session.uploadOffset,
        received: offset,
      });
    }

    if (contentType !== 'application/offset+octet-stream') {
      throw new BadRequestException('Invalid Content-Type');
    }

    try {
      const contentLength = parseInt(req.headers['content-length'] || '0', 10);
      this.logger.log(
        `Uploading chunk: ${contentLength} bytes at offset ${offset} for session ${sessionId}`,
      );

      const response = await axios({
        method: 'PATCH',
        url: session.tusUploadUrl,
        data: req,
        headers: {
          'upload-offset': uploadOffset,
          'content-type': contentType,
          'tus-resumable': TUS_RESUMABLE_VERSION,
          'content-length': req.headers['content-length'],
        },
        maxRedirects: 0,
        validateStatus: (status) => status < 500,
        timeout: 30000,
      });

      this.logger.log(
        `Bunny.net response status: ${response.status} for session ${sessionId}`,
      );

      const bunnyOffset = response.headers['upload-offset'];
      const newOffset = bunnyOffset
        ? parseInt(bunnyOffset, 10)
        : offset + contentLength;

      this.logger.log(
        `Updated offset for session ${sessionId}: ${session.uploadOffset} -> ${newOffset}`,
      );

      this.uploadService.updateUploadOffset(sessionId, newOffset);

      if (newOffset >= session.filesize) {
        this.uploadService.completeUploadSession(sessionId);
        this.logger.log(
          `Upload completed for session: ${sessionId}, video: ${session.videoId}`,
        );

        res.setHeader('tus-resumable', TUS_RESUMABLE_VERSION);
        res.setHeader('upload-offset', newOffset.toString());

        return res.status(HttpStatus.OK).json({
          completed: true,
          videoId: session.videoId,
          videoUrl: this.bunnyService.getVideoUrl(session.bunnyVideoId),
          thumbnailUrl: this.bunnyService.getThumbnailUrl(session.bunnyVideoId),
        });
      }

      res.setHeader('tus-resumable', TUS_RESUMABLE_VERSION);
      res.setHeader('upload-offset', newOffset.toString());

      return res.status(HttpStatus.NO_CONTENT).end();
    } catch (error) {
      this.logger.error(
        `Failed to upload chunk to Bunny.net for session ${sessionId}:`,
        error.response?.data || error.message,
      );

      if (error.response?.status === HttpStatus.CONFLICT) {
        try {
          const headResponse = await axios.head(session.tusUploadUrl, {
            headers: { 'tus-resumable': TUS_RESUMABLE_VERSION },
          });
          const currentOffset = parseInt(
            headResponse.headers['upload-offset'] || '0',
            10,
          );
          this.uploadService.updateUploadOffset(sessionId, currentOffset);

          res.setHeader('tus-resumable', TUS_RESUMABLE_VERSION);
          res.setHeader('upload-offset', currentOffset.toString());
          return res.status(HttpStatus.CONFLICT).json({
            error: 'Upload offset conflict',
            currentOffset: currentOffset,
            receivedOffset: offset,
          });
        } catch (headError) {
          this.logger.error(
            'Failed to get current offset from Bunny.net',
            headError,
          );
          throw new InternalServerErrorException(
            'Failed to resolve upload offset conflict',
          );
        }
      }

      throw new InternalServerErrorException('Failed to upload chunk');
    }
  }

  @ApiOperation({
    summary: 'Get detailed information about a specific upload session',
    description: 'Retrieves the current state and metadata of an upload.',
  })
  @ApiResponse({
    status: 200,
    description: 'Upload session information retrieved successfully.',
    type: GetUploadSessionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Upload session not found.',
  })
  // Get upload session info (custom endpoint)
  @Get(':id')
  async getUploadSession(@Req() req: Request) {
    const sessionId = req.params.id;
    const session = this.uploadService.getUploadSession(sessionId);

    if (!session) {
      throw new NotFoundException('Upload session not found');
    }

    return {
      id: session.id,
      videoId: session.videoId,
      filename: session.filename,
      filesize: session.filesize,
      uploadOffset: session.uploadOffset,
      progress: ((session.uploadOffset / session.filesize) * 100).toFixed(2),
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      metadata: session.metadata,
    };
  }

  @ApiOperation({
    summary: 'List all active TUS upload sessions (for debugging/monitoring)',
    description: 'Retrieves a list of all currently active upload sessions.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of upload sessions retrieved successfully.',
    type: ListUploadSessionsResponseDto,
  })
  // List all upload sessions (for debugging)
  @Get()
  async listUploadSessions() {
    const sessions = this.uploadService.getAllSessions();
    return {
      sessions: sessions.map((session) => ({
        id: session.id,
        videoId: session.videoId,
        filename: session.filename,
        filesize: session.filesize,
        uploadOffset: session.uploadOffset,
        progress: ((session.uploadOffset / session.filesize) * 100).toFixed(2),
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      })),
      total: sessions.length,
    };
  }

  @ApiOperation({
    summary: 'Health check endpoint for the TUS proxy server',
    description: 'Returns the status of the server and TUS capabilities.',
  })
  @ApiResponse({
    status: 200,
    description: 'Server is healthy and TUS capabilities are reported.',
    type: HealthCheckResponseDto,
  })
  // Health check endpoint
  @Get('health')
  async healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      tusVersion: TUS_RESUMABLE_VERSION,
      maxSize: TUS_MAX_SIZE,
      extensions: TUS_EXTENSIONS.split(','),
    };
  }
}
