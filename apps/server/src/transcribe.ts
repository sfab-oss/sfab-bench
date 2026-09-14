import { gateway } from "@ai-sdk/gateway";
import { transcribe } from "ai";

const MAX_BYTES = 8 * 1024 * 1024;
const MODEL = process.env.STT_MODEL?.trim() || "openai/whisper-1";

export async function handleTranscribe(req: Request): Promise<Response> {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return Response.json({ error: "AI_GATEWAY_API_KEY is not set on the viewer server" }, { status: 503 });
  }

  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) {
    return Response.json({ error: "audio too large" }, { status: 413 });
  }

  try {
    const audio = Buffer.from(await req.arrayBuffer());
    if (audio.byteLength > MAX_BYTES) {
      return Response.json({ error: "audio too large" }, { status: 413 });
    }
    if (audio.length < 64) {
      return Response.json({ error: "empty recording" }, { status: 400 });
    }
    const result = await transcribe({
      model: gateway.transcriptionModel(MODEL),
      audio,
    });
    return Response.json({ text: result.text.trim() });
  } catch (err) {
    const status = (err as { status?: number }).status ?? 500;
    const message = err instanceof Error ? err.message : String(err);
    console.error("[transcribe]", message);
    return Response.json({ error: message }, { status });
  }
}
