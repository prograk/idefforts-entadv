export enum OpenAIModel {
  GPT_NANO = "gpt-4.1-nano",
  GPT_MINI = "gpt-4o-mini"
}

export interface Message {
  role: Role;
  content: string;
}

export type Role = "assistant" | "user";
