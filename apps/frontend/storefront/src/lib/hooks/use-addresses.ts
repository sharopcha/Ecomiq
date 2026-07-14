'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createAddressAction, updateAddressAction, deleteAddressAction } from '@/app/actions/addresses';
import { CustomerAddressDto } from '@/types/api';
import { toast } from 'sonner';

export function useAddresses(initialAddresses?: CustomerAddressDto[]) {
  const queryClient = useQueryClient();

  const { data: addresses = [], isLoading } = useQuery({
    queryKey: ['addresses'],
    queryFn: async () => {
      // Return initialData or fallback. In a fully dynamic app, we could fetch from API.
      return initialAddresses || [];
    },
    initialData: initialAddresses,
    staleTime: 5 * 60 * 1000, // 5 minutes stale time
  });

  const createMutation = useMutation({
    mutationFn: (address: any) => createAddressAction(address),
    onSuccess: (res) => {
      if (res.success && res.address) {
        queryClient.setQueryData(
          ['addresses'],
          (old: CustomerAddressDto[] | undefined) => [...(old || []), res.address]
        );
        toast.success('Address added');
      } else {
        toast.error(res.error || 'Failed to add address');
      }
    },
    onError: () => {
      toast.error('Failed to add address');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, address }: { id: string; address: any }) => updateAddressAction(id, address),
    onMutate: async ({ id, address }) => {
      await queryClient.cancelQueries({ queryKey: ['addresses'] });
      const previousAddresses = queryClient.getQueryData<CustomerAddressDto[]>(['addresses']);

      // Optimistically update default shipping or partial edits
      if (previousAddresses) {
        queryClient.setQueryData(
          ['addresses'],
          previousAddresses.map((a) => {
            if (a.id === id) {
              return { ...a, ...address };
            }
            if (address.isDefaultShipping && a.isDefaultShipping) {
              return { ...a, isDefaultShipping: false };
            }
            return a;
          })
        );
      }

      return { previousAddresses };
    },
    onError: (err, variables, context) => {
      if (context?.previousAddresses) {
        queryClient.setQueryData(['addresses'], context.previousAddresses);
      }
      toast.error('Failed to update address');
    },
    onSuccess: (res, variables) => {
      if (res.success && res.address) {
        queryClient.setQueryData(
          ['addresses'],
          (old: CustomerAddressDto[] | undefined) =>
            old?.map((a) => (a.id === variables.id ? res.address : a)) ?? []
        );
        toast.success('Address updated');
      } else {
        toast.error(res.error || 'Failed to update address');
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAddressAction(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['addresses'] });
      const previousAddresses = queryClient.getQueryData<CustomerAddressDto[]>(['addresses']);

      queryClient.setQueryData(
        ['addresses'],
        (old: CustomerAddressDto[] | undefined) => old?.filter((a) => a.id !== id) ?? []
      );

      return { previousAddresses };
    },
    onError: (err, id, context) => {
      if (context?.previousAddresses) {
        queryClient.setQueryData(['addresses'], context.previousAddresses);
      }
      toast.error('Failed to delete address');
    },
    onSuccess: (res) => {
      if (res.success) {
        toast.success('Address deleted');
      } else {
        toast.error(res.error || 'Failed to delete address');
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });

  return {
    addresses,
    isLoading,
    createMutation,
    updateMutation,
    deleteMutation,
  };
}
