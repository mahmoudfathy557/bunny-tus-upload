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
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BunnyService } from './bunny.service';
import axios from 'axios';
import { FileUploadService } from './file-upload.service';

@Controller('uploads')
export class FileUploadController {
  private readonly logger = new Logger(FileUploadController.name);

  constructor(
    private uploadService: FileUploadService,
    private bunnyService: BunnyService,
  ) {}

  // TUS Protocol: OPTIONS request for CORS and capabilities
  @Options('*')
  async handleOptions(@Res() res: Response) {
    res.setHeader('tus-resumable', '1.0.0');
    res.setHeader('tus-version', '1.0.0');
    res.setHeader('tus-max-size', '5368709120'); // 5GB
    res.setHeader('tus-extension', 'creation,termination,checksum');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader(
      'access-control-allow-methods',
      'POST,GET,HEAD,PATCH,PUT,OPTIONS',
    );
    res.setHeader(
      'access-control-allow-headers',
      'Origin,X-Requested-With,Content-Type,Upload-Length,Upload-Offset,Tus-Resumable,Upload-Metadata,Authorization,X-HTTP-Method-Override',
    );
    res.setHeader(
      'access-control-expose-headers',
      'Upload-Offset,Location,Upload-Length,Tus-Version,Tus-Resumable,Tus-Max-Size,Tus-Extension,Upload-Metadata',
    );
    return res.status(204).end();
  }

  // TUS Protocol: Create upload session
  @Post()
  async createUpload(
    @Headers('upload-length') uploadLength: string,
    @Headers('upload-metadata') uploadMetadata: string,
    @Headers('tus-resumable') tusResumable: string,
    @Res() res: Response,
  ) {
    this.logger.log('Creating new upload session');

    // Validate TUS version
    if (tusResumable !== '1.0.0') {
      return res.status(412).json({ error: 'Unsupported TUS version' });
    }

    if (!uploadLength) {
      return res
        .status(400)
        .json({ error: 'upload-length header is required' });
    }

    const filesize = parseInt(uploadLength, 10);
    if (isNaN(filesize) || filesize <= 0) {
      return res.status(400).json({ error: 'Invalid upload-length' });
    }

    // Parse metadata
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

    try {
      const session = await this.uploadService.createUploadSession(
        filename,
        filesize,
        metadata,
      );

      // Return TUS headers
      res.setHeader('tus-resumable', '1.0.0');
      res.setHeader('location', `/uploads/${session.id}`);
      res.setHeader('upload-expires', session.expiresAt.toISOString());

      return res.status(201).json({
        id: session.id,
        location: `/uploads/${session.id}`,
        expires: session.expiresAt.toISOString(),
      });
    } catch (error) {
      this.logger.error('Failed to create upload session', error);
      return res.status(500).json({ error: 'Failed to create upload session' });
    }
  }

  // TUS Protocol: Get upload info
  @Head(':id')
  async getUploadInfo(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.params.id;
    const session = this.uploadService.getUploadSession(sessionId);

    if (!session) {
      return res.status(404).end();
    }

    res.setHeader('tus-resumable', '1.0.0');
    res.setHeader('upload-offset', session.uploadOffset.toString());
    res.setHeader('upload-length', session.filesize.toString());
    res.setHeader('cache-control', 'no-store');

    return res.status(200).end();
  }

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

    // Validate TUS version
    if (tusResumable !== '1.0.0') {
      return res.status(412).json({ error: 'Unsupported TUS version' });
    }

    const session = this.uploadService.getUploadSession(sessionId);
    if (!session) {
      this.logger.error(`Upload session not found: ${sessionId}`);
      return res.status(404).json({ error: 'Upload session not found' });
    }

    if (!uploadOffset) {
      return res
        .status(400)
        .json({ error: 'upload-offset header is required' });
    }

    const offset = parseInt(uploadOffset, 10);
    if (isNaN(offset)) {
      return res.status(400).json({ error: 'Invalid upload-offset header' });
    }

    // Log offset comparison for debugging
    this.logger.log(
      `Session ${sessionId}: Client offset=${offset}, Server offset=${session.uploadOffset}`,
    );

    // Allow offset to be equal or less (for retries) but warn on mismatch
    if (offset < session.uploadOffset) {
      this.logger.warn(
        `Client offset ${offset} is behind server offset ${session.uploadOffset} for session ${sessionId}`,
      );
      // Return current server offset
      res.setHeader('tus-resumable', '1.0.0');
      res.setHeader('upload-offset', session.uploadOffset.toString());
      return res.status(409).json({
        error: 'Upload offset behind server state',
        expected: session.uploadOffset,
        received: offset,
      });
    }

