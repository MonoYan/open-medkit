export interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string;
          }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

export interface StreamChunkResponse {
  choices?: Array<{
    delta?: {
      content?:
        | string
        | Array<{
            type?: string;
            text?: string | { value?: string };
            value?: string;
          }>;
    };
  }>;
}

export type MessageContent =
  | string
  | Array<
      | { type: 'text'; text: string }
      | { type: 'image_url'; image_url: { url: string } }
    >;

export type ChatMessage = { role: 'system' | 'user'; content: MessageContent };

export type QueryResponseStyle = 'concise' | 'detailed';
