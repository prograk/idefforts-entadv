import { Pinecone } from "@pinecone-database/pinecone";

let pinecone: Pinecone | null = null;

interface QueryVectorOptions {
  vector: number[];
  topK?: number;
  includeMetadata?: boolean;
  filter?: object;
}

interface QueryMatch {
  id: string;
  score: number;
  metadata?: object;
  values?: number[];
}

interface QueryResponse {
  matches?: QueryMatch[];
  [key: string]: any;
}

export async function initPinecone() {
  if (!pinecone) {
    pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY!,
    });
  }
  return pinecone;
}

export async function upsertVector(indexName: string, id: string, values: number[], metadata?: Record<string, any>) {
  try {
    const client = await initPinecone();
    const index = client.Index(indexName);
    await index.upsert([
      { id, values, metadata }
    ]);
  } catch (error) {
    console.error("Pinecone upsert error:", error);
    throw error;
  }
}

export async function queryVector(
  indexName: string,
  embedding: number[],
  topK: number = 5
): Promise<QueryMatch[]> {
  const client = await initPinecone();
  const index = client.Index(indexName).namespace("default");

  const query: QueryVectorOptions = {
    vector: embedding,
    topK: topK ?? 5, // Ensure topK is always a number
    includeMetadata: true,
    // Add filter if needed
  };

  const response = await index.query(query as any);

  // Map matches to ensure 'score' is always a number and matches QueryMatch type
  const matches: QueryMatch[] = (response.matches || [])
    .filter((match: any) => typeof match.score === "number")
    .map((match: any) => ({
      id: match.id,
      score: match.score as number,
      metadata: match.metadata,
      values: match.values,
    }));

  return matches;
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