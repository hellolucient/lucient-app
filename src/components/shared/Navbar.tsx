import Link from 'next/link';
import UserAuthButton from "@/components/shared/UserAuthButton";

export default function Navbar() {
  return (
    <nav className="bg-background border-b shadow-sm">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold text-primary">
          <em className="lowercase">lucient</em>
        </Link>
        <div className="flex items-center space-x-4">
          <Link href="/dashboard" className="text-sm hover:text-primary">
            Dashboard
          </Link>
          <Link href="/tools" className="text-sm hover:text-primary">
            Tools
          </Link>
          <Link href="/agents" className="text-sm hover:text-primary">
            Agents
          </Link>
          <Link href="/admin" className="text-sm hover:text-primary">
            Admin
          </Link>
          <Link href="/settings/api-keys" className="text-sm hover:text-primary">
            Settings
          </Link>
          <UserAuthButton />
        </div>
      </div>
    </nav>
  );
} 