import { Module } from '@nestjs/common';
import { FileUploadController } from './file-upload.controller';
import { FileUploadService } from './file-upload.service';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';

@Module({
  imports: [
    HttpModule, // Import HttpModule to use HttpService in BunnyCdnService
    ConfigModule,
  ],
  controllers: [FileUploadController],
  providers: [FileUploadService],
  exports: [],
})
export class FileUploadModule {}
