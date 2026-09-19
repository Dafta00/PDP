import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Body,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import type { Response } from 'express';
import * as crypto from 'crypto';
import * as path from 'path';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/types/authenticated-user';
import {
  ALLOWED_ATTACHMENT_MIME_TYPES,
  MAX_ATTACHMENT_SIZE_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MESSAGE_ATTACHMENT_STORAGE_DIR,
  MessagesService,
} from './messages.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { QueryMessageDto } from './dto/query-message.dto';

@Controller('messages')
@UseGuards(JwtAuthGuard, RolesGuard, PermissionsGuard)
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get('contacts')
  @RequirePermissions('messages.send')
  listContacts(@CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.listContacts(user);
  }

  @Get('unread-count')
  @RequirePermissions('messages.view')
  unreadCount(@CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.unreadCount(user);
  }

  @Get()
  @RequirePermissions('messages.view')
  findAll(@Query() query: QueryMessageDto, @CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.findAll(query, user);
  }

  @Get(':id')
  @RequirePermissions('messages.view')
  findOne(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.messagesService.findOne(id, user);
  }

  @Get(':id/attachments/:attachmentId')
  @RequirePermissions('messages.view')
  async downloadAttachment(
    @Param('id') id: string,
    @Param('attachmentId') attachmentId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const { filePath, fileName, mimeType } = await this.messagesService.getAttachmentForDownload(
      id,
      attachmentId,
      user,
    );
    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
    res.sendFile(filePath);
  }

  @Post()
  @RequirePermissions('messages.send')
  @UseInterceptors(
    FilesInterceptor('attachments', MAX_ATTACHMENTS_PER_MESSAGE, {
      storage: diskStorage({
        destination: MESSAGE_ATTACHMENT_STORAGE_DIR,
        filename: (_req, file, cb) => {
          const ext = path.extname(file.originalname).toLowerCase();
          cb(null, `${crypto.randomUUID()}${ext}`);
        },
      }),
      limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        if (!ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.mimetype)) {
          cb(new BadRequestException('This attachment file type is not supported.'), false);
          return;
        }
        cb(null, true);
      },
    }),
  )
  create(
    @Body() dto: CreateMessageDto,
    @UploadedFiles() files: Express.Multer.File[],
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.messagesService.create(dto, files, user);
  }
}
