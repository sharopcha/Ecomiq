'use client';

import { useQuery } from '@tanstack/react-query';
import { useCartStore, CartItem } from '@/lib/store/cart-store';
import { useStore } from '@/lib/store/use-store';
import { validateCartAction } from '@/app/actions/cart';
import { ReactNode } from 'react';
import type { CartLineResponseDto, CartGroupResponseDto, CartValidateResponseDto } from '@temp-nx/api-types/catalog';

export type { CartItem };
export type ValidatedCartLine = CartLineResponseDto;
export type ValidatedCartGroup = CartGroupResponseDto;
export type ValidatedCart = CartValidateResponseDto;

/** `group.lineVariantIds` references entries in `cart.lines` by `variantId` — this resolves them. */
export function linesForGroup(cart: ValidatedCart | null, group: ValidatedCartGroup): ValidatedCartLine[] {
  if (!cart) return [];
  const ids = new Set(group.lineVariantIds);
  return cart.lines.filter((line) => ids.has(line.variantId));
}

// Keep CartProvider as a shell so layout imports and wraps correctly
export function CartProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useCart() {
  const storeItems = useCartStore((s) => s.items);
  // Prevent SSR hydration mismatches by using the useStore safe selector hook
  const items = useStore(useCartStore, (s) => s.items) ?? [];
  const isOpen = useCartStore((s) => s.isOpen);
  const setIsOpen = useCartStore((s) => s.setIsOpen);
  const addItem = useCartStore((s) => s.addItem);
  const updateQty = useCartStore((s) => s.updateQty);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);

  // TanStack Query handles the Cart Validation API calling, caching, and state management
  const { data: validatedCart = null, isFetching: isValidating } = useQuery({
    queryKey: ['cart', 'validation', storeItems],
    queryFn: () => validateCartAction(storeItems),
    enabled: storeItems.length > 0,
    staleTime: 10 * 1000, // 10 seconds stale time
    placeholderData: (previousData) => previousData,
  });

  return {
    items,
    validatedCart: storeItems.length === 0 ? { lines: [], groups: [] } : validatedCart,
    isOpen,
    setIsOpen,
    addItem,
    updateQty,
    removeItem,
    clearCart,
    isValidating,
  };
}
