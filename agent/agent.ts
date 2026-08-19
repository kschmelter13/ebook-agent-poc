import { defineAgent } from "eve";

export default defineAgent({
  model: "openai/gpt-5.6-terra",
  reasoning: "medium",
  limits: {
    maxOutputTokensPerSession: 80_000,
    sessionTimeoutMs: 7 * 24 * 60 * 60 * 1000,
  },
});
