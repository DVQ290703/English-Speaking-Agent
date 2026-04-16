export interface ChatRespondParams {
  token: string;
  text?: string;
  audioBlob?: Blob;
  history?: Array<{ role: string; text: string }>;
  topic?: string;
}

export interface ChatRespondResult {
  response_text: string;
  audio_base64?: string;
  audio_mime?: string;
  user_input?: string;
}

export function chatRespond(params: ChatRespondParams): Promise<ChatRespondResult>;
