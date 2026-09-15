-- Add student-specific fields to applicants table
ALTER TABLE applicants
  ADD COLUMN IF NOT EXISTS is_student BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS university VARCHAR(255),
  ADD COLUMN IF NOT EXISTS course_studied VARCHAR(255),
  ADD COLUMN IF NOT EXISTS study_year VARCHAR(50),
  ADD COLUMN IF NOT EXISTS guarantor_confirmed BOOLEAN DEFAULT FALSE;
