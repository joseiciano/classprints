/**
 * Extracts the first JSON object from provider content. Structured-output
 * responses are pure JSON, but the validated-JSON path (Response Healing or
 * chatty models) may wrap the object in prose or fences.
 */
export const extractJsonObject = (content: string): unknown => {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenced ? fenced[1]!.trim() : trimmed;
  if (candidate.startsWith('{')) {
    return JSON.parse(candidate);
  }
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end <= start) {
    throw new Error('no JSON object found');
  }
  return JSON.parse(candidate.slice(start, end + 1));
};
