"use client"; // May need client-side logic for auth state

import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client"; // Import the client getter
import { signOut as supabaseSignOut } from "@/lib/supabase/auth"; // Keep our signOut wrapper
import type { User } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function UserAuthButton() {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    async function fetchUserSession() {
      setIsLoading(true);
      try {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error("Error fetching session:", error.message);
          setUser(null);
        } else {
          setUser(data.session?.user ?? null);
        }
      } catch (error) {
        console.error("Unexpected error fetching user session:", error);
        setUser(null); // Ensure user is null on error
      } finally {
        setIsLoading(false);
      }
    }
    fetchUserSession();

    // Optional: Listen for auth state changes to keep session fresh
    const supabase = getSupabaseClient();
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null);
        // Refresh the page if user logs in/out in another tab, to ensure server components also update
        // This might be too aggressive depending on UX preference
        // if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        //   router.refresh();
        // }
      }
    );

    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [router]); // Added router to dependency array as it's used in onAuthStateChange (indirectly via refresh)

  const handleSignOut = async () => {
    setIsLoading(true);
    try {
      await supabaseSignOut(); // Use our wrapper which calls Supabase client
      // setUser(null); // onAuthStateChange will handle this
      router.push("/");
      router.refresh(); // To ensure server components are re-evaluated
    } catch (error) {
      console.error("Sign out failed:", error);
    } finally {
      // setIsLoading(false); // onAuthStateChange might affect loading state indirectly
    }
  };

  if (isLoading) {
    return <Button variant="outline" size="sm" disabled>Loading...</Button>;
  }

  if (user) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground hidden sm:inline">
          {user.email}
        </span>
        <Button variant="outline" size="sm" onClick={handleSignOut} disabled={isLoading}>
          Sign Out
        </Button>
      </div>
    );
  }

  return (
    <Button asChild variant="outline" size="sm">
      <Link href="/login">Sign In</Link>
    </Button>
  );
} 