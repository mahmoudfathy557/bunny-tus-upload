import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsString, IsNotEmpty, Min } from 'class-validator';

export class InitiateUploadDto {
  @ApiProperty({
    description: 'The desired filename for the uploaded video on Bunny.net',
    example: 'my-awesome-video.mp4',
  })
  @IsString()
  @IsNotEmpty()
  filename: string;

  @ApiProperty({
    description: 'The total size of the file in bytes.',
    example: 1024 * 1024 * 50, // 50 MB
  })
  @IsNumber()
  @Min(1, { message: 'File size must be at least 1 byte.' })
  fileSize: number;

  @ApiProperty({
    description:
      'Optional: ID of the collection to which the video should be added.',
    required: false,
    example: 'some-collection-id',
  })
  @IsString()
  @IsNotEmpty()
  collectionId?: string;
}
