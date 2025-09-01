'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useState, useEffect, FormEvent, useRef } from 'react';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import TextareaAutosize from 'react-textarea-autosize';
import Image from 'next/image';
import { ChevronDown, Check, Info } from 'lucide-react';

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
  provider?: 'anthropic' | 'openai';
  conversationHistory?: ChatMessage[]; // Optional conversation history
}

// Add UserProfile type
type UserProfile = {
  user_tier: 'free_trial' | 'byok' | 'vip_tester' | 'admin';
  message_credits: number;
};

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

const FreeTrialIndicator = ({ credits }: { credits: number }) => (
  <div className="flex items-center justify-center text-xs text-muted-foreground bg-card p-3 rounded-lg border border-border transition-smooth">
    <Info className="h-4 w-4 mr-2 text-accent" />
    You have <span className="font-semibold text-primary mx-1">{credits}</span> free messages remaining.
  </div>
);

export default function HomePage() {
  // State for chat functionality
  const [inputValue, setInputValue] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sessionExists, setSessionExists] = useState(false);
  const [initialCheckDone, setInitialCheckDone] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null); // Add profile state
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

  const getCurrentModelLabel = () => {
    if (selectedProvider === 'anthropic') {
      return 'Anthropic (Claude)';
    }
    const model = openAIModels.find(m => m.value === selectedOpenAIModel);
    return model ? `OpenAI (${model.label})` : 'Select a model';
  };

  useEffect(() => {
    async function checkSessionAndProfile() {
      try {
        // Fetch from the new profile endpoint
        const response = await fetch('/api/user/profile');
        if (response.ok) {
          const data = await response.json();
          setUserProfile(data.profile);
          setSessionExists(true);
        } else {
          setUserProfile(null);
          setSessionExists(false);
        }
      } catch (error) {
        console.error("Error checking session and profile:", error);
        setSessionExists(false);
        setUserProfile(null);
      }
      setInitialCheckDone(true);
    }
    checkSessionAndProfile();
  }, []);

  // When a message is successfully sent and we get a reply,
  // if the user is on a free trial, we decrement their credits locally
  // This provides immediate feedback without needing to re-fetch the profile.
  useEffect(() => {
    if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
      if (userProfile?.user_tier === 'free_trial') {
        setUserProfile(prev => prev ? { ...prev, message_credits: prev.message_credits - 1 } : null);
      }
    }
  }, [messages, userProfile?.user_tier]);

  const handleSendMessage = async (event?: FormEvent) => {
    if (event) event.preventDefault();
    if (!inputValue.trim()) return;

    const newUserMessage: ChatMessage = { role: 'user', content: inputValue.trim() };
    console.log('Adding user message:', newUserMessage);
    setMessages(prevMessages => {
      const updatedMessages = [...prevMessages, newUserMessage];
      console.log('Updated messages array:', updatedMessages);
      return updatedMessages;
    });
    setInputValue('');
    setIsLoading(true);

    const apiEndpoint = '/api/chat'; // Always use the main chat endpoint
    const requestBody: ChatRequestBody = { 
      message: newUserMessage.content,
      chatMode: chatMode,
      provider: selectedProvider, // Include the provider in the body
      conversationHistory: messages.slice(-10), // Send last 10 messages for context
    };

    if (selectedProvider === 'openai') {
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
      console.log('Adding assistant message:', assistantMessage);
      setMessages(prevMessages => {
        const updatedMessages = [...prevMessages, assistantMessage];
        console.log('Final messages array:', updatedMessages);
        return updatedMessages;
      });

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
    <main className="flex min-h-[calc(100vh-64px)] flex-col items-center justify-between p-6 relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/5 -z-10"></div>
      
      {/* Floating orbs for visual interest */}
      <div className="absolute top-20 left-10 w-32 h-32 bg-gradient-primary rounded-full opacity-10 blur-xl animate-pulse"></div>
      <div className="absolute bottom-20 right-10 w-24 h-24 bg-gradient-secondary rounded-full opacity-10 blur-xl animate-pulse delay-1000"></div>
      <div className="absolute top-1/2 left-1/4 w-16 h-16 bg-gradient-accent rounded-full opacity-10 blur-lg animate-pulse delay-500"></div>
      
      <div className="w-full max-w-xl mx-auto flex flex-col h-full relative z-10">
        <div className="mb-8 text-center">
          <h1 className="text-4xl lg:text-5xl font-bold">
            Welcome to <em className="lowercase font-bold italic text-primary">lucient</em>
          </h1>
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
                    <Label htmlFor="provider-select">LLM Provider & Model:</Label>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" id="provider-select" className="w-full justify-between mt-1">
                          {getCurrentModelLabel()}
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
                        <DropdownMenuItem onClick={() => setSelectedProvider('anthropic')}>
                          Anthropic (Claude)
                          {selectedProvider === 'anthropic' && <Check className="ml-auto h-4 w-4" />}
                        </DropdownMenuItem>
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger>
                            <span>OpenAI (ChatGPT)</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent>
                            {openAIModels.map(model => (
                              <DropdownMenuItem
                                key={model.value}
                                onClick={() => {
                                  setSelectedProvider('openai');
                                  setSelectedOpenAIModel(model.value);
                                }}
                              >
                                {model.label}
                                {selectedProvider === 'openai' && selectedOpenAIModel === model.value && <Check className="ml-auto h-4 w-4" />}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div>
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
                </div>

                {userProfile?.user_tier === 'free_trial' && (
                  <div className="mb-4">
                    <FreeTrialIndicator credits={userProfile.message_credits} />
                  </div>
                )}

                <div className="flex-grow overflow-y-auto mb-4 p-4 border border-border rounded-lg bg-card min-h-[300px] transition-smooth">
                  {messages.length === 0 && (
                    <div className="text-center py-8">
                      <div className="w-16 h-16 mx-auto mb-4 bg-gradient-primary rounded-full flex items-center justify-center">
                        <span className="text-2xl">✨</span>
                      </div>
                      <p className="text-muted-foreground">No messages yet. Select your options and ask something!</p>
                    </div>
                  )}
                  {messages.map((msg, index) => {
                    console.log(`Rendering message ${index}:`, msg);
                    return (
                      <div key={index} className={`mb-3 p-3 rounded-lg max-w-[80%] transition-smooth ${
                        msg.role === 'user' ? 'bg-gradient-primary text-primary-foreground ml-auto glow-primary' : 
                        msg.role === 'assistant' ? 'bg-muted/80 backdrop-blur-sm text-muted-foreground mr-auto border border-border/30' : 
                        'bg-destructive text-destructive-foreground mr-auto font-semibold' 
                      }`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    );
                  })}
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
                      className="w-full p-3 pr-20 rounded-lg border border-border focus:ring-2 focus:ring-primary/50 focus:outline-none resize-none transition-smooth bg-background"
                      aria-label="Chat message input"
                      minRows={1}
                      maxRows={5}
                      disabled={isLoading}
                    />
                    <Button
                      type="submit"
                      className="absolute top-1/2 right-2 transform -translate-y-1/2 bg-gradient-primary hover:bg-gradient-primary/90 transition-smooth"
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
            {/* The old content for logged-out users is removed from here */}
            {/* The new, combined content is below */}
          </div>
        )}

        {!sessionExists && (
                            <div className="mt-8 flex flex-col items-center gap-6 text-center">
                <div className="bg-card p-6 rounded-xl border border-border">
                    <p className="text-muted-foreground mb-4">Please sign in to begin or request an invite.</p>
                    <div className="flex gap-4">
                        <Button asChild className="bg-gradient-primary hover:bg-gradient-primary/90 transition-smooth">
                            <Link href="/login">Sign In</Link>
                        </Button>
                        <Button asChild variant="secondary" className="bg-gradient-secondary hover:bg-gradient-secondary/90 transition-smooth">
                            <Link href="/request-invite">Request an Invite</Link>
                        </Button>
                    </div>
                </div>
            </div>
        )}
      </div>
    </main>
  );
}
