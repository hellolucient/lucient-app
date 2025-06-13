"use client"; // May need client-side logic for auth state

import { getSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import React, { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Profile {
  user_tier: string;
  first_name: string;
  last_name: string;
}

export default function UserAuthButton() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabaseClient();
    
    const fetchUserAndProfile = async (sessionUser: User | null) => {
      if (sessionUser) {
        const { data, error } = await supabase
          .from('profiles')
          .select('user_tier, first_name, last_name')
          .eq('id', sessionUser.id)
          .single();

        if (error) {
          console.error("Error fetching profile:", error);
          setProfile(null);
        } else {
          setProfile(data);
        }
      } else {
        setProfile(null);
      }
      setUser(sessionUser);
      setIsLoading(false);
    };

    // Run once on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetchUserAndProfile(session?.user ?? null);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setIsLoading(true);
        fetchUserAndProfile(session?.user ?? null);
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, []);
  
  const handleSignOut = async () => {
    const supabase = getSupabaseClient();
    await supabase.auth.signOut();
    router.push('/');
    // No need for router.refresh() here as onAuthStateChange will trigger re-render
  };

  const handleSignIn = () => {
    router.push('/login');
  };

  if (isLoading) {
    return <Button variant="outline" disabled>Loading...</Button>;
  }

  if (user && profile) {
    const isAdmin = profile.user_tier === 'admin';
    const userInitial = profile.first_name ? profile.first_name.charAt(0).toUpperCase() : '?';

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{userInitial}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{profile.first_name} {profile.last_name}</p>
              <p className="text-xs leading-none text-muted-foreground">
                {user.email}
              </p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/settings">Settings</Link>
          </DropdownMenuItem>
          {isAdmin && (
            <DropdownMenuItem asChild>
              <Link href="/admin">Admin</Link>
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Button onClick={handleSignIn}>Sign In</Button>
  );
} 