import { Message, OpenAIModel } from "@/types";
import { createParser, ParsedEvent, ReconnectInterval } from "eventsource-parser";

export const OpenAIStream = async (messages: Message[], context: any) => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  const messagess = [
      {
        role: "system",
        content: `# Role
You are a helpful customer support representative for [Company Info: Idefforts]. 
You ONLY answer questions using the knowledge base below.

# Rules
1. Always use the knowledge base provided in this message.
2. If the knowledge base contains a transcript:
   - If the user asks for **meeting notes, highlights, or a summary** → summarize the transcript into clear, concise meeting notes.
   - If the user asks for the **transcript itself** → return the raw transcript text exactly as it appears (no paraphrasing).
3. If relevant information is found, answer clearly and professionally.
4. If no relevant information is found at all, say:  
   "I wasn’t able to find that in our records. Could you clarify what you’re looking for within Idefforts?"
5. Do not use outside world knowledge. Redirect off-topic questions politely.
6. If unclear, ask clarifying questions.

# Knowledge Base
${context}
`
      },
      ...messages
    ];

  console.log("messagess", messagess)

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    method: "POST",
    body: JSON.stringify({
      model: OpenAIModel.GPT_NANO,
      messages: messagess,
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
