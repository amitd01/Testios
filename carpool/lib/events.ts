import type { EventRequest, ApiError } from './types';
import { isValidDateString, isValidTime } from './dates';

/**
 * Shared validation for POST /api/events and PATCH /api/events/:id. Returns an
 * error payload, or null when the (possibly partial) body is acceptable.
 */
export function validateEventBody(body: Partial<EventRequest>, partial: boolean): ApiError | null {
  const has = (k: keyof EventRequest) => body[k] !== undefined;

  if (!partial && (!has('title') || !has('date') || !has('time') || !has('type') || !has('childIds'))) {
    return { error: 'missing_fields' };
  }
  if (has('title') && (typeof body.title !== 'string' || body.title.trim() === '')) {
    return { error: 'invalid_title' };
  }
  if (has('date') && !isValidDateString(body.date)) return { error: 'invalid_date' };
  if (has('time') && !isValidTime(body.time)) return { error: 'invalid_time' };
  if (has('type') && body.type !== 'pickup' && body.type !== 'drop') return { error: 'invalid_type' };
  if (has('childIds') && (!Array.isArray(body.childIds) || body.childIds.length === 0)) {
    return { error: 'invalid_children' };
  }

  // Mirrors the slot rule: a claimer and a scope travel together (FR-003).
  const claimer = body.responsibleParentId;
  const scope = body.responsibilityScope;
  if (claimer !== undefined && scope !== undefined && (claimer === null) !== (scope === null)) {
    return { error: 'invalid_scope' };
  }
  if (scope !== undefined && scope !== null && scope !== 'all_children' && scope !== 'own_child_only') {
    return { error: 'invalid_scope' };
  }
  return null;
}
