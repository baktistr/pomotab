import { generateKeyBetween } from 'fractional-indexing'

/**
 * Ordering uses fractional-index strings ("a0", "a0V", …) so a drag only
 * rewrites the row that moved, with no renumbering pass over its siblings.
 */
export function orderBetween(prev?: string | null, next?: string | null): string {
  return generateKeyBetween(prev ?? null, next ?? null)
}

/**
 * Order key that puts an item at `index` of `sorted`, where `sorted` is the
 * list *without* the item being placed.
 */
export function orderAt(sorted: Array<{ order: string }>, index: number): string {
  const prev = index > 0 ? sorted[index - 1]?.order : null
  const next = sorted[index]?.order ?? null
  return orderBetween(prev, next)
}

export function byOrder<T extends { order: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0))
}
