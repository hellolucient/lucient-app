'use client';

import Link from 'next/link';
import UserAuthButton from './UserAuthButton';

const Navbar = () => {
  return (
    <header className="bg-background/80 backdrop-blur-sm sticky top-0 z-50 border-b">
      <nav className="container mx-auto px-6 py-3 flex justify-between items-center">
        <Link href="/" className="text-xl font-bold text-primary">
          <em className="lowercase">lucient</em>
        </Link>
        <UserAuthButton />
      </nav>
    </header>
  );
};

export default Navbar; 