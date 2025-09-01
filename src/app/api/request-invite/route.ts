import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

// Instantiate Resend - this is safe to do here as it only uses the key when a method is called
const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL_to = 'app.access@hellolucient.com';
const FROM_EMAIL = 'lucient <noreply@hellolucient.com>'; // Using your verified domain

export async function POST(request: NextRequest) {
  console.log('Request-invite API called');
  
  // Check for required environment variables
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL');
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }
  
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }
  
  if (!process.env.RESEND_API_KEY) {
    console.error('Missing RESEND_API_KEY');
    return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
  }
  
  // Initialize Supabase client inside the handler
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  try {
    const { firstName, lastName, email } = await request.json();

    // Basic validation
    if (!firstName || !lastName || !email) {
      return NextResponse.json({ error: 'All fields are required.' }, { status: 400 });
    }
    if (typeof email !== 'string' || !email.includes('@')) {
        return NextResponse.json({ error: 'A valid email is required.' }, { status: 400 });
    }

    const trimmedEmail = email.toLowerCase().trim();

    // Insert the new invite request into the database
    const { error: dbError } = await supabase
      .from('invite_requests')
      .insert({
        first_name: firstName,
        last_name: lastName,
        email: trimmedEmail,
        status: 'pending', // Default status
      });

    if (dbError) {
        // Handle potential unique constraint violation (duplicate email) gracefully
        if (dbError.code === '23505') {
            return NextResponse.json({ error: 'This email address has already been submitted.' }, { status: 409 });
        }
        console.error('Supabase error inserting invite request:', dbError);
        return NextResponse.json({ error: 'Could not submit your request at this time.' }, { status: 500 });
    }

    // --- Send Email Notifications ---
    try {
      // Promise.all allows us to send both emails concurrently
      await Promise.all([
        // Email 1: Send notification to the Admin
        resend.emails.send({
          from: FROM_EMAIL,
          to: ADMIN_EMAIL_to,
          subject: 'New Invite Request for lucient',
          html: `
            <h1>New Invite Request</h1>
            <p>A new user has requested access to lucient.</p>
            <ul>
              <li><strong>First Name:</strong> ${firstName}</li>
              <li><strong>Last Name:</strong> ${lastName}</li>
              <li><strong>Email:</strong> ${trimmedEmail}</li>
            </ul>
          `,
        }),
        // Email 2: Send confirmation to the User
        resend.emails.send({
          from: FROM_EMAIL,
          to: trimmedEmail, // Send to the user who signed up
          subject: 'Thanks for your interest in lucient!',
          html: `
            <h1>Request Received!</h1>
            <p>Hi ${firstName},</p>
            <p>Thank you for your interest in lucient. Demand is high, and we've added you to our waitlist.</p>
            <p>We'll let you in as soon as we can. Keep an eye on your inbox!</p>
            <br/>
            <p>The lucient Team</p>
          `,
        })
      ]);
    } catch (emailError) {
      // Log the email error but don't block the user response
      console.error('Resend error, failed to send notification email:', emailError);
    }
    // --- End Email Notifications ---

    return NextResponse.json({ message: 'Request submitted successfully!' }, { status: 201 });

  } catch (e) {
    console.error('Error processing invite request:', e);
    return NextResponse.json({ error: 'Invalid request format.' }, { status: 400 });
  }
}

// Add a global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
}); 