import { BadRequestException, Injectable } from '@nestjs/common';
import { GroqService } from './groq.service';
import { AiRequestDto, AiAction } from './dto/ai-request.dto';

@Injectable()
export class AiService {
  constructor(private readonly groqService: GroqService) {}

  async processRequest(request: AiRequestDto): Promise<string> {
    const prompt = this.buildPrompt(request);
    return await this.groqService.generateResponse(
      prompt,
      request.apiKey,
      request.model
    );
  }

  private buildPrompt(request: AiRequestDto): string {
    const { action, text, question, targetLanguage } = request;

    switch (action) {
      case AiAction.SUMMARIZE:
        return `Please provide a concise summary of the following text:\n\n${text}`;

      case AiAction.REWRITE:
        return `Please rewrite the following text to improve clarity and readability:\n\n${text}`;

      case AiAction.TRANSLATE: {
        const language = this.getTargetLanguage(targetLanguage, question);
        return `Please translate the following text to ${language}:\n\n${text}`;
      }

      case AiAction.EXPLAIN:
        return `Please explain the following text in simple terms:\n\n${text}`;

      case AiAction.ASK:
        if (!question) {
          throw new BadRequestException('Question is required for "ask" action');
        }
        return `Context: ${text}\n\nQuestion: ${question}\n\nPlease provide a detailed answer based on the context provided.`;

      default:
        throw new BadRequestException(`Unknown action: ${action}`);
    }
  }

  private getTargetLanguage(
    targetLanguage?: string,
    question?: string
  ): string {
    const directLanguage = targetLanguage?.trim();
    if (directLanguage) {
      return directLanguage;
    }

    const languageFromQuestion = question
      ?.match(/^Target language:\s*(.+)$/i)?.[1]
      ?.trim();

    return languageFromQuestion || 'English';
  }
}
