import { ApiProperty } from '@nestjs/swagger';

export class UploadCompletedResponseDto {
  @ApiProperty({
    description: 'Indicates if the upload is completed.',
    example: true,
  })
  completed: boolean;

  @ApiProperty({
    description: 'The unique ID of the video created on Bunny.net Stream.',
    example: 'your-video-id',
  })
  videoId: string;

  @ApiProperty({
    description: 'The URL to access the uploaded video.',
    example: 'https://video.bunnycdn.com/your-video-id',
  })
  videoUrl: string;

  @ApiProperty({
    description: 'The URL to access the thumbnail of the uploaded video.',
    example: 'https://video.bunnycdn.com/your-video-id/thumbnail.jpg',
  })
  thumbnailUrl: string;
}
