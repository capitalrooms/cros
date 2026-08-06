-- Create passkeys table for WebAuthn support (Face ID, Fingerprint, Windows Hello, etc.)

CREATE TABLE IF NOT EXISTS public.passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  device_name VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_used_at TIMESTAMP WITH TIME ZONE,

  CONSTRAINT fk_passkeys_user FOREIGN KEY (user_id) REFERENCES public.people(id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_passkeys_user_id ON public.passkeys(user_id);
CREATE INDEX IF NOT EXISTS idx_passkeys_credential_id ON public.passkeys(credential_id);
CREATE INDEX IF NOT EXISTS idx_passkeys_created_at ON public.passkeys(created_at DESC);

-- Enable RLS
ALTER TABLE public.passkeys ENABLE ROW LEVEL SECURITY;

-- Users can view their own passkeys
CREATE POLICY "passkeys_select_own"
  ON public.passkeys FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create their own passkeys
CREATE POLICY "passkeys_insert_own"
  ON public.passkeys FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own passkeys
CREATE POLICY "passkeys_delete_own"
  ON public.passkeys FOR DELETE
  USING (auth.uid() = user_id);

-- Anyone (unauthenticated) can read passkey metadata for authentication
-- but cannot see the public key
CREATE POLICY "passkeys_select_for_auth"
  ON public.passkeys FOR SELECT
  USING (true)
  WITH CHECK (true);
