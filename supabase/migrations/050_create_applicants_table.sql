-- Create applicants table for onboarding flow
CREATE TABLE applicants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  -- Personal info
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  date_of_birth DATE,

  -- Current situation
  current_address TEXT,
  profession VARCHAR(255),
  salary VARCHAR(50),
  linkedin_url TEXT,

  -- Rental preferences
  preferred_start_date DATE,
  preferred_term VARCHAR(50), -- e.g., "6 months", "12 months"

  -- Character & interests
  bio TEXT, -- Short bio: "Who are you in 2-3 sentences"
  interests TEXT, -- Comma-separated or JSON: hobbies, interests
  sociability VARCHAR(50), -- e.g., "sociable", "keep-to-self", "flexible"

  -- Rental history
  previous_addresses JSONB, -- Array of {address, moved_in, moved_out, reason_left}

  -- Application status
  status VARCHAR(50) DEFAULT 'submitted', -- submitted, approved, rejected, awaiting_review
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by UUID REFERENCES people(id),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_applicants_room_id ON applicants(room_id);
CREATE INDEX idx_applicants_property_id ON applicants(property_id);
CREATE INDEX idx_applicants_email ON applicants(email);
CREATE INDEX idx_applicants_status ON applicants(status);
