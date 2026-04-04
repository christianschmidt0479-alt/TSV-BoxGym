type AdminMailAiMode = "reply" | "summary"

const OPENAI_TIMEOUT_MS = 15_000

function getOpenAiApiKey() {
  return process.env.OPENAI_API_KEY?.trim() || ""
}

function getOpenAiModel() {
  return process.env.OPENAI_MODEL?.trim() || "gpt-4.1-mini"
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError"
}

function normalizeAiText(value: string) {
  return value.replace(/\r\n/g, "\n").trim()
}

type OpenAiResponsePayload = {
  output_text?: string
  output?: Array<{
    content?: Array<{
      type?: string
      text?: string
    }>
  }>
}

function extractOpenAiText(payload: OpenAiResponsePayload) {
  if (typeof payload.output_text === "string") {
    const normalized = normalizeAiText(payload.output_text)
    if (normalized) {
      return normalized
    }
  }

  if (!Array.isArray(payload.output)) {
    return ""
  }

  const chunks = payload.output.flatMap((entry) => {
    if (!Array.isArray(entry.content)) {
      return []
    }

    return entry.content
      .filter((item) => item.type === "output_text" && typeof item.text === "string")
      .map((item) => normalizeAiText(item.text || ""))
      .filter(Boolean)
  })

  return normalizeAiText(chunks.join("\n\n"))
}

function sentenceSplit(content: string) {
  return content
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function buildHeuristicSummary(content: string) {
  const sentences = sentenceSplit(content)
  if (sentences.length === 0) return "Keine inhaltliche Zusammenfassung verfügbar."
  return sentences.slice(0, 3).join(" ")
}

function buildHeuristicReply(subject: string, content: string) {
  const summary = buildHeuristicSummary(content)
  const subjectLine = subject.trim() ? `zum Betreff \"${subject.trim()}\"` : "zu deiner Nachricht"

  return normalizeAiText(`Hallo,

vielen Dank für deine Nachricht ${subjectLine}. Ich habe dein Anliegen gesehen und melde mich dazu zeitnah mit einer finalen Rückmeldung.

Kurz notiert:
${summary}

Sportliche Grüße
TSV BoxGym`)
}

async function runOpenAiPrompt(mode: AdminMailAiMode, input: { subject?: string; content: string }) {
  const apiKey = getOpenAiApiKey()
  if (!apiKey) {
    return null
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)

  const instruction =
    mode === "reply"
      ? "Schreibe eine kurze, professionelle deutsche E-Mail-Antwort fuer ein Vereins-Adminpostfach. Keine Halluzinationen. Nur auf Basis der Nachricht antworten. Wenn Informationen fehlen, formuliere zurueckhaltend und kuendige Rueckmeldung an."
      : "Fasse eine deutsche E-Mail fuer ein Vereins-Adminpostfach kurz, sachlich und in 2-4 Saetzen zusammen. Keine Halluzinationen."

  const userPrompt = [`Betreff: ${input.subject?.trim() || "(kein Betreff)"}`, "", "Inhalt:", input.content.trim()].join("\n")

  let response: Response

  try {
    response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getOpenAiModel(),
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: instruction }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: userPrompt }],
          },
        ],
        max_output_tokens: 400,
      }),
      signal: controller.signal,
    })
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("OpenAI request timeout")
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }

  if (!response.ok) {
    throw new Error((await response.text()) || "OpenAI request failed")
  }

  const payload = (await response.json()) as OpenAiResponsePayload
  const text = extractOpenAiText(payload)
  if (!text) {
    throw new Error("AI output was empty")
  }

  return text
}

export async function generateAdminMailAiResult(mode: AdminMailAiMode, input: { subject?: string; content: string }) {
  try {
    const generated = await runOpenAiPrompt(mode, input)
    if (generated) {
      return {
        text: generated,
        provider: "openai",
        usedFallback: false,
      } as const
    }
  } catch (error) {
    console.error("admin mail ai failed, falling back", error)
  }

  return {
    text: mode === "reply" ? buildHeuristicReply(input.subject || "", input.content) : buildHeuristicSummary(input.content),
    provider: "fallback",
    usedFallback: true,
  } as const
}