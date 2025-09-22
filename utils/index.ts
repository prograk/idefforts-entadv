import { Message, OpenAIModel } from "@/types";
import { createParser, ParsedEvent, ReconnectInterval } from "eventsource-parser";

export const OpenAIStream = async (messages: Message[]) => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    method: "POST",
    body: JSON.stringify({
      model: OpenAIModel.DAVINCI_TURBO,
      messages: [
        {
          role: "system",
          content: "You are an assistant that extracts and summarizes information from meeting transcripts. When given a transcript, provide key details like participants, main topics, and important points discussed."
        },
        ...messages
      ],
      max_tokens: 800,
      temperature: 0.1,
      stream: true
    })
  });

  if (!res.ok) {
    const errorText = await res.text();
    let errorMessage = `OpenAI API Error: ${res.status} ${res.statusText}`;
    
    try {
      // Try to parse the error response as JSON
      const errorJson = JSON.parse(errorText);
      if (errorJson.error && errorJson.error.message) {
        errorMessage += ` - ${errorJson.error.message}`;
      }
    } catch (parseError) {
      // If parsing fails, include the raw error text if it's not too long
      if (errorText && errorText.length < 200) {
        errorMessage += ` - ${errorText}`;
      }
    }
    
    console.error(`OpenAI API error: ${errorMessage}`);
    throw new Error(errorMessage);
  }

  const stream = new ReadableStream({
    async start(controller) {
      const onParse = (event: ParsedEvent | ReconnectInterval) => {
        if (event.type === "event") {
          const data = event.data;

          if (data === "[DONE]") {
            controller.close();
            return;
          }

          try {
            const json = JSON.parse(data);
            const text = json.choices[0].delta.content;
            const queue = encoder.encode(text);
            controller.enqueue(queue);
          } catch (e) {
            controller.error(e);
          }
        }
      };

      const parser = createParser(onParse);

      for await (const chunk of res.body as any) {
        parser.feed(decoder.decode(chunk));
      }
    }
  });

  return stream;
};
