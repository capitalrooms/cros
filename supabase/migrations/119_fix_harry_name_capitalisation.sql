-- Fix capitalisation of admin name: harry → Harry
-- Targets harry@capitalrooms.co.uk specifically

UPDATE public.people
SET
  first_name = 'Harry',
  last_name  = CASE WHEN lower(last_name) = last_name THEN initcap(last_name) ELSE last_name END
WHERE email = 'harry@capitalrooms.co.uk'
  AND (first_name = 'harry' OR first_name IS NULL OR first_name = '');
