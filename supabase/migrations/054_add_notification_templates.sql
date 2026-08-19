-- Create notification templates table for Quick Notify feature
CREATE TABLE notification_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(50) NOT NULL, -- 'maintenance', 'inspection', 'tenancy', 'community', 'building', 'rent'
  template_text TEXT NOT NULL,
  subject_line VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seed with common templates
INSERT INTO notification_templates (name, category, template_text, subject_line) VALUES
('Maintenance Scheduled', 'maintenance', 'Maintenance is scheduled for {room_or_property} on {date}. {contractor_name} will be visiting between {time_range}. Please ensure access is available. Contact us if you have any questions.', 'Maintenance Scheduled'),
('Inspection Notice', 'inspection', 'An inspection of {room_or_property} is scheduled for {date} at {time}. This is a routine inspection to ensure everything is in good condition. Please ensure the space is accessible.', 'Property Inspection Scheduled'),
('Gas Safety Certificate Inspection', 'maintenance', 'Gas Safety Certificate inspection scheduled for {date}. This is a legal requirement. A qualified engineer will visit to inspect gas appliances. Please be available or ensure someone is home.', 'Gas Safety Inspection Required'),
('Boiler Service', 'maintenance', 'Your boiler service is scheduled for {date}. This routine maintenance typically takes {duration}. Please ensure access to the boiler location.', 'Boiler Service Scheduled'),
('Tenancy Renewal', 'tenancy', 'Your tenancy agreement is coming up for renewal on {end_date}. We would like to discuss the terms for renewal. Please contact us by {deadline} to discuss.', 'Tenancy Renewal Notice'),
('Rent Increase Notice', 'rent', 'Please note that rent will increase to £{new_rent} effective {date}. This increase is in line with market rates. Your updated tenancy agreement will be provided separately.', 'Rent Increase Notice'),
('Community Event', 'community', 'We are hosting a community event on {date} at {time} in {location}. All residents are welcome to attend. This is a great opportunity to meet neighbors and discuss property matters.', 'Community Event Invitation'),
('Building Works Notice', 'building', 'Building works will be taking place from {start_date} to {end_date}. You may experience some noise and disruption. We apologize for any inconvenience and appreciate your patience.', 'Building Works Notice'),
('Compliance Documentation', 'inspection', 'We are conducting a compliance check and need the following documentation: {docs_needed}. Please provide these by {deadline}.', 'Compliance Documentation Request'),
('Fire Safety Drill', 'building', 'A fire safety drill will take place on {date} at {time}. Please familiarize yourself with emergency exits. This is a routine safety exercise.', 'Fire Safety Drill Notice');

-- RLS Policies
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY notification_templates_admin_only ON notification_templates
  FOR ALL USING (
    (SELECT auth.jwt() ->> 'email') IN (
      SELECT email FROM people WHERE role = 'admin' OR role = 'administrator'
    )
  );

-- Indexes
CREATE INDEX idx_notification_templates_category ON notification_templates(category);
