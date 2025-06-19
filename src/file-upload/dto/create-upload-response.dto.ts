import { ApiProperty } from '@nestjs/swagger';

export class CreateUploadResponseDto {
  @ApiProperty({
    description: 'The unique ID of the newly created upload session.',
    example: 'your-session-id',
  })
  id: string;

  @ApiProperty({
    description: 'The URL of the newly created upload resource.',
    example: '/uploads/your-session-id',
  })
  location: string;

  @ApiProperty({
    description: 'The expiration date/time of the upload session.',
    example: '2025-12-31T23:59:59Z',
    format: 'date-time',
  })
  expires: string;
}
