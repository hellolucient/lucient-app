-- Update the handle_new_user function to be more resilient.
-- If the user's name is not found in the metadata during creation,
-- it now falls back to using the local-part of their email address
-- instead of failing the transaction.
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
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 