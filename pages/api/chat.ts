import { OpenAIStream } from "@/utils";
import { getEmbedding, initPinecone, queryVector } from "@/utils/pinecone";
import { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method Not Allowed" });
      return;
    }

    // Support both { message } and { messages } for backward compatibility
    const { message, messages } = req.body;

    // Always initialize Pinecone
    await initPinecone();

    let context = "";
    let userMessage = "";

    if (messages && Array.isArray(messages)) {
      // Use last message for context embedding
      const lastMsg = messages[messages.length - 1];
      userMessage = lastMsg.content;
      const embedding = await getEmbedding(userMessage);
      const pineconeResults = await queryVector(process.env.PINECONE_INDEX_NAME as string, embedding, 5);
      context = pineconeResults.map(r => (r.metadata as { text?: string })?.text ?? "").join("\n");
      // Limit messages by char count
      const charLimit = 12000;
      let charCount = 0;
      let messagesToSend = [];
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        if (charCount + msg.content.length > charLimit) {
          break;
        }
        charCount += msg.content.length;
        messagesToSend.push(msg);
      }

      // Add context as system message
      messagesToSend.push({ role: "user", content: `Extract meeting details from this transcript:${context}` });

      const stream = await OpenAIStream(messagesToSend);
      res.setHeader("Content-Type", "application/octet-stream");
      const reader = stream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
      res.end();
      return;
    }

    if (!message || typeof message !== "string") {
      res.status(400).json({ error: "Missing or invalid 'message' in request body." });
      return;
    }

    userMessage = message;
    const embedding = await getEmbedding(userMessage);
    const pineconeResults = await queryVector(process.env.PINECONE_INDEX_NAME as string, embedding, 5);
    context = pineconeResults.map(r => (r.metadata as { text?: string })?.text ?? "").join("\n");


    const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "Use the following context to answer the user's question." },
          { role: "user", content: `${context}\n\nUser question: ${userMessage}` }
        ],
        max_tokens: 800,
        temperature: 0.0,
      }),
    });

    const openAIResponseBody = await openAIResponse.json();

    if (openAIResponse.ok) {
      res.status(200).json({ results: openAIResponseBody.choices });
    } else {
      res.status(openAIResponse.status).json({ error: openAIResponseBody });
    }
  } catch (error) {
    console.error("Chat API error:", error);
    res.status(500).json({ error: (error as Error).message || "Internal Server Error" });
  }
}

