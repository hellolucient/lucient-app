# Lucient App - Integration Guide

## Overview
Lucient is a sophisticated AI assistant platform with multi-provider chat, image generation, RAG (Retrieval Augmented Generation), user management, and API key management. This guide provides everything needed to integrate these features into another application.

## Core Features

### 1. Multi-Provider AI Chat
- **Claude (Anthropic)** and **GPT (OpenAI)** support
- Model selection for OpenAI (GPT-4o, GPT-3.5-turbo, etc.)
- Real-time streaming responses
- Conversation history management
- Error handling and retry logic

### 2. DALL-E Image Generation
- DALL-E 3 integration
- Prompt input and validation
- Image display and error handling
- Mode switching (chat ↔ image)

### 3. RAG (Retrieval Augmented Generation)
- Document upload (.txt, .pdf, .doc, .docx) - Admin only
- Text extraction and chunking
- Embedding generation (OpenAI text-embedding-3-small)
- Vector storage (Supabase pgvector)
- Shared knowledge base - all users can query all documents
- Context retrieval during chat (Wellness Chat mode only)
- Similarity search with configurable thresholds

### 4. User Management System
- Invite-based onboarding
- Admin approval panel
- Free trial system (20 credits)
- User tier system (free_trial, byok, vip_tester, admin)
- Automated profile creation

### 5. API Key Management
- Encrypted storage (AES-256-GCM)
- Provider-specific key management
- Secure retrieval for API calls

## Tech Stack

### Frontend
- **Next.js 15** with App Router
- **TypeScript** for type safety
- **Tailwind CSS** + **Shadcn/UI** for styling
- **React 19** with modern hooks
- **Zustand** for state management

### Backend
- **Next.js API Routes** (serverless functions)
- **Supabase** for authentication, database, and vector storage
- **OpenAI API** (GPT models, DALL-E, embeddings)
- **Anthropic API** (Claude models)

### Key Libraries
- `@supabase/ssr` for server-side auth
- `langchain` for text chunking
- `mammoth` for .docx parsing
- `pdf-parse` for PDF parsing
- `crypto` for API key encryption

## Database Schema

### Supabase Tables

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- User profiles with tier and credits
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id),
    user_tier TEXT DEFAULT 'free_trial',
    message_credits INTEGER DEFAULT 20,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Encrypted API keys
CREATE TABLE user_api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    provider TEXT NOT NULL,
    encrypted_key TEXT NOT NULL,
    label TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Invite requests
CREATE TABLE invite_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Vector-enabled documents table
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    original_text TEXT NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding vector(1536), -- OpenAI text-embedding-3-small dimension
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_documents_user_id ON documents(user_id);
CREATE INDEX idx_documents_file_name ON documents(file_name);
CREATE INDEX idx_documents_created_at ON documents(created_at);
CREATE INDEX idx_documents_embedding ON documents USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Row Level Security (Shared Knowledge Base)
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
-- All authenticated users can read all documents (shared knowledge base)
CREATE POLICY "All authenticated users can view all documents" ON documents FOR SELECT USING (auth.uid() IS NOT NULL);
-- Only admins can insert/update/delete documents
CREATE POLICY "Only admins can insert documents" ON documents FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_tier = 'admin')
);
CREATE POLICY "Only admins can update documents" ON documents FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_tier = 'admin')
);
CREATE POLICY "Only admins can delete documents" ON documents FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.user_tier = 'admin')
);

-- Vector similarity search function
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.78,
    match_count int DEFAULT 5,
    user_filter uuid DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    user_id uuid,
    file_name text,
    chunk_text text,
    metadata jsonb,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        documents.id,
        documents.user_id,
        documents.file_name,
        documents.chunk_text,
        documents.metadata,
        1 - (documents.embedding <=> query_embedding) AS similarity
    FROM documents
    WHERE 
        (user_filter IS NULL OR documents.user_id = user_filter)
        AND 1 - (documents.embedding <=> query_embedding) > match_threshold
    ORDER BY documents.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
```

## Key API Endpoints

```typescript
// Authentication
POST /api/auth/session
POST /api/request-invite
POST /api/set-password

// Chat & AI
POST /api/chat/route.ts (Claude)
POST /api/chat/openai/route.ts (OpenAI)
POST /api/image/generate

// User Management
GET/POST /api/user-keys
GET /api/user/profile
POST /api/admin/approve
GET /api/admin/invites

