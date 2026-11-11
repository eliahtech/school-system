-- Verified, additive operational models. Re-run-safe for clean/new databases.
ALTER TABLE students ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS gender TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS stream TEXT NOT NULL DEFAULT 'A';
ALTER TABLE students ADD COLUMN IF NOT EXISTS profile_image_url TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE applications ADD COLUMN IF NOT EXISTS academic_year INTEGER;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS reporting_date DATE;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS reporting_time TIME;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS admin_note TEXT;
ALTER TABLE applications ADD COLUMN IF NOT EXISTS reviewed_by BIGINT REFERENCES users(id);
ALTER TABLE applications ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
ALTER TABLE guardians ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS recorded_by BIGINT REFERENCES users(id);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS approved_by BIGINT REFERENCES users(id);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS marked_by BIGINT REFERENCES users(id);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS marked_at TIMESTAMPTZ;
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE learning_materials ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE learning_materials ADD COLUMN IF NOT EXISTS stream TEXT NOT NULL DEFAULT 'A';
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS subject TEXT;
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS stream TEXT NOT NULL DEFAULT 'A';
ALTER TABLE assignments ADD COLUMN IF NOT EXISTS published BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE report_versions ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE report_versions ADD COLUMN IF NOT EXISTS report_type TEXT NOT NULL DEFAULT 'term';
ALTER TABLE report_versions ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_immutable_version ON report_versions(student_id,year,term,version) WHERE term IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_report_annual_version ON report_versions(student_id,year,version) WHERE term IS NULL;
CREATE TABLE IF NOT EXISTS assessment_schemes(
 id BIGSERIAL PRIMARY KEY,year INTEGER NOT NULL,grade TEXT NOT NULL,subject TEXT NOT NULL,
 mode TEXT NOT NULL CHECK(mode IN ('numerical','rubric')),
 cat_max NUMERIC(6,2) NOT NULL DEFAULT 30 CHECK(cat_max>=0),
 exam_max NUMERIC(6,2) NOT NULL DEFAULT 70 CHECK(exam_max>=0),
 threshold_scheme TEXT, created_by BIGINT REFERENCES users(id),
 UNIQUE(year,grade,subject)
);
CREATE TABLE IF NOT EXISTS school_roles(
 id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS user_role_memberships(
 user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 role_id BIGINT NOT NULL REFERENCES school_roles(id),PRIMARY KEY(user_id,role_id)
);
INSERT INTO school_roles(name) VALUES ('super_admin'),('admin'),('headteacher'),('bursar'),('teacher'),('parent'),('student') ON CONFLICT DO NOTHING;
INSERT INTO user_role_memberships(user_id,role_id)
 SELECT u.id,r.id FROM users u JOIN school_roles r ON r.name=u.role ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS account_invitations(
 id BIGSERIAL PRIMARY KEY,user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 token_hash TEXT NOT NULL UNIQUE,expires_at TIMESTAMPTZ NOT NULL,
 accepted_at TIMESTAMPTZ,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS student_status_changes(
 id BIGSERIAL PRIMARY KEY,student_id BIGINT NOT NULL REFERENCES students(id),
 previous_status TEXT NOT NULL,new_status TEXT NOT NULL,reason TEXT,
 changed_by BIGINT NOT NULL REFERENCES users(id),changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gallery_consents(
 id BIGSERIAL PRIMARY KEY,student_id BIGINT NOT NULL REFERENCES students(id),
 guardian_id BIGINT NOT NULL REFERENCES guardians(id),consented BOOLEAN NOT NULL DEFAULT false,
 scope TEXT NOT NULL DEFAULT 'public_gallery',recorded_by BIGINT REFERENCES users(id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),UNIQUE(student_id,guardian_id,scope)
);
CREATE TABLE IF NOT EXISTS school_announcements_read(
 announcement_id BIGINT NOT NULL REFERENCES school_announcements(id),
 user_id BIGINT NOT NULL REFERENCES users(id),read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY(announcement_id,user_id)
);
CREATE TABLE IF NOT EXISTS email_outbox_attempts(
 id BIGSERIAL PRIMARY KEY,outbox_id BIGINT NOT NULL REFERENCES email_outbox(id),
 outcome TEXT NOT NULL,reason TEXT,created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ;
ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS last_error TEXT;
CREATE INDEX IF NOT EXISTS idx_outbox_delivery ON email_outbox(status,next_attempt_at,id);
CREATE INDEX IF NOT EXISTS idx_students_user ON students(user_id);
CREATE INDEX IF NOT EXISTS idx_submission_student ON submissions(student_id,assignment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_year ON assessments(student_id,academic_year,term);
CREATE INDEX IF NOT EXISTS idx_assessment_teacher ON assessments(recorded_by,academic_year);
CREATE INDEX IF NOT EXISTS idx_charge_student ON fee_charges(student_id,academic_year,term);
CREATE INDEX IF NOT EXISTS idx_payment_student ON payments(student_id,created_at);
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS active_role TEXT;
CREATE OR REPLACE FUNCTION wakilisha_assign_primary_role() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO user_role_memberships(user_id,role_id) SELECT NEW.id,id FROM school_roles WHERE name=NEW.role ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS wakilisha_primary_role_insert ON users;
CREATE TRIGGER wakilisha_primary_role_insert AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION wakilisha_assign_primary_role();
ALTER TABLE content ADD COLUMN IF NOT EXISTS consent_verified BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE content ADD COLUMN IF NOT EXISTS approved_by BIGINT REFERENCES users(id);
ALTER TABLE content ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE TABLE IF NOT EXISTS public_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_by BIGINT REFERENCES users(id),updated_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS staff_public_profiles(
 id BIGSERIAL PRIMARY KEY,staff_id BIGINT NOT NULL UNIQUE REFERENCES staff(id),
 biography TEXT NOT NULL DEFAULT '',photo_url TEXT,
 published BOOLEAN NOT NULL DEFAULT false,approved_by BIGINT REFERENCES users(id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE email_outbox ADD COLUMN IF NOT EXISTS processing_started_at TIMESTAMPTZ;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS qualification TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS tsc_number TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS employment_type TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS photo_url TEXT;
