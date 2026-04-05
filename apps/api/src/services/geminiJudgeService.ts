type PlayTaskCategory = "weekly" | "daily";

export type PlayJudgeDecision = "pass" | "fail";

export type PlayJudgeVerdict = {
  decision: PlayJudgeDecision;
  summary: string;
  feedback: string;
  judgedAt: string;
  model: string;
};

const DEFAULT_MODEL = process.env.GEMINI_MODEL?.trim() || "gemini-3-flash-preview";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_MODEL}:generateContent`;

const normalizeDecision = (value: unknown): PlayJudgeDecision => {
  if (typeof value !== "string") {
    return "fail";
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "pass" ||
    normalized === "approved" ||
    normalized === "approve" ||
    normalized === "accepted" ||
    normalized === "accept"
    ? "pass"
    : "fail";
};

const normalizeSummary = (value: unknown, decision: PlayJudgeDecision) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (text) {
    return text.slice(0, 60);
  }
  return decision === "pass" ? "Evidence accepted" : "Insufficient evidence";
};

const normalizeFeedback = (value: unknown, decision: PlayJudgeDecision) => {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (text) {
    return text.slice(0, 260);
  }
  return decision === "pass"
    ? "Judge accepted the submission as evidence that the task was completed."
    : "Judge needs clearer evidence that the submitted item completes the task.";
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

export const normalizePlayJudgeVerdict = (value: unknown): PlayJudgeVerdict | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const verdict = value as {
    decision?: unknown;
    summary?: unknown;
    feedback?: unknown;
    judgedAt?: unknown;
    model?: unknown;
  };
  const decision = normalizeDecision(verdict.decision);

  return {
    decision,
    summary: normalizeSummary(verdict.summary, decision),
    feedback: normalizeFeedback(verdict.feedback, decision),
    judgedAt:
      typeof verdict.judgedAt === "string" && verdict.judgedAt.trim()
        ? verdict.judgedAt
        : new Date().toISOString(),
    model: typeof verdict.model === "string" && verdict.model.trim() ? verdict.model : DEFAULT_MODEL,
  };
};

const buildFallbackVerdict = (rawText: string, judgedAt: string): PlayJudgeVerdict => {
  const decision = /approved|accept|pass/i.test(rawText) ? "pass" : "fail";
  return {
    decision,
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
                "Evaluate only whether the player's submission is evidence that the assigned task was completed. " +
                "Be lightly playful, but prioritize clarity over jokes. " +
                'Return only valid JSON with keys: decision, summary, feedback. ' +
                'decision must be either "pass" or "fail". ' +
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
                  "Pass it only if the submission provides plausible evidence that the task was completed. " +
                  "Fail it if the evidence is too vague, missing, or clearly unrelated. " +
                  "Do not score, rank, or rate the submission.",
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
        summary?: unknown;
        feedback?: unknown;
      };
      return normalizePlayJudgeVerdict({
        decision: parsed.decision,
        summary: parsed.summary,
        feedback: parsed.feedback,
        judgedAt,
        model: DEFAULT_MODEL,
      }) as PlayJudgeVerdict;
    } catch {
      return buildFallbackVerdict(rawText, judgedAt);
    }
  } finally {
    clearTimeout(timeout);
  }
};
