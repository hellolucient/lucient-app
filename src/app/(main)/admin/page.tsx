'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, UserPlus, Users, Mail } from 'lucide-react';

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

type ApprovalStatus = 'idle' | 'processing' | 'approved' | 'error';

export default function AdminPage() {
  const [invites, setInvites] = useState<InviteRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [approvalStatuses, setApprovalStatuses] = useState<Record<string, ApprovalStatus>>({});

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
      setError(message);
    }
  };

  const handleApprove = async (inviteId: string, email: string, firstName: string, lastName: string) => {
    // Set processing state
    setApprovalStatuses(prev => ({ ...prev, [inviteId]: 'processing' }));

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

      // Set approved state
      setApprovalStatuses(prev => ({ ...prev, [inviteId]: 'approved' }));
      
      // Remove the approved invite from the list after a delay
      setTimeout(() => {
        setInvites(prev => prev.filter(invite => invite.id !== inviteId));
        setApprovalStatuses(prev => {
          const newStatuses = { ...prev };
          delete newStatuses[inviteId];
          return newStatuses;
        });
      }, 2000);

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      console.error('Error approving invite:', message);
      setApprovalStatuses(prev => ({ ...prev, [inviteId]: 'error' }));
      
      // Reset error state after 3 seconds
      setTimeout(() => {
        setApprovalStatuses(prev => ({ ...prev, [inviteId]: 'idle' }));
      }, 3000);
    }
  };

  const getButtonContent = (inviteId: string, email: string, firstName: string, lastName: string) => {
    const status = approvalStatuses[inviteId] || 'idle';
    
    switch (status) {
      case 'processing':
        return (
          <>
            <Clock className="w-4 h-4 mr-2 animate-spin" />
            Processing...
          </>
        );
      case 'approved':
        return (
          <>
            <CheckCircle className="w-4 h-4 mr-2" />
            Approved!
          </>
        );
      case 'error':
        return 'Error - Try Again';
      default:
        return (
          <>
            <UserPlus className="w-4 h-4 mr-2" />
            Approve
          </>
        );
    }
  };

  const getButtonVariant = (inviteId: string) => {
    const status = approvalStatuses[inviteId] || 'idle';
    
    switch (status) {
      case 'processing':
        return 'secondary';
      case 'approved':
        return 'default';
      case 'error':
        return 'destructive';
      default:
        return 'default';
    }
  };

  const getButtonDisabled = (inviteId: string) => {
    const status = approvalStatuses[inviteId] || 'idle';
    return status === 'processing' || status === 'approved';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="container mx-auto p-6">
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
              <p className="text-white text-lg">Loading Admin Dashboard...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="container mx-auto p-6">
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-red-400 mb-4">Access Denied</h2>
              <p className="text-gray-300 mb-2">{error}</p>
              <p className="text-sm text-gray-400">
                Only users with the 'admin' tier can view this page.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (profile?.user_tier !== 'admin') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="container mx-auto p-6">
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-red-400 mb-4">Insufficient Permissions</h2>
              <p className="text-gray-300">You don't have permission to view this page.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto p-6">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Admin Dashboard</h1>
          <p className="text-gray-300">Manage user invitations and system settings</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-white/10 border-white/20 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-300">Pending Invites</p>
                  <p className="text-3xl font-bold text-white">{invites.length}</p>
                </div>
                <Mail className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/10 border-white/20 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-300">Total Users</p>
                  <p className="text-3xl font-bold text-white">-</p>
                </div>
                <Users className="h-8 w-8 text-green-400" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/10 border-white/20 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-300">System Status</p>
                  <Badge variant="secondary" className="bg-green-500/20 text-green-400 border-green-500/30">
                    Online
                  </Badge>
                </div>
                <div className="h-8 w-8 rounded-full bg-green-500 animate-pulse"></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Invite Requests */}
        <Card className="bg-white/10 border-white/20 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-white flex items-center">
              <Mail className="h-5 w-5 mr-2" />
              Invite Requests
            </CardTitle>
            <CardDescription className="text-gray-300">
              Review and approve new user invitations
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invites.length > 0 ? (
              <div className="space-y-4">
                {invites.map((invite) => (
                  <div 
                    key={invite.id} 
                    className="flex items-center justify-between p-4 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-all duration-200"
                  >
                    <div className="flex items-center space-x-4">
                      <div className="h-10 w-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                        <span className="text-white font-semibold">
                          {invite.first_name.charAt(0)}{invite.last_name.charAt(0)}
                        </span>
                      </div>
                      <div>
                        <p className="font-semibold text-white">
                          {invite.first_name} {invite.last_name}
                        </p>
                        <p className="text-sm text-gray-300">{invite.email}</p>
                        <p className="text-xs text-gray-400">
                          Requested {new Date(invite.created_at).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant={getButtonVariant(invite.id)}
                      size="sm"
                      disabled={getButtonDisabled(invite.id)}
                      onClick={() => handleApprove(invite.id, invite.email, invite.first_name, invite.last_name)}
                      className="min-w-[120px] transition-all duration-200"
                    >
                      {getButtonContent(invite.id, invite.email, invite.first_name, invite.last_name)}
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-12">
                <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-300 text-lg">No pending invite requests</p>
                <p className="text-gray-400 text-sm">All caught up!</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 