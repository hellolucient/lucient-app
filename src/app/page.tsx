'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useState, useEffect, FormEvent, useRef } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import TextareaAutosize from 'react-textarea-autosize';
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
  chatMode?: 'wellness' | 'general';
}

// Define available OpenAI models
const openAIModels = [
  { value: "gpt-4o", label: "GPT-4o (Omni)" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
  { value: "gpt-4", label: "GPT-4" },
  { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo" },
  // Add other models as needed, e.g., gpt-4o when available and desired
];

const LoadingSpinner = () => (
  <div className="flex items-center justify-center space-x-1">
    <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.3s]"></div>
    <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce [animation-delay:-0.15s]"></div>
    <div className="w-1.5 h-1.5 bg-current rounded-full animate-bounce"></div>
  </div>
);

export default function HomePage() {
  // State for chat functionality
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionExists, setSessionExists] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'anthropic' | 'openai'>('openai');
  const [selectedOpenAIModel, setSelectedOpenAIModel] = useState<string>(openAIModels[0].value); // Default to first OpenAI model
  const [chatMode, setChatMode] = useState<'wellness' | 'general'>('wellness');

  // State for page mode (chat or image generation)
  const [currentMode, setCurrentMode] = useState<'chat' | 'image'>('chat');

  // State for image generation
  const [imagePrompt, setImagePrompt] = useState('');
  const [generatedImageUrl, setGeneratedImageUrl] = useState<string | null>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageGenError, setImageGenError] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

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
    const requestBody: ChatRequestBody = { 
      message: newUserMessage.content,
      chatMode: chatMode,
    };

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
          <div className="flex flex-col h-full flex-grow">
            {/* Mode Switcher (Tabs) */}
            <div className="flex justify-center space-x-2 border-b">
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
              <div className="flex flex-col h-full flex-grow mt-6">
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

                <div className="mb-4">
                  <Label htmlFor="chat-mode-select">Chat Mode:</Label>
                  <Select 
                    value={chatMode} 
                    onValueChange={(value: 'wellness' | 'general') => setChatMode(value)}
                  >
                    <SelectTrigger id="chat-mode-select" className="mt-1">
                      <SelectValue placeholder="Select a chat mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wellness">Wellness Chat</SelectItem>
                      <SelectItem value="general">General Chat</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex-grow overflow-y-auto mb-4 p-4 border border-border/50 rounded-lg bg-card/30 min-h-[300px]">
                  {messages.length === 0 && (
                    <p className="text-muted-foreground text-center">No messages yet. Select your options and ask something!</p>
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
                  <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSendMessage} className="mt-auto w-full max-w-xl mx-auto">
                  <div className="relative">
                    <TextareaAutosize
                      value={inputValue}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
                      onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                      placeholder={isLoading ? `${selectedProvider === 'anthropic' ? 'Claude' : (openAIModels.find(m => m.value === selectedOpenAIModel)?.label || 'OpenAI')} is thinking...` : "Type your message..."}
                      className="w-full p-3 pr-20 rounded-lg border border-border/70 focus:ring-2 focus:ring-primary/50 focus:outline-none resize-none transition-shadow bg-background/80 backdrop-blur-sm"
                      aria-label="Chat message input"
                      minRows={1}
                      maxRows={5}
                      disabled={isLoading}
                    />
                    <Button
                      type="submit"
                      className="absolute top-1/2 right-2 transform -translate-y-1/2"
                      disabled={isLoading || !inputValue.trim()}
                      aria-label="Send message"
                    >
                      {isLoading ? <LoadingSpinner /> : 'Send'}
                    </Button>
                  </div>
                </form>
              </div>
            )}

            {currentMode === 'image' && (
              <div className="w-full max-w-xl mx-auto">
                <form onSubmit={handleGenerateImage} className="mb-4">
                  <Label htmlFor="image-prompt" className="mb-2 block">Image Prompt:</Label>
                  <div className="relative">
                    <TextareaAutosize
                      id="image-prompt"
                      value={imagePrompt}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setImagePrompt(e.target.value)}
                      placeholder="e.g., A futuristic cityscape at sunset"
                      className="w-full p-3 pr-28 rounded-lg border border-border/70 focus:ring-2 focus:ring-primary/50 focus:outline-none resize-none transition-shadow bg-background/80 backdrop-blur-sm"
                      aria-label="Image generation prompt"
                      minRows={1}
                      maxRows={5}
                    />
                    <Button type="submit" className="absolute top-1/2 right-2 transform -translate-y-1/2" disabled={isGeneratingImage}>
                      {isGeneratingImage ? 'Generating...' : 'Generate'}
                    </Button>
                  </div>
                </form>
                
                {isGeneratingImage && (
                  <div className="text-center">
                    <p>Generating your image, please wait...</p>
                  </div>
                )}

                {imageGenError && (
                  <div className="text-center p-3 rounded-lg bg-destructive text-destructive-foreground">
                    <p><strong>Error:</strong> {imageGenError}</p>
                  </div>
                )}

                {generatedImageUrl && (
                  <div className="mt-6 text-center">
                    <h3 className="text-xl font-semibold mb-4">Generated Image</h3>
                    <div className="relative w-full aspect-square rounded-lg overflow-hidden border">
                       <Image src={generatedImageUrl} alt="Generated image" layout="fill" objectFit="contain" />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">Right-click or long-press to save the image.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center">
            <p className="mb-4">
              Please <Link href="/login" className="underline hover:text-primary transition-colors">log in</Link> to start a new chat session.
            </p>
            <p className="text-sm text-muted-foreground">
              Built by <a href="https://www.trentmunday.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary transition-colors">Trent Munday</a>.
              Powered by <a href="https://www.anthropic.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary transition-colors">Anthropic</a>, <a href="https://openai.com/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary transition-colors">OpenAI</a>, and <a href="https://qdrant.tech/" target="_blank" rel="noopener noreferrer" className="underline hover:text-primary transition-colors">Qdrant</a>.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
