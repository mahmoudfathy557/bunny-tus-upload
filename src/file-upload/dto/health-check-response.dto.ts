import { ApiProperty } from '@nestjs/swagger';

export class HealthCheckResponseDto {
  @ApiProperty({
    description: 'The status of the server.',
    example: 'ok',
  })
  status: string;

  @ApiProperty({
    description: 'The timestamp of the health check.',
    example: '2025-01-01T10:00:00Z',
    format: 'date-time',
  })
  timestamp: string;

  @ApiProperty({
    description: 'The TUS protocol version supported by the server.',
    example: '1.0.0',
  })
  tusVersion: string;

  @ApiProperty({
    description:
      'The maximum upload size supported by the server (e.g., "5GB").',
    example: '5GB',
  })
  maxSize: string;

  @ApiProperty({
    description: 'A list of TUS extensions supported by the server.',
    type: [String],
    example: ['creation', 'termination', 'checksum'],
  })
  extensions: string[];
}
