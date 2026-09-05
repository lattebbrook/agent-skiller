/**
 * Skill generation, run on the server so the key never leaves it. The whole
 * prompt-validate-repair loop lives in core and is shared with the browser
 * build; this only supplies `fetch`.
 */
import {
  AiError,
  MAX_ATTACHMENT_BYTES,
  generateSkill as generateWith,
  totalAttachmentBytes,
  type AiSettings,
  type Attachment,
  type GenerateRequest,
  type GenerateResult,
} from '@agent-skiller/core';

export { AiError as GenerationFailed, MAX_ATTACHMENT_BYTES, totalAttachmentBytes };
export type { Attachment, GenerateRequest, GenerateResult };

export function generateSkill(ai: AiSettings, request: GenerateRequest, timeoutMs = 120000): Promise<GenerateResult> {
  return generateWith(ai, request, (url, init) => fetch(url, init), timeoutMs);
}
