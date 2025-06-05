# lucient - Your Intelligent Assistant

`lucient` is a Next.js 15 application designed as an intelligent assistant. It integrates with various AI models for chat and image generation, and uses a Retrieval Augmented Generation (RAG) pipeline with Qdrant to provide context-aware responses based on uploaded documents.

## Core Technologies

*   **Framework**: [Next.js](https://nextjs.org/) (v15 with App Router)
*   **Language**: [TypeScript](https://www.typescriptlang.org/)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/) with [Shadcn/UI](https://ui.shadcn.com/) component library
*   **Authentication**: [Supabase Auth](https://supabase.com/docs/guides/auth) (using `@supabase/ssr`)
*   **Vector Database**: [Qdrant Cloud](https://qdrant.tech/cloud/) (for RAG)
*   **AI SDKs**:
    *   `@anthropic-ai/sdk` (for Claude models)
    *   `openai` (for GPT models and DALL-E)
*   **Text Processing**: `langchain` (for text splitting), `mammoth` (for .docx), `pdf-parse` (for .pdf)
*   **Deployment**: (Initially local, Git repository set up on GitHub)

## Implemented Features

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
    *   **Document Upload**:
        *   Users can upload `.txt`, `.pdf`, `.doc`, and `.docx` files via settings page.
        *   Backend API (`/api/documents/upsert/route.ts`) processes files:
            *   Extracts text content.
            *   Chunks text using `langchain/text_splitter`.
            *   Generates embeddings using OpenAI's `text-embedding-3-small` model.
            *   Upserts embeddings and metadata to a Qdrant Cloud collection.
    *   **Contextualized Chat**:
        *   Chat APIs (`/api/chat/...`) query Qdrant for relevant document chunks based on the user's message.
        *   Retrieved context is prepended to the prompt sent to the LLM, enabling context-aware responses.
*   **Qdrant Setup & Verification**:
    *   `scripts/setupQdrant.ts`:
        *   Ensures the specified Qdrant collection (e.g., `lucient_documents`) exists, creating it if necessary with appropriate vector parameters (1536 dimensions, Cosine distance).
        *   Includes a utility to fetch and display sample points from the collection, verifying successful document uploads.
*   **Next.js Configuration**:
    *   `next.config.js` updated to include `serverExternalPackages: ['pdf-parse']` to resolve bundling issues with `pdf-parse`.
*   **Git Integration**:
    *   Project initialized with Git.
    *   Connected to a GitHub remote (`https://github.com/hellolucient/lucient-app`).

## Project Structure (Key Areas)

```
/lucient
├── .env.local          # IMPORTANT: Supabase, Qdrant, OpenAI, Anthropic keys
├── next.config.js      # Next.js configuration (e.g., serverExternalPackages)
├── package.json        # Dependencies and scripts
├── scripts/
│   └── setupQdrant.ts  # Script to initialize Qdrant collection and verify uploads
├── src/
│   ├── app/
│   │   ├── (main)/
│   │   │   ├── settings/api-keys/page.tsx # API Key and Document Upload UI
│   │   │   └── page.tsx                   # Main Chat/Image Generation UI
│   │   ├── api/
│   │   │   ├── auth/session/route.ts    # Client-side session check
│   │   │   ├── chat/                    # Chat backend (Claude, OpenAI)
│   │   │   │   ├── openai/route.ts
│   │   │   │   └── route.ts             # Claude route
│   │   │   ├── documents/upsert/route.ts# Document upload and embedding
│   │   │   ├── image/generate/route.ts  # DALL-E image generation
│   │   │   └── user-keys/route.ts       # API key saving
│   ├── lib/
│   │   ├── ai/                          # AI logic (OpenAI client, embedding utils)
│   │   │   ├── embeddingUtils.ts
│   │   │   └── openai.ts
│   │   ├── supabase/                    # Supabase client and auth helpers (ssr)
│   │   ├── vector/                      # Qdrant client, collection setup, querying
│   │   │   └── qdrantClient.ts
│   │   ├── textProcessing/              # Text chunking logic
│   │   │   └── chunking.ts
│   └── middleware.ts                    # Route protection
├── ... (other standard Next.js files and folders)
```

## Getting Started

### Prerequisites

*   [Node.js](https://nodejs.org/) (LTS version, e.g., v18 or v20)
*   [npm](https://www.npmjs.com/) (or yarn/pnpm)
*   A [Supabase](https://supabase.com/) project (for authentication and database)
*   A [Qdrant Cloud](https://qdrant.tech/cloud/) instance (or local Qdrant setup)
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

    # Qdrant
    QDRANT_URL=your_qdrant_instance_url # e.g., https://your-cluster-id.region.aws.cloud.qdrant.io:6333
    QDRANT_API_KEY=your_qdrant_api_key
    QDRANT_COLLECTION_NAME=lucient_documents # Or your preferred collection name

    # AI Providers
    OPENAI_API_KEY=your_openai_api_key
    ANTHROPIC_API_KEY=your_anthropic_api_key # (Stored by users, but good for testing admin features if any)

    # Encryption Key (must be 32 bytes for aes-256-gcm)
    ENCRYPTION_KEY=a_very_secure_32_byte_long_random_string # Generate a strong random key
    ```
    *   **Important**: `ENCRYPTION_KEY` must be a 32-character (256-bit) string for AES-256-GCM used in API key encryption.
    *   You can find Supabase URL and Anon Key in your Supabase project settings under "API".
    *   For Qdrant Cloud, get the URL and API key from your cluster details.

4.  **Ensure your Supabase project has Email Authentication enabled.**
    *   Go to your Supabase Dashboard -> Authentication -> Providers -> Email. Make sure it's enabled.
    *   (Recommended for development) Disable "Confirm email" under Authentication -> Providers -> Email, or ensure you have a way to click confirmation links.

5.  **Set up Qdrant Collection:**
    Run the setup script to ensure your Qdrant collection is created with the correct configuration:
    ```bash
    npx tsx ./scripts/setupQdrant.ts
    ```
    This script will:
    *   Connect to your Qdrant instance using the URL and API key from `.env.local`.
    *   Check if the collection (defined by `QDRANT_COLLECTION_NAME`) exists.
    *   If not, it creates the collection with a vector size of 1536 (for OpenAI `text-embedding-3-small`) and Cosine distance metric.
    *   It will also attempt to list a few sample points if the collection already exists or after creating it, which helps verify the setup.

### Running the Development Server

Execute the following command:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Verifying Document Uploads to Qdrant

After uploading documents through the application's UI, you can re-run the Qdrant setup script to see a sample of the newly ingested points:

```bash
npx tsx ./scripts/setupQdrant.ts
```
Look for the "Attempting to retrieve up to 5 sample points..." section in the output. This will show the IDs and payloads of some of the points in your collection, allowing you to confirm that your documents were chunked, embedded, and stored correctly.

## Key Modules and Files

*   **Authentication & Session**: `src/middleware.ts`, `src/lib/supabase/`, `/api/auth/session/route.ts`
*   **API Key Storage**: `/api/user-keys/route.ts`, `src/lib/encryption.ts`
*   **Chat Logic**: `src/app/page.tsx` (UI), `/api/chat/` (backend routes)
*   **Image Generation**: `src/app/page.tsx` (UI), `/api/image/generate/route.ts`
*   **RAG Pipeline**:
    *   Upload UI: `src/app/(main)/settings/api-keys/page.tsx`
    *   Upload API: `/api/documents/upsert/route.ts`
    *   Chunking: `src/lib/textProcessing/chunking.ts`
    *   Embeddings: `src/lib/ai/embeddingUtils.ts`
    *   Qdrant Client & Queries: `src/lib/vector/qdrantClient.ts`, `src/lib/vector/query.ts`
*   **Qdrant Management Script**: `scripts/setupQdrant.ts`

This README provides an overview of the `lucient` project's current state.