// RAG
POST /api/documents/upsert
```

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_project_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# AI Providers
OPENAI_API_KEY=your_openai_api_key
ANTHROPIC_API_KEY=your_anthropic_api_key

# Security
ENCRYPTION_KEY=a_very_secure_32_byte_long_random_string
```

## Core Implementation Files

### Vector Operations (Supabase)
```typescript
// src/lib/vector/supabaseVectorClient.ts
export async function upsertDocumentChunks(chunks: DocumentChunk[], userId: string, fileName: string, originalText: string)
export async function queryTopK(queryText: string, topK: number = 5, userId?: string, matchThreshold: number = 0.78)
export async function deleteUserDocuments(userId: string)
export async function getUserDocumentStats(userId: string)
```

### Document Processing
```typescript
// src/lib/textProcessing/chunking.ts
export function getDocumentChunks(text: string, chunkSize: number = 1000, overlap: number = 200)

// src/lib/ai/embeddingUtils.ts
export async function generateEmbedding(text: string)
```

### API Key Management
```typescript
// src/lib/encryption.ts
export function encryptApiKey(apiKey: string, encryptionKey: string)
export function decryptApiKey(encryptedKey: string, encryptionKey: string)

// src/app/api/user-keys/route.ts
// Handles saving and retrieving encrypted API keys
```

### Chat Integration
```typescript
// src/app/api/chat/route.ts
// Main chat logic with RAG integration
// Tier-based access control
// Credit tracking for free trial users
```

## User Tier System

### Free Trial Users
- 20 free message credits
- Uses platform's OpenAI API key
- Automatic credit decrementation
- Graceful fallback to user's own keys

### BYOK (Bring Your Own Key) Users
- Must provide their own API keys
- No credit limits
- Provider selection (Claude/OpenAI)

### VIP Tester Users
- Extended features
- Higher rate limits
- Priority support

### Admin Users
- Access to admin panel
- Can approve invite requests
- System management capabilities

## RAG Pipeline Flow

1. **Document Upload** (Admin Only)
   - Admin uploads file via settings page
   - File validation (.txt, .pdf, .doc, .docx)
   - Admin check enforced at API level
   - Text extraction using appropriate parser

2. **Text Processing**
   - Chunking using langchain/text_splitter
   - Configurable chunk size and overlap
   - Metadata preservation

3. **Embedding Generation**
   - OpenAI text-embedding-3-small model
   - 1536-dimensional vectors
   - Batch processing for efficiency

4. **Vector Storage**
   - Supabase pgvector extension
   - Shared knowledge base (all users can read)
   - RLS policies: all authenticated users can read, only admins can write
   - Automatic indexing for performance

5. **Context Retrieval**
   - Similarity search during chat (Wellness Chat mode only)
   - Configurable threshold (default: 0.78)
   - Top-K results (default: 5)
   - Shared knowledge base - all users query all documents
   - General Chat mode does not use RAG

## Integration Complexity Assessment

### Easy to Integrate
- UI components (Shadcn/UI)
- Basic chat interface
- Image generation
- API key management

### Medium Complexity
- Authentication flow
- RAG pipeline
- User tier system

### Complex
- Database migrations
- Vector database setup (pgvector)
- Encryption system
- Admin approval flow

## Recommended Integration Order

1. **Start with UI components** - Copy chat interface and settings pages
2. **Add API key management** - Secure, well-tested implementation
3. **Implement basic chat** - Multi-provider support
4. **Add image generation** - DALL-E integration
5. **Set up pgvector** - Database migration and vector operations
6. **Implement RAG pipeline** - Document upload and context retrieval
7. **Add user management** - Tier system and credits
8. **Admin features** - Invite approval system

## Key Benefits of Supabase Migration

- **Single Database** - No need for separate vector DB
- **Built-in Auth** - User isolation already handled
- **SQL Familiarity** - Easier to debug and extend
- **Cost Effective** - No additional vector DB service
- **Simpler Deployment** - One less external dependency

## Known Issues & Considerations

- **Conversational Context** - AI may lose context in long conversations
- **Response Accuracy** - System prompts need reinforcement for brand accuracy
- **Rate Limiting** - Consider implementing for production use
- **Error Handling** - Robust error handling for API failures
- **Security** - Ensure proper encryption and access controls

## Testing Endpoints

```typescript
// Test RAG functionality
GET /api/test-rag

// Debug chat with RAG
POST /api/debug-chat
```

This integration guide provides a comprehensive overview of the Lucient app's architecture and implementation details for successful integration into another application.
