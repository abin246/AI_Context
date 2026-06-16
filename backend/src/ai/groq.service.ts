import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class GroqService {
  private readonly apiUrl: string;
  private readonly defaultApiKey?: string;
  private readonly defaultModel: string;

  constructor(private configService: ConfigService) {
    this.defaultApiKey = this.configService.get<string>('GROQ_API_KEY');
    this.apiUrl =
      this.configService.get<string>('GROQ_API_URL') ||
      'https://api.groq.com/openai/v1/chat/completions';
    this.defaultModel =
      this.configService.get<string>('GROQ_MODEL') || 'llama-3.3-70b-versatile';
  }

  async generateResponse(
    prompt: string,
    apiKey?: string,
    model?: string
  ): Promise<string> {
    const key = apiKey || this.defaultApiKey;
    const selectedModel = model || this.defaultModel;

    if (!key) {
      throw new HttpException(
        {
          statusCode: HttpStatus.BAD_REQUEST,
          message:
            'Groq API key is not configured. Add it in the extension settings or set GROQ_API_KEY in backend/.env.',
          error: 'Missing API Key',
        },
        HttpStatus.BAD_REQUEST
      );
    }

    const client = this.createClient(key);

    try {
      const response = await client.post('', {
        model: selectedModel,
        messages: [
          {
            role: 'system',
            content:
              'You are a helpful AI assistant integrated into a browser extension. Provide clear, concise, and accurate responses.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_completion_tokens: 1000,
      });

      if (response.data?.choices?.[0]?.message?.content) {
        return response.data.choices[0].message.content.trim();
      }

      throw new Error('Invalid response from Groq API');
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status || HttpStatus.INTERNAL_SERVER_ERROR;
        const message = this.getErrorMessage(status, error, selectedModel);

        throw new HttpException(
          {
            statusCode: status,
            message: `Groq API Error: ${message}`,
            error: 'AI Service Error',
          },
          status
        );
      }

      throw new HttpException(
        {
          statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to generate AI response',
          error: 'Internal Server Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private createClient(apiKey: string): AxiosInstance {
    return axios.create({
      baseURL: this.apiUrl,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      timeout: 30000,
    });
  }

  private getErrorMessage(
    status: number,
    error: unknown,
    model: string
  ): string {
    if (!axios.isAxiosError(error)) {
      return 'Failed to generate AI response';
    }

    const apiMessage = error.response?.data?.error?.message;
    const message = typeof apiMessage === 'string' ? apiMessage : error.message;

    if (status === HttpStatus.UNAUTHORIZED) {
      return `${message} Check that your Groq API key is valid.`;
    }

    if (status === HttpStatus.FORBIDDEN) {
      return `${message} Check that your Groq account can use the selected model. Current model: ${model}`;
    }

    if (status === HttpStatus.NOT_FOUND) {
      return `${message} Check GROQ_API_URL and the selected model. Current model: ${model}`;
    }

    return message;
  }
}
