import { Injectable } from '@nestjs/common';
import { CreateFileUploadDto } from './dto/create-update-file-upload.dto';
import { UpdateFileUploadDto } from './dto/update-update-file-upload.dto';

@Injectable()
export class FileUploadService {
  create(createFileUploadDto: CreateFileUploadDto) {
    return 'This action adds a new file-upload';
  }

  findAll() {
    return `This action returns all file-uploads`;
  }

  findOne(id: number) {
    return `This action returns a #id file-upload`;
  }

  update(id: number, updateFileUploadDto: UpdateFileUploadDto) {
    return `This action updates a #id file-upload`;
  }

  remove(id: number) {
    return `This action removes a #id file-upload`;
  }
}
