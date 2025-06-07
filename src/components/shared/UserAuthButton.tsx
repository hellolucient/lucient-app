"use client"; // May need client-side logic for auth state

import { getSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import React from 'react';
import { User } from '@supabase/supabase-js';

interface UserAuthButtonProps {
  user: User | null;
}

export default function UserAuthButton({ user }: UserAuthButtonProps) {
  
  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    window.location.href = '/'; // Redirect to home after sign out
  };

  const handleSignIn = () => {
    window.location.href = '/login';
  };

  if (user) {
    return (
      <div className="flex items-center gap-4">
        <span className="text-sm text-muted-foreground hidden sm:inline">
          Welcome!
        </span>
        <Button onClick={handleSignOut} variant="outline">Sign Out</Button>
      </div>
    );
  }

  return (
    <Button onClick={handleSignIn}>Sign In</Button>
  );
} 