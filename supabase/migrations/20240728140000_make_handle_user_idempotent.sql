-- Update the handle_new_user function to be idempotent.
-- It now uses INSERT ... ON CONFLICT to prevent errors if a profile for the user
-- already exists. This can happen if a user is deleted from auth but not from profiles.
-- This makes the user creation process more resilient.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, user_tier, message_credits)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    'free_tier',
    20
  )
  ON CONFLICT (id) DO NOTHING; -- If a profile for this user ID already exists, do nothing.
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 