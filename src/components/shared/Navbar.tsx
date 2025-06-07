'use client';

import Link from 'next/link';
import UserAuthButton from "@/components/shared/UserAuthButton";
import { useState, useEffect } from 'react';
import { Menu, X } from 'lucide-react';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Button } from '../ui/button';
import { User } from '@supabase/supabase-js';

interface NavLink {
  href: string;
  label: string;
  adminOnly?: boolean;
}

type UserProfile = {
  user_tier: 'free_trial' | 'byok' | 'vip_tester' | 'admin';
  message_credits: number;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
};

type NavbarProps = {
  user: User | null;
};

const Navbar = ({ user }: NavbarProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const supabase = getSupabaseClient();

    const fetchUserProfile = async () => {
      setIsLoading(true);
      try {
        const response = await fetch('/api/user/profile');
        if (response.ok) {
          const data = await response.json();
          setUserProfile(data.profile);
        } else {
          setUserProfile(null);
        }
      } catch (error) {
        console.error("Failed to fetch user profile:", error);
        setUserProfile(null);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchUserProfile();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        setUserProfile(null);
        router.push('/');
        router.refresh();
      } else if (event === 'SIGNED_IN') {
        fetchUserProfile();
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  const allLinks: NavLink[] = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/tools", label: "Tools" },
    { href: "/agents", label: "Agents" },
    { href: "/admin", label: "Admin", adminOnly: true },
    { href: "/settings", label: "Settings" },
  ];

  const navLinks = allLinks.filter(link => {
    if (!link.adminOnly) return true;
    return userProfile?.user_tier === 'admin';
  });

  return (
    <header className="bg-background/80 backdrop-blur-sm sticky top-0 z-50 border-b">
      <nav className="container mx-auto px-6 py-3 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold text-primary">
          <em className="lowercase">lucient</em>
        </Link>
        
        {/* Desktop Menu */}
        <div className="hidden md:flex items-center space-x-4">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="text-sm hover:text-primary">
              {link.label}
            </Link>
          ))}
          <UserAuthButton userProfile={userProfile} isLoading={isLoading} />
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden">
          <button onClick={() => setIsOpen(!isOpen)} className="text-primary">
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 flex flex-col items-center">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium hover:text-primary hover:bg-muted"
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-4">
              <UserAuthButton userProfile={userProfile} isLoading={isLoading} />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

export default Navbar; 