/**
 * The server's face of the shared model client: the key stays on this side,
 * and the page never makes a cross-origin call to a provider.
 */
import { AiError, listModels as listModelsWith, type AiSettings, type ModelOption } from '@agent-skiller/core';

export { AiError as ModelListFailed };
export type { ModelOption };

export function listModels(ai: AiSettings, timeoutMs = 15000): Promise<ModelOption[]> {
  return listModelsWith(ai, (url, init) => fetch(url, init), timeoutMs);
}
