import { CartLineResponseDto, CartGroupResponseDto } from './dto/cart-validate.dto';

export function groupCartLines(lines: CartLineResponseDto[]): CartGroupResponseDto[] {
  const storeMap = new Map<string, CartLineResponseDto[]>();

  for (const line of lines) {
    if (!storeMap.has(line.storeId)) {
      storeMap.set(line.storeId, []);
    }
    storeMap.get(line.storeId)!.push(line);
  }

  const groups: CartGroupResponseDto[] = [];
  for (const [storeId, storeLines] of storeMap.entries()) {
    const validLines = storeLines.filter(l => !l.problems.includes('not_found') && !l.problems.includes('inactive'));
    
    const subtotalMinor = validLines.reduce((sum, line) => sum + (line.unitPriceMinor * line.qty), 0);
    const lineVariantIds = storeLines.map(l => l.variantId); // Include all lines in group for client tracking
    
    groups.push({
      storeId,
      lineVariantIds,
      subtotalMinor,
    });
  }

  // Sort groups by storeId for deterministic output
  return groups.sort((a, b) => a.storeId.localeCompare(b.storeId));
}
