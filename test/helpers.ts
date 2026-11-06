import type Anthropic from "@anthropic-ai/sdk";
import type { ClaudeClient } from "../src/triage";
import type { Triage } from "../src/schema";

export const goodTriage: Triage = {
  language: "en",
  category: "network_vpn",
  impact: "single_user",
  urgency: "medium",
  kb_article: "KB-004",
  needs_technician: false,
  technician_reasons: [],
  suspicious_instructions: false,
  summary_en: "User can't connect to the VPN from home.",
  draft_reply: "Hi Tom, sorry about the VPN trouble. The steps below usually fix it. If not, reply here and a technician will help.",
  confidence: "high",
};

type Captured = { params?: Anthropic.MessageCreateParamsNonStreaming };

export function fakeClient(
  reply: { text?: string; stop_reason?: Anthropic.Message["stop_reason"]; throws?: Error },
  captured: Captured = {},
): ClaudeClient {
  return {
    messages: {
      create: (async (params: Anthropic.MessageCreateParamsNonStreaming) => {
        captured.params = params;
        if (reply.throws) throw reply.throws;
        return {
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "claude-haiku-5-5",
          stop_reason: reply.stop_reason ?? "end_turn",
          stop_sequence: null,
          stop_details: reply.stop_reason === "refusal" ? { type: "refusal", category: "cyber", explanation: null } : null,
          content: [{ type: "text", text: reply.text ?? JSON.stringify(goodTriage), citations: null }],
          usage: { input_tokens: 2000, output_tokens: 500 },
        } as unknown as Anthropic.Message;
      }) as unknown as ClaudeClient["messages"]["create"],
    },
  };
}
