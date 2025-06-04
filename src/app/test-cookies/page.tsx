import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic'; // Ensure it's dynamic

export default async function TestCookiesPage() {
  console.log('Rendering TestCookiesPage');
  const cookieStore = cookies(); // Line 6

  // In VS Code, hover over `cookieStore` right after this line. What type does it show?
  console.log('Type of cookieStore:', typeof cookieStore, cookieStore);

  let specificCookieValue = null;
  try {
    // @ts-expect-error // Add this line temporarily if TS complains to see runtime behavior
    specificCookieValue = cookieStore.get('sb-eeydnnzsleszdycuesqv-auth-token')?.value;
  } catch (e) {
    console.error('Error accessing cookieStore.get in test page:', e);
  }

  console.log('Specific cookie value:', specificCookieValue);

  return (
    <div>
      <h1>Test Cookies Page</h1>
      <p>Check server console and browser console if any part of this renders client-side.</p>
      <p>Auth token from cookie: {specificCookieValue || 'Not found or error'}</p>
    </div>
  );
}