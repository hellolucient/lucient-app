"use client"; // May need client-side logic for auth state

import { Button } from "@/components/ui/button";
import { signOut as supabaseSignOut } from "@/lib/supabase/auth";
import { useRouter } from "next/navigation";
import Link from "next/link";

// Define the shape of the user profile prop
type UserProfile = {
  user_tier: 'free_trial' | 'byok' | 'vip_tester' | 'admin';
  message_credits: number;
  email: string | null;
};

// Define the component's props
interface UserAuthButtonProps {
  userProfile: UserProfile | null;
  isLoading: boolean;
}

export default function UserAuthButton({ userProfile, isLoading }: UserAuthButtonProps) {
  const router = useRouter();

  const handleSignOut = async () => {
    // The onAuthStateChange listener in Navbar will handle the state update
    await supabaseSignOut();
  };

  if (isLoading) {
    return <Button variant="outline" size="sm" disabled>Loading...</Button>;
  }

  if (userProfile) {
    // Note: We don't have direct access to user.email here anymore.
    // That would require passing it down from Navbar or fetching it separately if needed.
    // For now, we'll just show the sign out button.
    return (
      <div className="flex items-center gap-2">
        {userProfile.email && (
          <span className="text-sm text-muted-foreground hidden sm:inline">
            {userProfile.email}
          </span>
        )}
        <Button variant="outline" size="sm" onClick={handleSignOut}>
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