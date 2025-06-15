import { ApiProperty } from '@nestjs/swagger';

export class InitiateTusUploadResponseDto {
  @ApiProperty({
    description: 'The TUS upload endpoint provided by Bunny.net Stream.',
    example: 'https://video.bunnycdn.com/tus/your-video-id',
  })
  endpoint: string;

  @ApiProperty({
    description: 'The authorization signature required for the TUS upload.',
    example: 'your-authorization-signature',
  })
  authorizationSignature: string;

  @ApiProperty({
    description: 'The expiration timestamp for the authorization signature.',
    example: 1678886400, // Example Unix timestamp
  })
  authorizationExpire: number;

  @ApiProperty({
    description: 'The unique ID of the video created on Bunny.net Stream.',
    example: 'your-video-id',
  })
  videoId: string;

  @ApiProperty({
    description: 'The ID of the library where the video is stored.',
    example: 'your-library-id',
  })
  libraryId: string;
}
