'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
// import { useToast } from '@/components/ui/use-toast'; // Removed for now

// Define the type for an invite request
interface InviteRequest {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  created_at: string;
}

interface UserProfile {
  user_tier: 'free_trial' | 'byok' | 'vip_tester' | 'admin';
}

export default function AdminPage() {
  const [invites, setInvites] = useState<InviteRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  // const { toast } = useToast(); // Removed for now

  useEffect(() => {
    async function fetchProfileAndInvites() {
      setIsLoading(true);
      try {
        // Fetch profile first to check for admin status
        const profileResponse = await fetch('/api/user/profile');
        if (!profileResponse.ok) {
          throw new Error('Could not fetch user profile.');
        }
        const profileData = await profileResponse.json();
        setProfile(profileData.profile);

        if (profileData.profile?.user_tier === 'admin') {
          // If admin, fetch invites
          const invitesResponse = await fetch('/api/admin/invites');
          if (!invitesResponse.ok) {
            throw new Error('Failed to fetch invites.');
          }
          const invitesData = await invitesResponse.json();
          setInvites(invitesData);
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'An unknown error occurred.';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProfileAndInvites();
  }, []);

  const fetchInvites = async () => {
    try {
      const invitesResponse = await fetch('/api/admin/invites');
      if (!invitesResponse.ok) {
        throw new Error('Failed to fetch invites.');
      }
      const invitesData = await invitesResponse.json();
      setInvites(invitesData);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(message); // Show error to the user
    }
  };

  const handleApprove = async (inviteId: string, email: string, firstName: string, lastName: string) => {
    try {
      const response = await fetch('/api/admin/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId, email, firstName, lastName }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to approve invite.');
      }
      // Refresh invites after approval
      await fetchInvites();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      console.error('Error approving invite:', message);
      setError(message);
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
            Only users with the &apos;admin&apos; tier can view this page.
          </p>
        </div>
      </div>
    );
  }

  if (profile?.user_tier !== 'admin') {
    return <div>You don&apos;t have permission to view this page.</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Admin Dashboard</h1>
      <div className="bg-white p-4 rounded shadow">
        <h2 className="text-xl font-semibold mb-3">Invite Requests</h2>
        <div className="space-y-2">
          {invites.length > 0 ? (
            invites.map((invite) => (
              <div key={invite.id} className="flex justify-between items-center p-2 border rounded">
                <div>
                  <p className="font-semibold">{invite.first_name} {invite.last_name}</p>
                  <p className="text-sm text-gray-600">{invite.email}</p>
                </div>
                <div>{new Date(invite.created_at).toLocaleDateString()}</div>
                <div>
                  <Button onClick={() => handleApprove(invite.id, invite.email, invite.first_name, invite.last_name)}>
                    Approve
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p>No pending invite requests.</p>
          )}
        </div>
      </div>
    </div>
  );
} 