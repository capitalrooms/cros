-- Create offers table to track sent applications
CREATE TABLE offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

  -- Applicant info
  applicant_email VARCHAR(255) NOT NULL,
  applicant_name VARCHAR(255),

  -- Offer details
  advertised_rent DECIMAL(10,2) NOT NULL,
  move_in_date DATE,

  -- Tracking
  sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent_by UUID REFERENCES people(id),
  status VARCHAR(50) DEFAULT 'sent', -- sent, application_started, application_submitted, accepted, rejected

  -- Link for applicant
  application_token VARCHAR(255) UNIQUE,
  token_expires_at TIMESTAMP WITH TIME ZONE,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_offers_room_id ON offers(room_id);
CREATE INDEX idx_offers_property_id ON offers(property_id);
CREATE INDEX idx_offers_email ON offers(applicant_email);
CREATE INDEX idx_offers_token ON offers(application_token);
CREATE INDEX idx_offers_status ON offers(status);
