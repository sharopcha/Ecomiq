'use client';

import { useState } from 'react';
import type { CustomerProfileDto } from '@/types/api';
import { updateProfileAction } from '@/app/actions/profile';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

export function ProfileForm({ initialProfile }: { initialProfile: CustomerProfileDto }) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    setIsSubmitting(true);
    try {
      const res = await updateProfileAction({
        fullName: formData.get('fullName') as string,
        phone: formData.get('phone') as string,
      });

      if (res.success) {
        toast.success('Profile updated successfully');
      } else {
        toast.error(res.error || 'Failed to update profile');
      }
    } catch (err) {
      toast.error('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>Email</Label>
        <Input value={initialProfile.email ?? ''} disabled className="bg-muted" />
        <p className="text-xs text-muted-foreground">Email cannot be changed.</p>
      </div>

      <div className="space-y-2">
        <Label>Full Name</Label>
        <Input name="fullName" defaultValue={initialProfile.fullName} required />
      </div>

      <div className="space-y-2">
        <Label>Phone Number</Label>
        <Input name="phone" defaultValue={initialProfile.phone || ''} type="tel" />
      </div>

      <div className="flex justify-end pt-4">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Changes
        </Button>
      </div>
    </form>
  );
}
