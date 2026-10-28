import { z } from "zod";
import type { LeadQuestion } from "@/lib/database.types";

export const MAX_LEAD_QUESTIONS = 3;

export const LeadQuestionsInput = z
  .array(
    z.object({
      id: z.string().regex(/^q[0-9a-z]{1,12}$/),
      label: z.string().trim().min(1, "Write the question.").max(80, "Keep questions to 80 characters."),
      kind: z.enum(["text", "yesno"]),
      required: z.boolean(),
    }),
  )
  .max(MAX_LEAD_QUESTIONS, `Ask up to ${MAX_LEAD_QUESTIONS} questions.`);

/**
 * Checks a guest's answers against the event's questions. Returns cleaned
 * answers, or an error naming the first required question left blank.
 */
export function checkAnswers(
  questions: LeadQuestion[],
  raw: Record<string, unknown> | null | undefined,
): { ok: true; answers: Record<string, string> } | { ok: false; error: string } {
  const answers: Record<string, string> = {};
  for (const q of questions) {
    let v = typeof raw?.[q.id] === "string" ? (raw[q.id] as string).trim().slice(0, 200) : "";
    if (q.kind === "yesno" && v && v !== "Yes" && v !== "No") v = "";
    if (q.required && !v) return { ok: false, error: `Answer "${q.label}" to join.` };
    if (v) answers[q.id] = v;
  }
  return { ok: true, answers };
}
