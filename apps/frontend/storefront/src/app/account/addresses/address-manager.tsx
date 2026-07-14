'use client';

import { useState } from 'react';
import { CustomerAddressDto } from '@/types/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { useAddresses } from '@/lib/hooks/use-addresses';
import { toast } from 'sonner';
import { Plus, Trash2, Edit2, CheckCircle2 } from 'lucide-react';

export function AddressManager({ initialAddresses }: { initialAddresses: CustomerAddressDto[] }) {
  const { addresses, createMutation, updateMutation, deleteMutation } = useAddresses(initialAddresses);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const handleDelete = (id: string) => {
    if (!confirm('Are you sure you want to delete this address?')) return;
    deleteMutation.mutate(id);
  };

  const handleSetDefault = (id: string) => {
    updateMutation.mutate({ id, address: { isDefaultShipping: true } });
  };

  const handleSave = async (e: React.FormEvent<HTMLFormElement>, id?: string) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      line1: formData.get('line1') as string,
      line2: formData.get('line2') as string,
      city: formData.get('city') as string,
      region: formData.get('region') as string,
      postalCode: formData.get('postalCode') as string,
      countryCode: formData.get('countryCode') as string,
    };

    if (id) {
      updateMutation.mutate(
        { id, address: data },
        {
          onSuccess: (res) => {
            if (res.success) {
              setEditingId(null);
            }
          },
        }
      );
    } else {
      createMutation.mutate(data, {
        onSuccess: (res) => {
          if (res.success) {
            setIsAdding(false);
          }
        },
      });
    }
  };

  const renderForm = (initialData?: CustomerAddressDto, id?: string) => (
    <form onSubmit={(e) => handleSave(e, id)} className="space-y-4 border rounded-lg p-6 bg-card">
      <h3 className="font-semibold text-lg mb-4">{id ? 'Edit Address' : 'New Address'}</h3>
      <div className="space-y-2">
        <Label>Address Line 1</Label>
        <Input name="line1" defaultValue={initialData?.line1} required />
      </div>
      <div className="space-y-2">
        <Label>Address Line 2 (Optional)</Label>
        <Input name="line2" defaultValue={initialData?.line2 ?? ''} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>City</Label>
          <Input name="city" defaultValue={initialData?.city ?? ''} required />
        </div>
        <div className="space-y-2">
          <Label>State/Region</Label>
          <Input name="region" defaultValue={initialData?.region ?? ''} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Postal Code</Label>
          <Input name="postalCode" defaultValue={initialData?.postalCode ?? ''} required />
        </div>
        <div className="space-y-2">
          <Label>Country Code (2 letters)</Label>
          <Input name="countryCode" defaultValue={initialData?.countryCode ?? ''} required maxLength={2} />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-4">
        <Button 
          type="button" 
          variant="ghost" 
          onClick={() => id ? setEditingId(null) : setIsAdding(false)}
        >
          Cancel
        </Button>
        <Button type="submit">Save Address</Button>
      </div>
    </form>
  );

  return (
    <div className="space-y-6">
      {addresses.length === 0 && !isAdding ? (
        <div className="text-center py-12 border rounded-lg bg-card">
          <p className="text-muted-foreground mb-4">You have not saved any addresses yet.</p>
          <Button onClick={() => setIsAdding(true)}>
            <Plus className="w-4 h-4 mr-2" /> Add Address
          </Button>
        </div>
      ) : (
        <div className="flex justify-end">
          {!isAdding && (
            <Button onClick={() => setIsAdding(true)}>
              <Plus className="w-4 h-4 mr-2" /> Add Address
            </Button>
          )}
        </div>
      )}

      {isAdding && renderForm()}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {addresses.map(addr => (
          editingId === addr.id ? (
            <div key={addr.id} className="md:col-span-2">
              {renderForm(addr, addr.id)}
            </div>
          ) : (
            <Card key={addr.id} className={addr.isDefaultShipping ? 'border-primary' : ''}>
              <CardContent className="pt-6">
                {addr.isDefaultShipping && (
                  <div className="flex items-center text-sm font-medium text-primary mb-3">
                    <CheckCircle2 className="w-4 h-4 mr-1.5" />
                    Default Shipping
                  </div>
                )}
                <div className="space-y-1">
                  <p className="font-medium">{addr.line1}</p>
                  {addr.line2 && <p>{addr.line2}</p>}
                  <p className="text-muted-foreground">
                    {addr.city}, {addr.region} {addr.postalCode}
                  </p>
                  <p className="text-muted-foreground uppercase">{addr.countryCode}</p>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t bg-muted/20 px-6 py-3">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => handleSetDefault(addr.id)}
                  disabled={addr.isDefaultShipping}
                  className={addr.isDefaultShipping ? 'invisible' : ''}
                >
                  Set as Default
                </Button>
                <div className="flex gap-2">
                  <Button variant="ghost" size="icon" onClick={() => setEditingId(addr.id)}>
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(addr.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </CardFooter>
            </Card>
          )
        ))}
      </div>
    </div>
  );
}
