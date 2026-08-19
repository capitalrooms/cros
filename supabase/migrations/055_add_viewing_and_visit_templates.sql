-- Add viewing and property visit notification templates

INSERT INTO public.notification_templates (name, category, template_text, created_at) VALUES
('Viewing Scheduled', 'lettings', 'Hi {{salutation}}, a viewing is scheduled for {{date}} at {{time}} for {{room_property}}. Viewer: {{visitor_name}}', NOW()),
('Contractor Visit', 'maintenance', 'Hi {{salutation}}, a {{contractor_type}} will visit on {{date}} at {{time}} to {{work_description}}. Contact: {{contractor_name}} ({{phone}})', NOW()),
('Gas Safety Inspection', 'compliance', 'Hi {{salutation}}, gas safety engineer booked for {{date}} {{time}}. Will inspect {{property_room}}. Please ensure access available.', NOW()),
('Electrical Safety Check', 'compliance', 'Hi {{salutation}}, electrical EICR inspection scheduled {{date}} {{time}}. Engineer: {{engineer_name}}. Duration approx 2 hours.', NOW()),
('Pest Control Treatment', 'maintenance', 'Hi {{salutation}}, pest control scheduled {{date}} {{time}} for {{property}}. Treatment: {{treatment_type}}. Please remove pet if applicable.', NOW()),
('Emergency Repair Visit', 'maintenance', 'Hi {{salutation}}, URGENT: {{repair_type}} repair visit today {{time}}. Contractor: {{contractor_name}}. Please be available.', NOW()),
('Move-Out Inspection', 'lettings', 'Hi {{salutation}}, move-out inspection for {{tenant_name}} booked {{date}} {{time}}. Inspector: {{inspector_name}}. Please ensure property ready.', NOW()),
('Preventative Maintenance', 'maintenance', 'Hi {{salutation}}, routine maintenance visit {{date}} {{time}} for {{property}}. Will check {{systems}}. Duration: {{estimated_time}}.', NOW()),
('Refurbishment Notice', 'maintenance', 'Hi {{salutation}}, refurbishment work starting {{date}} for {{location}}. Contractor: {{contractor_name}}. Expected completion: {{completion_date}}.', NOW()),
('Third-Party Service Visit', 'maintenance', 'Hi {{salutation}}, {{service_type}} provider visiting {{date}} {{time}} for {{task_description}}. They are authorized by {{your_name}}. Contact: {{provider_number}}.', NOW()),
('Communal Area Visit', 'maintenance', 'Hi {{salutation}}, I need to pop by the house to check on an issue we have noted in a communal area. Will try not to disturb you for too long. Just to confirm I will only be visiting the communal areas during this visit.', NOW())
ON CONFLICT (name) DO NOTHING;
