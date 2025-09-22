import { Pinecone } from "@pinecone-database/pinecone";

let pinecone: Pinecone | null = null;

export async function initPinecone() {
  if (!pinecone) {
    pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
  }
  return pinecone;
}

export async function upsertVector(indexName: string, id: string, values: number[], metadata?: object) {
  try {
    const client = await initPinecone();
    const index = client.Index(indexName);
    await index.upsert({
      upsertRequest: {
        vectors: [{ id, values, metadata }],
      },
    });
  } catch (error) {
    console.error("Pinecone upsert error:", error);
    throw error;
  }
}

export async function queryVector(indexName, embedding, topK = 5) {
  const client = await initPinecone();
  const index = client.Index(indexName).namespace("default");

  const query = {
    vector: embedding,
    topK,
    includeMetadata: true,
    // Add filter if needed
  };

  const response = await index.query(query); // <-- Correct usage

  return response.matches || [];
}

export async function getEmbedding(text: string): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: "text-embedding-3-small",
      input: text,
    }),
  });

  if (!res.ok) throw new Error("Failed to get embedding");
  const data = await res.json();
  return data.data[0].embedding;
}