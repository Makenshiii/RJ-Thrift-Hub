export const AI_QUERY_MIN_LENGTH = 3;
export const AI_QUERY_MAX_LENGTH = 200;

export function sanitizeAiQuery(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
