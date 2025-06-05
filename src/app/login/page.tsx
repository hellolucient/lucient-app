"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signInWithEmail, signUpWithEmail } from "@/lib/supabase/auth"; // Assuming auth functions
import { useRouter, useSearchParams } from "next/navigation";
import { useState, FormEvent, Suspense } from "react";

// Renamed the original component
function LoginClientContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirect_to") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSigningUp, setIsSigningUp] = useState(false); // To toggle between Sign In and Sign Up
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAuth = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSigningUp) {
        const result = await signUpWithEmail(email, password);
        // Supabase might return a user object here if email confirmation is off, or a session/user if it's on and auto-confirmed
        // Or it might return data indicating confirmation is needed.
        if (result.data?.user && result.data.user.identities && result.data.user.identities.length === 0) {
          setMessage(
            "Signup successful! Please check your email to confirm your account if required by settings, then sign in."
          );
          setIsSigningUp(false); // Switch to sign-in form
        } else if (result.data?.user) {
           setMessage("Signup successful! You can now sign in.");
           // router.push(redirectTo); // Redirect immediately after signup if user exists and confirmed
           // Forcing sign-in after signup for now to simplify flow, as email confirmation might be on.
           setIsSigningUp(false); // Switch to sign-in form
        } else if (result.error) {
          setError(result.error.message);
        } else {
          // This case might occur if email confirmation is required and not yet done
          // or if there was no user object and no error (should be unlikely with Supabase signUp)
          setMessage("Signup successful! Please check your email to confirm your account.");
          setIsSigningUp(false); // Switch to sign-in form
        }
      } else {
        const result = await signInWithEmail(email, password);
        if (result.error) {
          setError(result.error.message);
        } else if (result.data?.user) {
          router.push(redirectTo); // Redirect after successful login
        } else {
          // Should not happen if there is no error and no user
          setError("Sign in failed. Please try again.");
        }
      }
    } catch (err: unknown) {
      console.error("Auth error:", err);
      if (err instanceof Error) {
        setError(err.message);
      } else if (typeof err === 'string') {
        setError(err);
      } else {
        setError("An unexpected error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="w-full max-w-md p-8 space-y-6 bg-card shadow-xl rounded-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-primary">
            {isSigningUp ? "Create Account" : "Welcome Back"}
          </h1>
          <p className="text-muted-foreground">
            {isSigningUp
              ? "Enter your details to get started."
              : "Sign in to access your dashboard."}
          </p>
        </div>
        <form onSubmit={handleAuth} className="space-y-6">
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              required
              className="mt-1"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}
          {message && (
            <p className="text-sm text-green-600 dark:text-green-400 text-center">{message}</p>
          )}
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? "Processing..." : isSigningUp ? "Sign Up" : "Sign In"}
          </Button>
        </form>
        <p className="text-sm text-center text-muted-foreground">
          {isSigningUp ? "Already have an account?" : "Don\'t have an account?"}{" "}
          <button
            onClick={() => {
              setIsSigningUp(!isSigningUp);
              setError(null);
              setMessage(null);
            }}
            className="font-semibold text-primary hover:underline"
            disabled={isLoading}
          >
            {isSigningUp ? "Sign In" : "Sign Up"}
          </button>
        </p>
      </div>
    </div>
  );
}

// New default export component wrapping LoginClientContent with Suspense
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen">Loading page...</div>}>
      <LoginClientContent />
    </Suspense>
  );
} 