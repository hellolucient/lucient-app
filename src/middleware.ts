import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
// import { isUserAdmin } from './lib/supabase/auth'; // Can't be used directly in middleware due to edge runtime limitations

export async function middleware(request: NextRequest) {
  // Create a response object that we can modify
  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // Create a Supabase client that can read/write cookies from the request/response
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        // Correct: Set cookies on the outgoing response
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value,
            ...options,
          });
        },
        // Correct: Remove cookies on the outgoing response
        remove(name: string, options: CookieOptions) {
          response.cookies.set({
            name,
            value: '',
            ...options,
          });
        },
      },
    }
  );

  // This will now correctly refresh the session and set the cookie on the response
  const { data: { user } } = await supabase.auth.getUser();
  
  const { pathname } = request.nextUrl;
  const protectedRoutes = ['/dashboard', '/admin', '/tools', '/agents'];
  const isAdminRoute = pathname.startsWith('/admin');

  // If the user is not authenticated and trying to access a protected route
  if (!user && protectedRoutes.some(route => pathname.startsWith(route))) {
    // Redirect to login page, preserving the intended destination for after login
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect_to', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If the user is authenticated and trying to access an admin route
  // Basic role check placeholder: In a real app, this logic would be more robust.
  // The isUserAdmin() function from lib/supabase/auth.ts cannot be directly used here
  // as it might rely on browser-specific APIs or other non-edge compatible code.
  // You would typically check a custom claim in the JWT or make a lightweight API call.
  if (user && isAdminRoute) {
    // Placeholder: For now, let's assume if the user is logged in, they can access /admin.
    // Replace this with actual role checking logic.
    // For example, if you store roles in user_metadata or have custom claims:
    // const userRoles = user.user_metadata?.roles || [];
    // if (!userRoles.includes('admin')) {
    //   return NextResponse.redirect(new URL('/unauthorized', request.url)); // or to /dashboard
    // }
    console.log("User is attempting to access admin route. Role check placeholder.");
  }
  
  // If trying to access /login while already logged in, redirect to dashboard
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Return the response, which now has the updated auth cookies
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - login (login page itself)
     * - / (root page, assuming it's public or handles its own redirect)
     */
    // '/((?!api|_next/static|_next/image|favicon.ico|login).*)',
    // More targeted matcher for protected areas:
    '/dashboard/:path*',
    '/admin/:path*',
    '/tools/:path*',
    '/agents/:path*',
    '/login', // Also match /login to redirect if already authenticated
  ],
}; 