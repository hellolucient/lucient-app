# lucient - Your Intelligent Assistant

`lucient` is a Next.js 14/15 application designed to be an intelligent assistant, leveraging modern AI and web technologies. It provides a platform for various AI-powered tools, a chat interface, and an administrative backend for management.

## Core Technologies

*   **Framework**: [Next.js](https://nextjs.org/) (v14/15 with App Router)
*   **Language**: [TypeScript](https://www.typescriptlang.org/)
*   **Styling**: [Tailwind CSS](https://tailwindcss.com/) with [Shadcn/UI](https://ui.shadcn.com/) component library
*   **Authentication**: [Supabase Auth](https://supabase.com/docs/guides/auth)
*   **Vector Database**: [Qdrant](https://qdrant.tech/) (for similarity search, RAG)
*   **AI Integrations**: (Planned) OpenAI, LlamaIndex, potentially Google Gemini

## Features

### Current (Placeholders & Basic Setup)

*   **User Authentication**: Sign-up, Login, Logout functionality using Supabase.
*   **Protected Routes**: Middleware protects dashboard, tools, assistant, and admin areas.
*   **Basic UI Structure**:
    *   Main Layout with Navbar and Theme Provider (dark/light mode support).
    *   Landing Page (`/`)
    *   Login Page (`/login`)
    *   Dashboard Page (`/dashboard`)
    *   AI Tools Page (`/tools`)
    *   Chat Assistant Page (`/assistant`)
    *   Admin Panel Page (`/admin`)
*   **Component Library**: Shadcn/UI components integrated (`Button`, `Input`, `Label`, etc.).
*   **Vector DB Placeholders**: Modules for Qdrant client setup, embedding, upserting, and querying.
*   **AI Library Placeholders**: Modules for OpenAI API interactions and embedding utilities.

### Planned

*   Fully functional AI tools (e.g., summarization, Q&A based on documents).
*   Interactive chat assistant interface.
*   Admin panel for file uploads (for RAG), content management, and user oversight.
*   Robust LlamaIndex integration for document processing and indexing into Qdrant.
*   Detailed user profiles and role management (e.g., admin roles).

## Project Structure

```
/lucient
├── .env.local          # Local environment variables (Supabase keys, Qdrant URL, etc.) - IMPORTANT!
├── components.json     # Shadcn/UI configuration
├── next.config.js      # Next.js configuration
├── package.json        # Project dependencies and scripts
├── postcss.config.js   # PostCSS configuration
├── public/             # Static assets (images, fonts not handled by next/font)
├── src/
│   ├── app/            # Next.js App Router: pages, layouts, route handlers
│   │   ├── (main)/       # Main application routes
│   │   │   ├── admin/
│   │   │   ├── assistant/
│   │   │   ├── dashboard/
│   │   │   ├── tools/
│   │   │   └── page.tsx  # Root page (landing)
│   │   ├── login/
│   │   │   └── page.tsx  # Login page
│   │   ├── globals.css # Global styles and Tailwind directives
│   │   └── layout.tsx  # Root layout
│   ├── components/
│   │   ├── shared/     # Custom reusable components (Navbar, UserAuthButton)
│   │   └── ui/         # Shadcn/UI components (Button, Input, etc.)
│   ├── lib/
│   │   ├── ai/         # AI related logic (OpenAI, Gemini, embedding utils)
│   │   ├── supabase/   # Supabase client and auth helpers
│   │   ├── vector/     # Qdrant client, embed/upsert, query logic
│   │   └── utils.ts    # Shadcn/UI utility (cn function)
│   ├── utils/          # General utility functions (e.g., promptLibrary.ts)
│   └── middleware.ts   # Next.js middleware for route protection
├── tailwind.config.js  # Tailwind CSS configuration
└── tsconfig.json       # TypeScript configuration
```

## Getting Started

### Prerequisites

*   [Node.js](https://nodejs.org/) (LTS version recommended)
*   [npm](https://www.npmjs.com/) (or yarn/pnpm)
*   A Supabase project (for authentication)
*   A Qdrant instance (for vector database)
*   (Optional) OpenAI API Key if using OpenAI models

### Setup

1.  **Clone the repository (if applicable) or ensure you are in the project directory.**

2.  **Install dependencies:**
    ```bash
    npm install
    ```

3.  **Set up Environment Variables:**
    Create a `.env.local` file in the project root by copying `.env.example` (if one was provided, otherwise create it manually). Populate it with your actual credentials:
    ```env
    NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
    NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_project_anon_key

    # Qdrant (ensure these are set if Qdrant client requires them)
    QDRANT_URL=your_qdrant_instance_url
    QDRANT_API_KEY=your_qdrant_api_key # If your Qdrant instance uses API key auth
    QDRANT_COLLECTION_NAME=lucient_documents # Or your preferred collection name

    # OpenAI (if you plan to use OpenAI directly)
    OPENAI_API_KEY=your_openai_api_key

    # Gemini (Optional)
    # GEMINI_API_KEY=your_gemini_api_key
    ```
    *   You can find Supabase URL and Anon Key in your Supabase project settings under "API".
    *   Ensure your Qdrant instance is accessible and configure its URL.

4.  **Ensure your Supabase project has Email Authentication enabled.**
    *   Go to your Supabase Dashboard -> Authentication -> Providers -> Email. Make sure it's enabled.
    *   (Recommended for development) Disable "Confirm email" under Authentication -> Providers -> Email, or ensure you have a way to click confirmation links.

### Running the Development Server

Execute the following command:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) (or the port specified in the terminal if 3000 is busy) with your browser to see the application.

## Key Configuration Files

*   `src/middleware.ts`: Handles route protection.
*   `src/lib/supabase/client.ts` & `src/lib/supabase/auth.ts`: Supabase setup and authentication logic.
*   `src/lib/vector/qdrantClient.ts`: Qdrant client setup.
*   `tailwind.config.js`: Tailwind CSS customization.
*   `components.json`: Shadcn/UI component settings.

## Further Development

*   Implement detailed logic for AI tools, chat, and admin functionalities.
*   Refine UI/UX across the application.
*   Set up robust error handling and logging.
*   Write tests.

This README provides a snapshot of the `lucient` project. It will be updated as development progresses.
