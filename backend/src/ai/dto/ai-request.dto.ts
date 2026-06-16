import { IsString, IsEnum, IsOptional, MaxLength } from 'class-validator';

export enum AiAction {
  SUMMARIZE = 'summarize',
  REWRITE = 'rewrite',
  TRANSLATE = 'translate',
  EXPLAIN = 'explain',
  ASK = 'ask',
}

export enum AiProvider {
  GROQ = 'groq',
}

export class AiRequestDto {
  @IsEnum(AiAction)
  action: AiAction;

  @IsString()
  @MaxLength(10000)
  text: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  question?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  targetLanguage?: string;

  @IsOptional()
  @IsEnum(AiProvider)
  aiProvider?: AiProvider;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  model?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  apiKey?: string;
}
