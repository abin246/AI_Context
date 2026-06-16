export class AiResponseDto {
  result: string;
  action: string;
  timestamp: string;

  constructor(result: string, action: string) {
    this.result = result;
    this.action = action;
    this.timestamp = new Date().toISOString();
  }
}
