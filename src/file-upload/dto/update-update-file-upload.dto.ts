import { PartialType } from '@nestjs/mapped-types';
import { CreateFileUploadDto } from './create-update-file-upload.dto copy';

export class UpdateFileUploadDto extends PartialType(CreateFileUploadDto) {
  name: string;
  age: number;
}
