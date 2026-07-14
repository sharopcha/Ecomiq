'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toggleWishlistAction, removeWishlistItemAction } from '@/app/actions/wishlist';
import { toast } from 'sonner';

export function useWishlist(initialItems?: any[]) {
  const queryClient = useQueryClient();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['wishlist'],
    queryFn: async () => {
      // In Next.js App Router, the server pre-fetches the initial items.
      // If we invalidate the cache, we fallback to the initial items or an empty array.
      return initialItems || [];
    },
    initialData: initialItems,
    staleTime: 5 * 60 * 1000, // 5 minutes stale time
  });

  const toggleMutation = useMutation({
    mutationFn: (variantId: string) => toggleWishlistAction(variantId),
    onMutate: async (variantId) => {
      await queryClient.cancelQueries({ queryKey: ['wishlist'] });
      const previousWishlist = queryClient.getQueryData<any[]>(['wishlist']);

      const isAlreadyWishlisted = previousWishlist?.some((i) => i.variantId === variantId);
      if (isAlreadyWishlisted) {
        queryClient.setQueryData(
          ['wishlist'],
          (old: any[] | undefined) => old?.filter((item) => item.variantId !== variantId) ?? []
        );
      }

      return { previousWishlist };
    },
    onError: (err, variantId, context) => {
      if (context?.previousWishlist) {
        queryClient.setQueryData(['wishlist'], context.previousWishlist);
      }
      toast.error('Failed to update wishlist');
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success('Wishlist updated');
      } else {
        toast.error(res.error || 'Failed to update wishlist');
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (variantId: string) => removeWishlistItemAction(variantId),
    onMutate: async (variantId) => {
      await queryClient.cancelQueries({ queryKey: ['wishlist'] });
      const previousWishlist = queryClient.getQueryData<any[]>(['wishlist']);

      queryClient.setQueryData(
        ['wishlist'],
        (old: any[] | undefined) => old?.filter((item) => item.variantId !== variantId) ?? []
      );

      return { previousWishlist };
    },
    onError: (err, variantId, context) => {
      if (context?.previousWishlist) {
        queryClient.setQueryData(['wishlist'], context.previousWishlist);
      }
      toast.error('Failed to remove from wishlist');
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success('Removed from wishlist');
      } else {
        toast.error(res.error || 'Failed to remove from wishlist');
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    },
  });

  const isWishlisted = (variantId: string) => {
    return items.some((item) => item.variantId === variantId);
  };

  return {
    items,
    isLoading,
    toggleMutation,
    removeMutation,
    isWishlisted,
  };
}
