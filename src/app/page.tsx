'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useState, useEffect, FormEvent } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import Image from 'next/image';

// Define a type for individual messages in the chat
interface ChatMessage {
  role: 'user' | 'assistant' | 'system' | 'error';
  content: string;
}

// Define a type for the chat request body
interface ChatRequestBody {
  message: string;
  model?: string; // Optional, as it's only for OpenAI
}

// Define available OpenAI models
const openAIModels = [
  { value: "gpt-4o", label: "GPT-4o (Omni)" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gpt-4", label: "GPT-4" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  // Add other models as needed, e.g., gpt-4o when available and desired
];

export default function HomePage() {
  // State for chat functionality
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionExists, setSessionExists] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'anthropic' | 'openai'>('anthropic');
  const [selectedOpenAIModel, setSelectedOpenAIModel] = useState<string>(openAIModels[0].value); // Default to first OpenAI model

  // State for page mode (chat or image generation)
  const [currentMode, setCurrentMode] = useState<'chat' | 'image'>('chat');

  // State for image generation
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageGenError, setImageGenError] = useState<string | null>(null);

  useEffect(() => {
    async function checkSession() {
      try {
        const response = await fetch('/api/auth/session');
        if (response.ok) {
          const data = await response.json();
          setSessionExists(data.sessionExists);
        } else {
          setSessionExists(false);
        }
      } catch (error) {
        console.error("Error checking session:", error);
        setSessionExists(false);
      }
      setInitialCheckDone(true);
    }
    checkSession();
  }, []);

  const handleSendMessage = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    if (!inputValue.trim()) return;

    const newUserMessage: ChatMessage = { role: 'user', content: inputValue.trim() };
    setMessages(prevMessages => [...prevMessages, newUserMessage]);
    setInputValue('');
    setIsLoading(true);

    let apiEndpoint = '/api/chat';
    const requestBody: ChatRequestBody = { message: newUserMessage.content };

    if (selectedProvider === 'openai') {
      apiEndpoint = '/api/chat/openai';
      requestBody.model = selectedOpenAIModel; // Add selected OpenAI model to request
    }

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.details || 'Failed to get response from API');
      }

      const data = await response.json();
      const assistantMessage: ChatMessage = { role: 'assistant', content: data.reply };
      setMessages(prevMessages => [...prevMessages, assistantMessage]);

    } catch (error: unknown) {
      console.error("Error sending message to", selectedProvider, ":", error);
      let errorMessageContent = 'An error occurred.';
      if (error instanceof Error) {
        errorMessageContent = error.message;
      } else if (typeof error === 'string') {
        errorMessageContent = error;
      }
      const errorMessage: ChatMessage = { role: 'error', content: `Error with ${selectedProvider}${selectedProvider === 'openai' ? ' (' + selectedOpenAIModel + ')' : ''}: ${errorMessageContent}` };
      setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateImage = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    if (!imagePrompt.trim()) return;

    setIsGeneratingImage(true);
    setGeneratedImageUrl(null);
    setImageGenError(null);

    try {
      const response = await fetch('/api/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: imagePrompt }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || result.details || 'Failed to generate image.');
      }
      setGeneratedImageUrl(result.imageUrl);
    } catch (error: unknown) {
      console.error("Error generating image:", error);
      let detailMessage = 'An unexpected error occurred while generating the image.';
      if (error instanceof Error) {
        detailMessage = error.message;
      } else if (typeof error === 'string') {
        detailMessage = error;
      }
      setImageGenError(detailMessage);
    } finally {
      setIsGeneratingImage(false);
    }
  };

  if (!initialCheckDone) {
    return (
        <main className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-center p-6 text-center">
            <p>Loading session...</p>
        </main>
    );
  }

  return (
    <main className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-between p-6">
      <div className="w-full max-w-xl mx-auto flex flex-col h-full">
        <div className="mb-8 text-center">
          <h1 className="text-4xl lg:text-5xl font-bold">Welcome to <em className="lowercase font-bold italic">lucient</em></h1>
          <p className="mt-4 text-lg text-muted-foreground">
            Your intelligent assistant is ready.
          </p>
        </div>

        {sessionExists ? (
          <>
            {/* Mode Switcher (Tabs) */}
            <div className="mb-6 flex justify-center space-x-2 border-b">
              <Button 
                variant={currentMode === 'chat' ? 'secondary' : 'ghost'}
                onClick={() => setCurrentMode('chat')}
                className="rounded-b-none"
              >
                Chat
              </Button>
              <Button 
                variant={currentMode === 'image' ? 'secondary' : 'ghost'}
                onClick={() => setCurrentMode('image')}
                className="rounded-b-none"
              >
                Generate Image (DALL·E)
              </Button>
            </div>

            {currentMode === 'chat' && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div>
                    <Label htmlFor="provider-select">LLM Provider:</Label>
                    <Select 
                      value={selectedProvider} 
                      onValueChange={(value: 'anthropic' | 'openai') => {
                        setSelectedProvider(value);
                        // Optionally reset messages when provider changes
                        // setMessages([]); 
                      }}
                    >
                      <SelectTrigger id="provider-select" className="mt-1">
                        <SelectValue placeholder="Select a provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="anthropic">Anthropic (Claude)</SelectItem>
                        <SelectItem value="openai">OpenAI (ChatGPT)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedProvider === 'openai' && (
                    <div>
                      <Label htmlFor="openai-model-select">OpenAI Model:</Label>
                      <Select 
                        value={selectedOpenAIModel} 
                        onValueChange={(value: string) => setSelectedOpenAIModel(value)}
                      >
                        <SelectTrigger id="openai-model-select" className="mt-1">
                          <SelectValue placeholder="Select an OpenAI model" />
                        </SelectTrigger>
                        <SelectContent>
                          {openAIModels.map(model => (
                            <SelectItem key={model.value} value={model.value}>{model.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                <div className="flex-grow overflow-y-auto mb-4 p-4 border border-border/50 rounded-lg bg-card/30 min-h-[300px]">
                  {messages.length === 0 && (
                    <p className="text-muted-foreground text-center">No messages yet. Select a provider{selectedProvider === 'openai' && ', a model,'} and ask something!</p>
                  )}
                  {messages.map((msg, index) => (
                    <div key={index} className={`mb-3 p-3 rounded-lg max-w-[80%] ${ 
                      msg.role === 'user' ? 'bg-primary text-primary-foreground ml-auto' : 
                      msg.role === 'assistant' ? 'bg-muted text-muted-foreground mr-auto' : 
                      'bg-destructive text-destructive-foreground mr-auto font-semibold' 
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleSendMessage} className="sticky bottom-6 w-full max-w-xl mx-auto">
                  <div className="relative flex items-center">
                    <Input
                      type="text"
                      placeholder={isLoading ? `${selectedProvider === 'anthropic' ? 'Claude' : (openAIModels.find(m => m.value === selectedOpenAIModel)?.label || 'OpenAI')} is thinking...` : "Ask anything..."}
                      value={inputValue}
                      onChange={(e) => setInputValue(e.target.value)}
                      disabled={isLoading}
                      className="flex-grow border border-border/50 bg-card rounded-full p-3.5 pl-5 pr-12 text-sm shadow-lg focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:border-transparent outline-none transition-shadow duration-200 ease-in-out"
                      aria-label="Chat message input"
                    />
                    <Button
                      type="submit"
                      disabled={isLoading || !inputValue.trim()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-primary text-primary-foreground p-2 rounded-full text-sm font-medium hover:bg-primary/90 shadow-md flex items-center justify-center aspect-square focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Send message"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14"/><path d="m18 11-6-6"/><path d="m6 11 6-6"/></svg>
                    </Button>
                  </div>
                </form>
              </>
            )}

            {currentMode === 'image' && (
              <div className="w-full">
                <form onSubmit={handleGenerateImage} className="space-y-4 mb-6">
                  <div>
                    <Label htmlFor="image-prompt">Image Prompt:</Label>
                    <Input 
                      id="image-prompt"
                      type="text"
                      value={imagePrompt}
                      onChange={(e) => setImagePrompt(e.target.value)}
                      placeholder="e.g., A high-quality photo of a cat wearing a tiny hat"
                      disabled={isGeneratingImage}
                      className="mt-1"
                    />
                  </div>
                  <Button type="submit" disabled={isGeneratingImage || !imagePrompt.trim()} className="w-full">
                    {isGeneratingImage ? 'Generating Image...' : 'Generate Image'}
                  </Button>
                </form>

                {isGeneratingImage && (
                  <div className="text-center p-4">
                    <p>Generating your image, please wait...</p>
                    {/* Optional: Add a visual spinner component here */}
                  </div>
                )}

                {imageGenError && (
                  <div className="mt-4 p-3 bg-destructive/10 border border-destructive/30 rounded-md text-destructive">
                    <p className="font-semibold">Error Generating Image:</p>
                    <p className="text-sm">{imageGenError}</p>
                  </div>
                )}

                {generatedImageUrl && !isGeneratingImage && (
                  <div className="mt-4 border rounded-lg overflow-hidden shadow-lg">
                    <Image
                      src={generatedImageUrl}
                      alt={imagePrompt || 'Generated DALL·E image'}
                      width={1024}
                      height={1024}
                      className="w-full h-auto object-contain max-h-[512px] md:max-h-[768px] mx-auto"
                      priority
                    />
                    {imagePrompt && <p className="text-xs text-muted-foreground p-2 bg-card text-center">Prompt: {imagePrompt}</p>}
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center">
            <Button asChild size="lg">
              <Link href="/login">
                Sign In to Get Started
              </Link>
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}
