-- Update the handle_new_user function to use first_name and last_name
-- This aligns the trigger with the actual 'profiles' table schema and the data
-- being sent from the /api/admin/approve endpoint.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, user_tier, message_credits, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    'free_tier',
    20,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 