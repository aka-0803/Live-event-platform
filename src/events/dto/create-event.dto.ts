import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateEventDto {
  @ApiProperty({ example: 'Football Match' })
  @IsString()
  @MinLength(3)
  title: string;

  @ApiProperty({ example: 'Live Match Discussion' })
  @IsString()
  @MinLength(3)
  description: string;
}
