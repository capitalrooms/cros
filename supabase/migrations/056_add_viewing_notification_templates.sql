-- Add viewing-specific notification templates for lettings management

INSERT INTO public.notification_templates (name, category, template_text, created_at) VALUES
('Viewing Notification - Whole House', 'lettings', 'Hi All, we have a viewing scheduled for {{room_name}} on {{date}} at {{time}}. We will try to keep disruption to the communal areas minimal during this period.', NOW()),
('Running Late - Select Viewing', 'lettings', 'Hi All, I am running late for the viewing at {{room_name}}. I will now be arriving at {{new_time}}. Thank you for your patience.', NOW()),
('Viewing Period Notice', 'lettings', 'Hi All, during {{time_period}} I will be holding viewings in {{room_name}}. I will try not to disturb you in the communal spaces for too long during this period. Thank you for your understanding.', NOW()),
('Viewing Rescheduled - Time Shift', 'lettings', 'Hi All, due to scheduling changes, the viewing for {{room_name}} has been moved from {{original_time}} to {{new_time}} on {{date}}. Apologies for any inconvenience.', NOW()),
('Multiple Viewings - Time Frame', 'lettings', 'Hi All, we have multiple viewings scheduled between {{start_time}} and {{end_time}} on {{date}}. We appreciate your patience during this time.', NOW()),
('Viewing Confirmation - Tenant', 'lettings', 'Hi {{tenant_name}}, please confirm that a viewing for your room ({{room_name}}) is convenient on {{date}} at {{time}}. Please reply to confirm or suggest an alternative time.', NOW())
ON CONFLICT (name) DO NOTHING;
