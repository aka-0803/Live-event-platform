import { IsInt, IsString, MinLength } from 'class-validator';

export class SendMessageDto {
  @IsInt()
  eventId: number;

  @IsString()
  @MinLength(1)
  message: string;
}
