'use client';

import Link from 'next/link';
import UserAuthButton from "@/components/shared/UserAuthButton";
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/tools", label: "Tools" },
    { href: "/agents", label: "Agents" },
    { href: "/admin", label: "Admin" },
    { href: "/settings/api-keys", label: "Settings" },
  ];

  return (
    <nav className="bg-background border-b shadow-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
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
          <UserAuthButton />
        </div>

        {/* Mobile Menu Button */}
        <div className="md:hidden">
          <button onClick={() => setIsOpen(!isOpen)} className="text-primary">
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 sm:px-3 flex flex-col items-center">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)} // Close menu on click
                className="block px-3 py-2 rounded-md text-base font-medium hover:text-primary hover:bg-muted"
              >
                {link.label}
              </Link>
            ))}
            <div className="pt-4">
              <UserAuthButton />
            </div>
          </div>
        </div>
      )}
    </nav>
  );
} 