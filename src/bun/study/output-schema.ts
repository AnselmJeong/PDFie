type SourceChoices = { evidenceIds: readonly string[]; sectionIds: readonly string[] }

export function studyOutputSchema(
  task: string,
  korean = true,
  sources?: SourceChoices,
): Record<string, unknown> | undefined {
  const text = korean
    ? {
        type: "string",
        description: "한국어 문장. 전문 용어는 영어로 병기할 수 있습니다.",
        pattern: "[가-힣]",
      }
    : { type: "string" }
  // Reuse one definition so the lesson's nested components don't duplicate
  // every source ID and exceed structured-output enum limits.
  const definitions = sources?.evidenceIds.length
    ? { evidenceId: { type: "string", enum: [...new Set(sources.evidenceIds)] } }
    : undefined
  const evidenceIds = {
    type: "array",
    items: definitions ? { $ref: "#/$defs/evidenceId" } : { type: "string" },
    ...(sources && !sources.evidenceIds.length ? { maxItems: 0 } : {}),
  }
  const sourced = (schema: Record<string, unknown>) =>
    definitions ? { ...schema, $defs: definitions } : schema
  if (task === "lesson") {
    const array = (items: Record<string, unknown>) => ({ type: "array", items })
    const object = (properties: Record<string, unknown>) => ({
      type: "object",
      additionalProperties: false,
      required: Object.keys(properties),
      properties,
    })
    const step = (type: string, properties: Record<string, unknown>) =>
      object({
        type: { type: "string", enum: [type] },
        title: text,
        ...properties,
        evidenceIds,
      })
    return sourced(
      object({
        schemaVersion: { type: "integer", enum: [1] },
        title: text,
        objectives: array(text),
        prerequisites: array(text),
        dataKind: { type: "string", enum: ["paper", "illustrative"] },
        steps: array({
          anyOf: [
            step("explanation", { text }),
            step("diagram", { text, nodes: array(text) }),
            ...["prediction", "quiz"].map((type) =>
              step(type, {
                question: text,
                options: array(text),
                correctIndex: { type: "integer" },
                feedback: text,
              }),
            ),
            step("experiment", {
              text,
              formula: { type: "string", enum: ["linear", "sampling-error"] },
              min: { type: "number" },
              max: { type: "number" },
              step: { type: "number" },
              initial: { type: "number" },
              unit: text,
            }),
            step("comparison", {
              text,
              concepts: array(text),
              aspects: array(
                object({
                  label: text,
                  values: array(text),
                  evidenceIds,
                }),
              ),
            }),
            step("concept-map", {
              text,
              nodes: array(object({ label: text, detail: text, evidenceIds })),
              edges: array(
                object({ from: { type: "integer" }, to: { type: "integer" }, label: text, evidenceIds }),
              ),
            }),
            step("evidence-map", {
              text,
              claims: array(
                object({ claim: text, support: text, limitation: text, nextCheck: text, evidenceIds }),
              ),
            }),
            step("signal-experiment", { text, initial: { type: "number" } }),
            step("sandbox", {
              text,
              initialHeight: { type: "number" },
              css: { type: "string" },
              html: { type: "string" },
              jsFunctions: { type: "string" },
              jsExpressions: array({ type: "string" }),
              dataKind: { type: "string", enum: ["paper", "illustrative"] },
            }),
          ],
        }),
      }),
    )
  }
  if (task === "goals")
    return sourced({
      type: "object",
      additionalProperties: false,
      required: ["goals"],
      properties: {
        goals: {
          type: "array",
          minItems: 5,
          maxItems: 9,
          items: {
            type: "object",
            additionalProperties: false,
            required: [
              "question",
              "prerequisites",
              "sectionId",
              "evidenceIds",
              "difficulty",
              "checkQuestion",
            ],
            properties: {
              question: text,
              prerequisites: text,
              sectionId: {
                type: ["string", "null"],
                ...(sources ? { enum: [...new Set(sources.sectionIds), null] } : {}),
              },
              evidenceIds: {
                ...evidenceIds,
                minItems: 1,
                maxItems: sources && !sources.evidenceIds.length ? 0 : 12,
              },
              difficulty: { type: "string", enum: ["introductory", "intermediate", "advanced"] },
              checkQuestion: text,
            },
          },
        },
      },
    })
  if (task === "chat" || task === "summary")
    return sourced({
      type: "object",
      additionalProperties: false,
      required: ["blocks"],
      properties: {
        blocks: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["text", "kind", "evidenceIds"],
            properties: {
              text,
              kind: {
                type: "string",
                enum: ["document-claim", "inference", "background", "illustration", "unknown"],
              },
              evidenceIds,
            },
          },
        },
      },
    })
  return undefined
}
