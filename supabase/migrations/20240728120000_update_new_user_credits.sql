-- Update the handle_new_user function to grant 20 message credits instead of 10.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, user_tier, message_credits)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'name',
    'free_tier',
    20 -- Default credits for new users, updated to 20
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Note: The trigger itself does not need to be recreated if it already exists.
-- This script only replaces the function body.
-- If the trigger `on_auth_user_created` does not exist for some reason, you can create it with:
/*
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
*/ 