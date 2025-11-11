"use client";

import { useState, FormEvent, ChangeEvent, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from 'next/link';
// We'll create this API call function later
// import { saveApiKey } from '@/lib/actions/userKeys'; 

type UserProfile = {
  user_tier: 'free_trial' | 'byok' | 'vip_tester' | 'admin';
};

export default function ManageApiKeysPage() {
  // API Key Management State
  const [provider, setProvider] = useState('anthropic');
  const [apiKey, setApiKey] = useState('');
  const [keyLabel, setKeyLabel] = useState(''); // Renamed from label to avoid conflict
  const [isKeyLoading, setIsKeyLoading] = useState(false);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  // User profile state
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  // Document Upload State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // URL Upload State
  const [urlInput, setUrlInput] = useState('');
  const [isUrlUploading, setIsUrlUploading] = useState(false);
  const [urlMessage, setUrlMessage] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchUserProfile() {
      try {
        const response = await fetch('/api/user/profile');
        if (response.ok) {
          const data = await response.json();
          setUserProfile(data.profile);
        }
      } catch (error) {
        console.error("Failed to fetch user profile:", error);
      }
    }
    fetchUserProfile();
  }, []);

  const handleApiKeySubmit = async (event: FormEvent) => {
    event.preventDefault();
    setIsKeyLoading(true);
    setKeyMessage(null);
    setKeyError(null);

    if (!apiKey) {
      setKeyError('API Key is required.');
      setIsKeyLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/user-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider, apiKey, label: keyLabel }), // Use keyLabel here
      });

      const result = await response.json();

      if (response.ok) {
        setKeyMessage(result.message || 'API Key saved successfully!');
        setApiKey('');
        setKeyLabel('');
      } else {
        setKeyError(result.error || result.details || 'Failed to save API Key.');
      }
    } catch (err) {
      console.error("Failed to save API key:", err);
      setKeyError('An unexpected error occurred while saving the API key. Check console for details.');
    } finally {
      setIsKeyLoading(false);
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
      setUploadMessage(null);
      setUploadError(null);
    }
  };

  const handleDocumentUpload = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedFile) {
      setUploadError('Please select a file to upload.');
      return;
    }

    setIsUploading(true);
    setUploadMessage(null);
    setUploadError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch('/api/documents/upsert', {
        method: 'POST',
        body: formData, // FormData will set the Content-Type header automatically
      });

      const result = await response.json();

      if (response.ok) {
        setUploadMessage(result.message || `Successfully uploaded ${selectedFile.name}`);
        setSelectedFile(null);
        // Clear the file input visually (optional, depends on input styling)
        const fileInput = document.getElementById('documentUpload') as HTMLInputElement;
        if (fileInput) fileInput.value = ''; 
      } else {
        setUploadError(result.error || result.details || 'Failed to upload document.');
      }
    } catch (err) {
      console.error("Failed to upload document:", err);
      setUploadError('An unexpected error occurred while uploading the document. Check console for details.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleUrlSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!urlInput || !urlInput.trim()) {
      setUrlError('Please enter a URL.');
      return;
    }

    // Basic URL validation
    try {
      new URL(urlInput);
    } catch {
      setUrlError('Please enter a valid URL (e.g., https://example.com/report.pdf)');
      return;
    }

    setIsUrlUploading(true);
    setUrlMessage(null);
    setUrlError(null);

    try {
      const response = await fetch('/api/documents/upsert-url', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: urlInput.trim() }),
      });

      const result = await response.json();

      if (response.ok) {
        setUrlMessage(
          result.message || 
          `Successfully processed ${result.title || urlInput}. Created ${result.chunks || 0} chunks.`
        );
        setUrlInput('');
      } else {
        setUrlError(result.error || result.details || 'Failed to process URL.');
      }
    } catch (err) {
      console.error("Failed to process URL:", err);
      setUrlError('An unexpected error occurred while processing the URL. Check console for details.');
    } finally {
      setIsUrlUploading(false);
    }
  };

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-2xl space-y-12">
      <section>
        <h1 className="text-2xl md:text-3xl font-bold mb-2 text-primary">Manage API Keys</h1>
        <div className="text-muted-foreground mb-6 text-center bg-muted p-4 rounded-lg">
          <p>If you have an API key, select your LLM and enter your API key.</p>
          <p className="my-4">If not, click here...</p>
          <Link href="/" passHref>
            <Button>Try Lucient</Button>
          </Link>
        </div>
        <form onSubmit={handleApiKeySubmit} className="space-y-6 bg-card p-6 rounded-lg shadow-md">
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
              type="password"
              placeholder="Enter your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              className="mt-1"
            />
          </div>

          <div>
            <Label htmlFor="keyLabel">Label (Optional)</Label>
            <Input
              id="keyLabel"
              type="text"
              placeholder="e.g., My Personal Claude Key"
              value={keyLabel}
              onChange={(e) => setKeyLabel(e.target.value)}
              className="mt-1"
            />
          </div>

          {keyMessage && (
            <p className="text-sm text-green-600 dark:text-green-400 py-2 px-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-md">{keyMessage}</p>
          )}
          {keyError && (
            <p className="text-sm text-destructive py-2 px-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md">{keyError}</p>
          )}

          <Button type="submit" className="w-full md:w-auto" disabled={isKeyLoading}>
            {isKeyLoading ? 'Saving...' : 'Save API Key'}
          </Button>
        </form>
      </section>

      {userProfile?.user_tier === 'admin' && (
        <>
          <section>
            <h2 className="text-xl md:text-2xl font-bold mb-6 text-primary">Knowledge Base Document Upload</h2>
            <form onSubmit={handleDocumentUpload} className="space-y-6 bg-card p-6 rounded-lg shadow-md">
              <div>
                <Label htmlFor="documentUpload">Upload Document (.txt, .doc, .docx, .pdf)</Label>
                <Input
                  id="documentUpload"
                  type="file"
                  accept=".txt,.doc,.docx,.pdf,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  onChange={handleFileChange}
                  className="mt-1 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/20"
                />
                {selectedFile && <p className="text-xs text-muted-foreground mt-1">Selected: {selectedFile.name} ({selectedFile.type})</p>}
              </div>

              {uploadMessage && (
                <p className="text-sm text-green-600 dark:text-green-400 py-2 px-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-md">{uploadMessage}</p>
              )}
              {uploadError && (
                <p className="text-sm text-destructive py-2 px-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md">{uploadError}</p>
              )}

              <Button type="submit" className="w-full md:w-auto" disabled={isUploading || !selectedFile}>
                {isUploading ? 'Uploading...' : 'Upload Document'}
              </Button>
            </form>
          </section>

          <section>
            <h2 className="text-xl md:text-2xl font-bold mb-6 text-primary">Add URL to Knowledge Base</h2>
            <form onSubmit={handleUrlSubmit} className="space-y-6 bg-card p-6 rounded-lg shadow-md">
              <div>
                <Label htmlFor="urlInput">URL (PDF, HTML page, or text document)</Label>
                <Input
                  id="urlInput"
                  type="url"
                  placeholder="https://example.com/research-report.pdf"
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    setUrlMessage(null);
                    setUrlError(null);
                  }}
                  className="mt-1"
                  required
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter a URL to a PDF, research paper, article, or report. The content will be fetched and added to the knowledge base.
                </p>
              </div>

              {urlMessage && (
                <p className="text-sm text-green-600 dark:text-green-400 py-2 px-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-700 rounded-md">{urlMessage}</p>
              )}
              {urlError && (
                <p className="text-sm text-destructive py-2 px-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-md">{urlError}</p>
              )}

              <Button type="submit" className="w-full md:w-auto" disabled={isUrlUploading || !urlInput.trim()}>
                {isUrlUploading ? 'Processing...' : 'Add URL to Knowledge Base'}
              </Button>
            </form>
          </section>
        </>
      )}

      {/* We can add a section here later to list/manage existing keys */}
    </div>
  );
} 