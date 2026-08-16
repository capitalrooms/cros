-- Store extracted documents awaiting property approval + filing
CREATE TABLE IF NOT EXISTS documents_pending (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source (upload vs email)
  source VARCHAR(50) NOT NULL, -- 'upload' or 'email'
  source_email VARCHAR(255), -- if from email, the envelope-from

  -- Classification & extraction confidence
  document_type VARCHAR(50) NOT NULL, -- statement, hmo_licence, gas_safety_cert, etc.
  confidence NUMERIC(3, 2), -- 0.00 to 1.00
  summary TEXT,

  -- Extracted data (stored as JSONB to accommodate all doc types)
  extracted_data JSONB NOT NULL,

  -- Property matching (user must approve or manually select)
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  property_address_extracted VARCHAR(500), -- From the doc
  property_matched_by UUID REFERENCES people(id), -- Admin who approved
  property_matched_at TIMESTAMP WITH TIME ZONE,

  -- Filing status
  status VARCHAR(50) NOT NULL DEFAULT 'pending_review', -- pending_review, property_matched, filed, rejected
  filed_at TIMESTAMP WITH TIME ZONE,
  filed_to_tables TEXT[], -- Which tables got updated (e.g. ['properties', 'appliances'])

  -- Audit
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES people(id),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES people(id),

  -- Admin notes on why it was rejected or needs correction
  admin_notes TEXT
);

-- Quick lookup by status
CREATE INDEX idx_documents_pending_status ON documents_pending(status);
CREATE INDEX idx_documents_pending_property ON documents_pending(property_id);
CREATE INDEX idx_documents_pending_created ON documents_pending(created_at DESC);
