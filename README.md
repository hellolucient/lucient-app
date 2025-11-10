# lucient - Your Intelligent Assistant

`lucient` is a Next.js 15 application designed as an intelligent assistant. It integrates with various AI models for chat and image generation, and uses a Retrieval Augmented Generation (RAG) pipeline with Supabase pgvector to provide context-aware responses based on uploaded documents.

## Core Technologies

*   **Framework**: [Next.js](https://nextjs.org/) (v15 with App Router)
*   **Language**: [TypeScript](https://www.typescriptlang.org/)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/) with [Shadcn/UI](https://ui.shadcn.com/) component library
*   **Authentication**: [Supabase Auth](https://supabase.com/docs/guides/auth) (using `@supabase/ssr`)
*   **Vector Database**: [Supabase pgvector](https://supabase.com/docs/guides/ai) (for RAG)
*   **AI SDKs**:
    *   `@anthropic-ai/sdk` (for Claude models)
    *   `openai` (for GPT models and DALL-E)
*   **Text Processing**: `langchain` (for text splitting), `mammoth` (for .docx), `pdf-parse` (for .pdf)
*   **Deployment**: (Initially local, Git repository set up on GitHub)

## Implemented Features

*   **User Onboarding and Management**:
    *   **Invite Request System**: A public page (`/request-invite`) allows new users to request access.
    *   **Admin Approval Panel**: A secure page (`/admin`) for administrators to view pending invite requests and approve them.
    *   **Automated Invitation Flow**:
        *   Upon approval, the system automatically sends an invitation email to the user via Supabase Auth.
        *   The invitation link directs the user to a dedicated page (`/set-password`) to create their password.
        *   After successfully setting a password, the user is redirected to their settings page (`/settings`).
    *   **Free Trial**: New users receive 20 free message credits to use the service without needing their own API key. This is powered by the platform's internal OpenAI API key. The estimated cost for the platform is approximately $0.30 per user for the full 20 messages.
    *   **Automated Profile Creation**: A database trigger (`handle_new_user` on `auth.users`) automatically creates a corresponding public profile for every new user.
*   **User Authentication**: Secure sign-up, login, and logout via Supabase.
*   **API Key Management**:
    *   Users can save and manage their API keys for LLM providers (Anthropic, OpenAI) in their settings.
    *   Keys are encrypted at rest in the Supabase database.
    *   API routes (`/api/user-keys`) use `createServerClient` from `@supabase/ssr` for secure session handling.
*   **Multi-Provider Chat Interface**:
    *   Client-side UI (`src/app/page.tsx`) for sending messages and displaying responses.
    *   Backend API routes for Claude (`/api/chat/route.ts`) and OpenAI (`/api/chat/openai/route.ts`).
    *   Provider selection (Claude/OpenAI) and model selection for OpenAI (e.g., `gpt-4o`, `gpt-3.5-turbo`).
    *   Client-side session checks using `/api/auth/session/route.ts`.
*   **DALL·E Image Generation**:
    *   Mode switcher in the UI to toggle between Chat and Image Generation.
    *   Interface for submitting image prompts.
    *   Backend API (`/api/image/generate/route.ts`) to call DALL·E 3 and return image URLs.
*   **Retrieval Augmented Generation (RAG)**:
    *   **Document Upload** (Admin Only):
        *   Admins can upload `.txt`, `.pdf`, `.doc`, and `.docx` files via settings page.
        *   Backend API (`/api/documents/upsert/route.ts`) processes files:
            *   Extracts text content.
            *   Chunks text using `langchain/text_splitter`.
            *   Generates embeddings using OpenAI's `text-embedding-3-small` model.
            *   Upserts embeddings and metadata to Supabase using pgvector extension.
    *   **Shared Knowledge Base**:
        *   Documents are stored in a shared knowledge base accessible to all authenticated users.
        *   RLS policies ensure all users can read documents, but only admins can upload/modify.
    *   **Contextualized Chat**:
        *   Chat APIs (`/api/chat/...`) query Supabase for relevant document chunks based on the user's message.
        *   Retrieved context is prepended to the prompt sent to the LLM, enabling context-aware responses.
        *   Wellness Chat mode uses the shared knowledge base; General Chat mode does not use RAG.
*   **Next.js Configuration**:
    *   `next.config.js` updated to include `serverExternalPackages: ['pdf-parse']` to resolve bundling issues with `pdf-parse`.
*   **Git Integration**:
    *   Project initialized with Git.
    *   Connected to a GitHub remote (`https://github.com/hellolucient/lucient-app`).

## Project Structure (Key Areas)

```
/lucient
├── .env.local          # IMPORTANT: Supabase, OpenAI, Anthropic keys
├── next.config.js      # Next.js configuration (e.g., serverExternalPackages)
├── package.json        # Dependencies and scripts
├── supabase/
│   └── migrations/     # Database migrations including pgvector setup
├── src/
│   ├── app/
│   │   ├── (main)/
│   │   │   ├── admin/page.tsx             # Admin dashboard for approving invites
│   │   │   ├── settings/page.tsx          # API Key and Document Upload UI
│   │   │   └── page.tsx                   # Main Chat/Image Generation UI
│   │   ├── api/
│   │   │   ├── admin/
│   │   │   │   ├── approve/route.ts       # Approves a user invite
│   │   │   │   └── invites/route.ts       # Fetches pending invites for the admin panel
│   │   │   ├── chat/route.ts              # Handles all chat logic (Anthropic, OpenAI)
│   │   │   ├── documents/upsert/route.ts  # Document upload and embedding
│   │   │   ├── image/generate/route.ts    # DALL-E image generation
│   │   │   ├── request-invite/route.ts    # Handles new user invite requests
│   │   │   ├── set-password/route.ts      # Sets the user's password from the invite flow
│   │   │   └── user-keys/route.ts         # API key saving
│   │   ├── login/                         # Login page and logic
│   │   ├── request-invite/page.tsx        # UI for users to request an invite
│   │   └── set-password/page.tsx          # UI for new users to set their password
│   ├── lib/
│   │   ├── ai/                          # AI logic (OpenAI client, embedding utils)
│   │   │   ├── embeddingUtils.ts
│   │   │   └── openai.ts
│   │   ├── supabase/                    # Supabase client and auth helpers (ssr)
│   │   ├── user-keys.ts                   # Helpers for user API key management
│   │   ├── vector/                      # Supabase vector client, querying
│   │   └── textProcessing/              # Text chunking logic
│   └── middleware.ts                    # Route protection
├── ... (other standard Next.js files and folders)
```

## Getting Started

### Prerequisites

*   [Node.js](https://nodejs.org/) (LTS version, e.g., v18 or v20)
*   [npm](https://www.npmjs.com/) (or yarn/pnpm)
*   A [Supabase](https://supabase.com/) project (for authentication, database, and vector storage)
*   API Keys for:
    *   [OpenAI](https://platform.openai.com/signup/) (for GPT models, DALL-E, and embeddings)
    *   [Anthropic](https://console.anthropic.com/) (for Claude models) - Ensure you have credits.

### Setup

1.  **Clone the repository (if applicable) or ensure you are in the project directory.**

2.  **Install dependencies:**
    ```bash
    npm install
    # or yarn install / pnpm install
    ```

3.  **Set up Environment Variables:**
    Create a `.env.local` file in the project root. Populate it with your actual credentials:
    ```env
    # Supabase
    NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_project_anon_key
    SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key # If needed for admin tasks from backend

    # AI Providers
    OPENAI_API_KEY=your_openai_api_key
    ANTHROPIC_API_KEY=your_anthropic_api_key # (Stored by users, but good for testing admin features if any)

    # Encryption Key (must be 32 bytes for aes-256-gcm)
    ENCRYPTION_KEY=a_very_secure_32_byte_long_random_string # Generate a strong random key
    ```
    *   **Important**: `ENCRYPTION_KEY` must be a 32-character (256-bit) string for AES-256-GCM used in API key encryption.
    *   You can find Supabase URL and Anon Key in your Supabase project settings under "API".

4.  **Ensure your Supabase project has Email Authentication enabled.**
    *   Go to your Supabase Dashboard -> Authentication -> Providers -> Email. Make sure it's enabled.
    *   (Recommended for development) Disable "Confirm email" under Authentication -> Providers -> Email, or ensure you have a way to click confirmation links.

5.  **Set up Supabase Database:**
    Run the database migrations to set up the required tables and pgvector extension:
    *   Go to your Supabase Dashboard -> SQL Editor
    *   Run the migration files from `supabase/migrations/` in order:
        *   `20250101100300_add_vector_extension_and_documents_table.sql` - Sets up pgvector and documents table
        *   `20250101100400_update_documents_rls_for_shared_knowledge_base.sql` - Configures RLS for shared knowledge base
    *   This will create the `documents` table with vector support and set up Row Level Security policies.

### Running the Development Server

Execute the following command:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Verifying Document Uploads

After uploading documents through the application's UI (as an admin), you can verify they were stored correctly:

1. **Via Supabase Dashboard:**
    *   Go to your Supabase Dashboard -> Table Editor -> `documents` table
    *   You should see rows with `chunk_text`, `file_name`, and `embedding` columns populated

2. **Via Wellness Chat:**
    *   Switch to "Wellness Chat" mode in the application
    *   Ask a question related to your uploaded documents
    *   The AI should respond with context from your documents

## Key Modules and Files

*   **Authentication & Session**: `src/middleware.ts`, `src/lib/supabase/`, `/api/auth/session/route.ts`
*   **API Key Storage**: `/api/user-keys/route.ts`, `src/lib/encryption.ts`
*   **Chat Logic**: `src/app/page.tsx` (UI), `/api/chat/` (backend routes)
*   **Image Generation**: `src/app/page.tsx` (UI), `/api/image/generate/route.ts`
*   **RAG Pipeline**:
    *   Upload UI: `src/app/(main)/settings/page.tsx` (admin only)
    *   Upload API: `/api/documents/upsert/route.ts`
    *   Chunking: `src/lib/textProcessing/chunking.ts`
    *   Embeddings: `src/lib/ai/embeddingUtils.ts`
    *   Supabase Vector Client & Queries: `src/lib/vector/supabaseVectorClient.ts`

## Known Issues & Future Improvements

*   **Conversational Context**: The AI can sometimes fail to track conversational context. For example, when asked "who created it?" after a question about "lucient", it may not correctly infer that "it" refers to "lucient". This needs to be improved, likely through better prompt engineering or state management.
*   **Response Accuracy**: The AI may provide incorrect information about its own origins, stating it was created by a large company like OpenAI. The system prompt needs to be reinforced to ensure it always gives the correct, branded answer.

This README provides an overview of the `lucient` project's current state.
