type PlayTaskCategory = "weekly" | "daily";

export type PlayJudgeDecision = "approved" | "retry";

export type PlayJudgeVerdict = {
  decision: PlayJudgeDecision;
  score: number;
  summary: string;
  feedback: string;
  judgedAt: string;
  model: string;
};

const DEFAULT_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3-flash-preview";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const normalizeDecision = (value: unknown): PlayJudgeDecision =>
  typeof value === "string" && value.toLowerCase() === "approved" ? "approved" : "retry";

const normalizeSummary = (value: unknown, decision: PlayJudgeDecision) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (text) {
    return text.slice(0, 60);
  }
  return decision === "approved" ? "Submission accepted" : "Needs another pass";
};

const normalizeFeedback = (value: unknown, decision: PlayJudgeDecision) => {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (text) {
    return text.slice(0, 260);
  }
  return decision === "approved"
    ? "Judge accepted the submission as a plausible completion of the task."
    : "Judge wants a clearer submission that directly completes the task.";
};

const extractCandidateText = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const candidates = (payload as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })
    .candidates;
  const parts = candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
};

const extractJsonBlock = (value: string) => {
  const trimmed = value.trim();
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
};

const buildFallbackVerdict = (rawText: string, judgedAt: string): PlayJudgeVerdict => {
  const decision = /approved|accept|pass/i.test(rawText) ? "approved" : "retry";
  return {
    decision,
    score: decision === "approved" ? 7 : 5,
    summary: normalizeSummary("", decision),
    feedback: normalizeFeedback(rawText, decision),
    judgedAt,
    model: DEFAULT_MODEL,
  };
};

export const judgePlayTaskSubmission = async (params: {
  taskCategory: PlayTaskCategory;
  taskText: string;
  playerName: string;
  characterLabel: string;
  submission: string;
}) => {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Judge is unavailable. Add GEMINI_API_KEY on the API server.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 20000);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [
            {
              text:
                "You are Judge Quill, a concise and fair party-game judge. " +
                "Evaluate whether the player's submission plausibly completes the assigned task. " +
                "Be lightly playful, but prioritize clarity over jokes. " +
                'Return only valid JSON with keys: decision, score, summary, feedback. ' +
                'decision must be either "approved" or "retry". ' +
                "score must be an integer from 1 to 10. " +
                "summary must be a short title. " +
                "feedback must be one or two short sentences.",
            },
          ],
        },
        contents: [
          {
            parts: [
              {
                text:
                  `Task category: ${params.taskCategory}\n` +
                  `Task: ${params.taskText}\n` +
                  `Player: ${params.playerName}\n` +
                  `Character: ${params.characterLabel}\n` +
                  `Submission:\n${params.submission}\n\n` +
                  "Judge the submission only from the text provided. " +
                  "If it clearly or plausibly completes the task, approve it. " +
                  "If it is too vague, missing, or obviously unrelated, ask for a retry.",
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 1,
          thinkingConfig: {
            thinkingLevel: "low",
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Judge request failed.");
    }

    const payload = (await response.json()) as unknown;
    const rawText = extractCandidateText(payload);
    const judgedAt = new Date().toISOString();
    if (!rawText) {
      return buildFallbackVerdict("Judge did not return a verdict.", judgedAt);
    }

    try {
      const parsed = JSON.parse(extractJsonBlock(rawText)) as {
        decision?: unknown;
        score?: unknown;
        summary?: unknown;
        feedback?: unknown;
      };
      const decision = normalizeDecision(parsed.decision);
      const numericScore =
        typeof parsed.score === "number"
          ? parsed.score
          : Number.parseInt(String(parsed.score ?? ""), 10);

      return {
        decision,
        score: clamp(Number.isFinite(numericScore) ? numericScore : decision === "approved" ? 8 : 5, 1, 10),
        summary: normalizeSummary(parsed.summary, decision),
        feedback: normalizeFeedback(parsed.feedback, decision),
        judgedAt,
        model: DEFAULT_MODEL,
      };
    } catch {
      return buildFallbackVerdict(rawText, judgedAt);
    }
  } finally {
    clearTimeout(timeout);
  }
};