    if (contentType !== 'application/offset+octet-stream') {
      return res.status(400).json({ error: 'Invalid content-type' });
    }

    try {
      // Get content length to track chunk size
      const contentLength = parseInt(req.headers['content-length'] || '0', 10);
      this.logger.log(
        `Uploading chunk: ${contentLength} bytes at offset ${offset} for session ${sessionId}`,
      );

      // Forward the chunk to Bunny.net TUS endpoint
      const response = await axios({
        method: 'PATCH',
        url: session.tusUploadUrl,
        data: req,
        headers: {
          'upload-offset': uploadOffset,
          'content-type': contentType,
          'tus-resumable': '1.0.0',
          'content-length': req.headers['content-length'],
        },
        maxRedirects: 0,
        validateStatus: (status) => status < 500, // Don't throw on 4xx errors
        timeout: 30000, // 30 second timeout
      });

      this.logger.log(
        `Bunny.net response status: ${response.status} for session ${sessionId}`,
      );

      // Get the new offset from Bunny.net response
      const bunnyOffset = response.headers['upload-offset'];
      const newOffset = bunnyOffset
        ? parseInt(bunnyOffset, 10)
        : offset + contentLength;

      this.logger.log(
        `Updated offset for session ${sessionId}: ${session.uploadOffset} -> ${newOffset}`,
      );

      // Update our session with the new offset
      this.uploadService.updateUploadOffset(sessionId, newOffset);

      // Check if upload is complete
      if (newOffset >= session.filesize) {
        this.uploadService.completeUploadSession(sessionId);
        this.logger.log(
          `Upload completed for session: ${sessionId}, video: ${session.videoId}`,
        );

        // Return final response with video info
        res.setHeader('tus-resumable', '1.0.0');
        res.setHeader('upload-offset', newOffset.toString());

        return res.status(200).json({
          completed: true,
          videoId: session.videoId,
          videoUrl: this.bunnyService.getVideoUrl(session.bunnyVideoId),
          thumbnailUrl: this.bunnyService.getThumbnailUrl(session.bunnyVideoId),
        });
      }

      // Return updated offset
      res.setHeader('tus-resumable', '1.0.0');
      res.setHeader('upload-offset', newOffset.toString());

      return res.status(204).end();
    } catch (error) {
      this.logger.error(
        `Failed to upload chunk to Bunny.net for session ${sessionId}:`,
        error.response?.data || error.message,
      );

      if (error.response?.status === 409) {
        // Offset conflict - get current offset from Bunny.net
        try {
          const headResponse = await axios.head(session.tusUploadUrl, {
            headers: { 'tus-resumable': '1.0.0' },
          });
          const currentOffset = parseInt(
            headResponse.headers['upload-offset'] || '0',
            10,
          );
          this.uploadService.updateUploadOffset(sessionId, currentOffset);

          res.setHeader('tus-resumable', '1.0.0');
          res.setHeader('upload-offset', currentOffset.toString());
          return res.status(409).json({
            error: 'Upload offset conflict',
            currentOffset: currentOffset,
            receivedOffset: offset,
          });
        } catch (headError) {
          this.logger.error(
            'Failed to get current offset from Bunny.net',
            headError,
          );
        }
      }

      return res.status(500).json({ error: 'Failed to upload chunk' });
    }
  }

  // Get upload session info (custom endpoint)
  @Get(':id')
  async getUploadSession(@Req() req: Request, @Res() res: Response) {
    const sessionId = req.params.id;
    const session = this.uploadService.getUploadSession(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Upload session not found' });
    }

    return res.json({
      id: session.id,
      videoId: session.videoId,
      filename: session.filename,
      filesize: session.filesize,
      uploadOffset: session.uploadOffset,
      progress: ((session.uploadOffset / session.filesize) * 100).toFixed(2),
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      metadata: session.metadata,
    });
  }

  // List all upload sessions (for debugging)
  @Get()
  async listUploadSessions(@Res() res: Response) {
    const sessions = this.uploadService.getAllSessions();
    return res.json({
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
    });
  }

  // Health check endpoint
  @Get('health')
  async healthCheck(@Res() res: Response) {
    return res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      tusVersion: '1.0.0',
      maxSize: '5GB',
      extensions: ['creation', 'termination', 'checksum'],
    });
  }
}
