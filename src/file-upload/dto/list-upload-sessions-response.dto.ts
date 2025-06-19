import { ApiProperty } from '@nestjs/swagger';
import { GetUploadSessionResponseDto } from './get-upload-session-response.dto';

export class ListUploadSessionsResponseDto {
  @ApiProperty({
    description: 'An array of active upload sessions.',
    type: [GetUploadSessionResponseDto],
  })
  sessions: GetUploadSessionResponseDto[];

  @ApiProperty({
    description: 'The total number of active upload sessions.',
    example: 2,
  })
  total: number;
}
