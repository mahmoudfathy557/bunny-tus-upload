import { ApiProperty } from '@nestjs/swagger';

export class GetUploadSessionResponseDto {
  @ApiProperty({
    description: 'The unique ID of the upload session.',
    example: 'your-session-id',
  })
  id: string;

  @ApiProperty({
    description: 'The unique ID of the video created on Bunny.net Stream.',
    example: 'your-video-id',
  })
  videoId: string;

  @ApiProperty({
    description: 'The filename of the uploaded video.',
    example: 'my-video.mp4',
  })
  filename: string;

  @ApiProperty({
    description: 'The total size of the file in bytes.',
    example: 1024000,
  })
  filesize: number;

  @ApiProperty({
    description: 'The current offset of the uploaded bytes.',
    example: 512000,
  })
  uploadOffset: number;

  @ApiProperty({
    description: 'The upload progress as a percentage (e.g., "50.00").',
    example: '50.00',
  })
  progress: string;

  @ApiProperty({
    description: 'The timestamp when the upload session was created.',
    example: '2025-01-01T10:00:00Z',
    format: 'date-time',
  })
  createdAt: string;

  @ApiProperty({
    description: 'The timestamp when the upload session expires.',
    example: '2025-01-01T11:00:00Z',
    format: 'date-time',
  })
  expiresAt: string;

  @ApiProperty({
    description: 'Additional metadata associated with the upload.',
    type: 'object',
    additionalProperties: { type: 'string' },
    example: { name: 'my-video.mp4', filetype: 'video/mp4' },
  })
  metadata: Record<string, string>;
}
