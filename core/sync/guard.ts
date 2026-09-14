export type FailsafeLevel = 'safe' | 'warn' | 'block' | 'severe';

export function checkFailsafe(
  totalLocal: number,
  deleteCount: number
): FailsafeLevel {
  if (totalLocal === 0) return 'safe';

  const ratio = deleteCount / totalLocal;

  if (ratio >= 0.8 && deleteCount >= 50) return 'severe';
  if (ratio >= 0.5) return 'block';
  if (ratio >= 0.2) return 'warn';
  return 'safe';
}