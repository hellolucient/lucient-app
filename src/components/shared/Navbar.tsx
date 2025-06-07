'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import UserAuthButton from './UserAuthButton';
import { createClient } from '@/lib/supabase/client';
import { User } from '@supabase/supabase-js';

const Navbar = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const checkUser = async () => {
      const { data } = await supabase.auth.getUser();
      setUser(data.user);
    };
    checkUser();
  }, []);

  return (
    <header className="bg-background/80 backdrop-blur-sm sticky top-0 z-50 border-b">
      <nav className="container mx-auto px-6 py-3 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold text-primary">
          <em className="lowercase">lucient</em>
        </Link>
        <UserAuthButton user={user} />
      </nav>
    </header>
  );
};

export default Navbar; 