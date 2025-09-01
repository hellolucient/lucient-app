'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Link from 'next/link';

export default function RequestInvitePage() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/request-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, firstName, lastName }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to submit request.');
      }

      setIsSubmitted(true);
      
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'An unknown error occurred.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-center p-4 relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5 -z-10"></div>
        
        {/* Floating orbs */}
        <div className="absolute top-20 left-20 w-40 h-40 bg-gradient-primary rounded-full opacity-10 blur-xl animate-pulse"></div>
        <div className="absolute bottom-20 right-20 w-32 h-32 bg-gradient-secondary rounded-full opacity-10 blur-xl animate-pulse delay-1000"></div>
        
        <div className="w-full max-w-md p-8 space-y-4 bg-card rounded-xl shadow-xl border border-border relative z-10">
          <div className="w-16 h-16 mx-auto mb-4 bg-gradient-primary rounded-full flex items-center justify-center">
            <span className="text-2xl">✨</span>
          </div>
          <h1 className="text-3xl font-bold text-primary">Thank You!</h1>
          <p className="text-lg text-muted-foreground">
            Thank you for your interest in lucient. Demand is high. We will let you in as soon as we can. Keep an eye on your Inbox.
          </p>
          <Button asChild className="bg-gradient-primary hover:bg-gradient-primary/90 transition-smooth">
            <Link href="/">Return Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5 -z-10"></div>
      
      {/* Floating orbs */}
      <div className="absolute top-20 left-20 w-40 h-40 bg-gradient-primary rounded-full opacity-10 blur-xl animate-pulse"></div>
      <div className="absolute bottom-20 right-20 w-32 h-32 bg-gradient-secondary rounded-full opacity-10 blur-xl animate-pulse delay-1000"></div>
      
      <div className="w-full max-w-md p-8 space-y-8 bg-card rounded-xl shadow-xl border border-border relative z-10">
        <div className="text-center">
            <h1 className="text-3xl font-bold text-primary">Request Access to lucient</h1>
            <p className="mt-2 text-muted-foreground">Enter your details below to join the waitlist.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              id="firstName"
              type="text"
              placeholder="First Name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              disabled={isLoading}
              className="bg-background"
            />
            <Input
              id="lastName"
              type="text"
              placeholder="Last Name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              required
              disabled={isLoading}
              className="bg-background"
            />
          </div>
          <Input
            id="email"
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
            className="bg-background"
          />
          {error && (
            <p className="text-sm text-center text-destructive">{error}</p>
          )}
          <Button type="submit" className="w-full bg-gradient-primary hover:bg-gradient-primary/90 transition-smooth" disabled={isLoading}>
            {isLoading ? 'Submitting...' : 'Request Invite'}
          </Button>
        </form>
      </div>
    </div>
  );
} 