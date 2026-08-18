import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { MessagesService } from './messages.service';
import { ListMessagesDto } from './dto/list-messages.dto';
import { JwtAccessGuard } from '../auth/guards/jwt-access.guard';

@ApiTags('messages')
@ApiBearerAuth()
@UseGuards(JwtAccessGuard)
@Controller('events/:id/messages')
export class MessagesController {
  constructor(private readonly messagesService: MessagesService) {}

  @Get()
  list(@Param('id', ParseIntPipe) eventId: number, @Query() query: ListMessagesDto) {
    return this.messagesService.listForEvent(eventId, query);
  }
}
