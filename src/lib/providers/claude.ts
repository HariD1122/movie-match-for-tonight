import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { BriefSchema, type RawBrief } from "../brief";

const MODEL = "claude-opus-5";

export async function briefFromClaude(system: string, prompt: string): Promise<RawBrief | null> {
  const client = new Anthropic();
  const res = await client.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    system,
    output_config: { effort: "low", format: zodOutputFormat(BriefSchema) },
    messages: [{ role: "user", content: prompt }],
  });
  return res.parsed_output ?? null;
}
