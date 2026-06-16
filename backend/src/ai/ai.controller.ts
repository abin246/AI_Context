import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AiService } from './ai.service';
import { AiRequestDto } from './dto/ai-request.dto';
import { AiResponseDto } from './dto/ai-response.dto';

@Controller('api/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async processAiRequest(@Body() request: AiRequestDto): Promise<AiResponseDto> {
    try {
      const result = await this.aiService.processRequest(request);
      return new AiResponseDto(result, request.action);
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message: error.message || 'Failed to process AI request',
          error: 'Internal Server Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  @Post('health')
  health() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
