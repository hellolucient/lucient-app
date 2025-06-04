"use client";

import { useState, FormEvent } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// We'll create this API call function later
// import { saveApiKey } from '@/lib/actions/userKeys'; 

export default function ManageApiKeysPage() {
  const [provider, setProvider] = useState('anthropic'); // Default to anthropic
  const [apiKey, setApiKey] = useState('');
  const [label, setLabel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setMessage(null);
    setError(null);

    if (!apiKey) {
      setError('API Key is required.');
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/user-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider, apiKey, label }),
      });

      const result = await response.json();

      if (response.ok) {
        setMessage(result.message || 'API Key saved successfully!');
        setApiKey(''); // Clear the key after successful save
        setLabel('');
      } else {
        setError(result.error || result.details || 'Failed to save API Key.');
      }
    } catch (err) {
      console.error("Failed to save API key:", err);
      setError('An unexpected error occurred while saving the API key. Check console for details.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-2xl">
      <h1 className="text-2xl md:text-3xl font-bold mb-6 text-primary">Manage API Keys</h1>
      
      <form onSubmit={handleSubmit} className="space-y-6 bg-card p-6 rounded-lg shadow-md">
        <div>
          <Label htmlFor="provider">LLM Provider</Label>
          <Select value={provider} onValueChange={setProvider}>
            <SelectTrigger id="provider" className="mt-1">
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
              <SelectItem value="openai">OpenAI (ChatGPT)</SelectItem>
              {/* <SelectItem value="gemini">Google (Gemini)</SelectItem> */}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground mt-1">Select the LLM provider for the API key.</p>
        </div>

        <div>
          <Label htmlFor="apiKey">API Key</Label>
          <Input
            id="apiKey"
            type="password" // Use password type to obscure the key
            placeholder="Enter your API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            required
            className="mt-1"
          />
        </div>

        <div>
          <Label htmlFor="label">Label (Optional)</Label>
          <Input
            id="label"
            type="text"
            placeholder="e.g., My Personal Claude Key"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="mt-1"
          />
        </div>

        {message && (
          <p className="text-sm text-green-600 dark:text-green-400 py-2 px-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-md">{message}</p>
        )}
        {error && (
          <p className="text-sm text-destructive py-2 px-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md">{error}</p>
        )}

        <Button type="submit" className="w-full md:w-auto" disabled={isLoading}>
          {isLoading ? 'Saving...' : 'Save API Key'}
        </Button>
      </form>

      {/* We can add a section here later to list/manage existing keys */}
    </div>
  );
} 