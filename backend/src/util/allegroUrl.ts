/**
 * Allegro ID-y ofert to długie ciągi cyfr na końcu adresu oferty,
 * np. https://allegro.pl/oferta/jakis-tytul-1234567890123
 */
export function extractOfferId(input: string): string | null {
  const trimmed = input.trim();
  if (/^\d{6,}$/.test(trimmed)) return trimmed;

  const match = trimmed.match(/(\d{6,})(?:[/?#]|$)/);
  return match ? match[1] : null;
}
