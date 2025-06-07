'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
// import { useToast } from '@/components/ui/use-toast'; // Removed for now

// Define the type for an invite request
interface InviteRequest {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  created_at: string;
}

export default function AdminPage() {
  const [invites, setInvites] = useState<InviteRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // const { toast } = useToast(); // Removed for now

  useEffect(() => {
    const fetchInvites = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const response = await fetch('/api/admin/invites');
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        setInvites(data);
      } catch (e: any) {
        console.error("Failed to fetch invites:", e);
        setError(e.message || 'An unexpected error occurred.');
        // toast({ // Removed for now
        //   title: 'Error',
        //   description: e.message || 'Failed to fetch invite requests.',
        //   variant: 'destructive',
        // });
      } finally {
        setIsLoading(false);
      }
    };

    fetchInvites();
  }, []); // Removed toast from dependency array

  const handleApprove = async (invite: InviteRequest) => {
    try {
      const response = await fetch('/api/admin/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: invite.email,
          firstName: invite.first_name,
          lastName: invite.last_name,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to approve invite.');
      }

      alert(`Successfully sent invite to ${invite.email}`);
      
      // Remove the approved user from the list
      setInvites(currentInvites => currentInvites.filter(i => i.id !== invite.id));

    } catch (e: any) {
      console.error('Approval failed:', e);
      alert(`Error: ${e.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-full">
        <p className="text-xl text-muted-foreground">Loading Invite Requests...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-full text-center">
        <div>
          <h2 className="text-xl font-semibold text-destructive">Failed to Load Data</h2>
          <p className="text-muted-foreground">{error}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            Only users with the 'admin' tier can view this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6 text-primary">Admin Dashboard</h1>
      <h2 className="text-xl font-semibold mb-4">Invite Requests</h2>
      <div className="bg-card rounded-lg shadow-lg">
        <div className="grid grid-cols-4 font-semibold p-4 border-b border-border">
          <div>Name</div>
          <div>Email</div>
          <div>Request Date</div>
          <div>Action</div>
        </div>
        {invites.length > 0 ? (
          invites.map((invite) => (
            <div key={invite.id} className="grid grid-cols-4 items-center p-4 border-b border-border last:border-b-0">
              <div>{invite.first_name} {invite.last_name}</div>
              <div className="truncate">{invite.email}</div>
              <div>{new Date(invite.created_at).toLocaleDateString()}</div>
              <div>
                <Button onClick={() => handleApprove(invite)}>
                  Approve
                </Button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center p-8 text-muted-foreground">
            No pending invite requests.
          </div>
        )}
      </div>
    </div>
  );
} 