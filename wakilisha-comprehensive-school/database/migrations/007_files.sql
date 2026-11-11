CREATE TABLE IF NOT EXISTS uploaded_files(
 id UUID PRIMARY KEY,
 storage_key TEXT NOT NULL UNIQUE,
 filename TEXT NOT NULL,
 mime_type TEXT NOT NULL,
 byte_size INTEGER NOT NULL CHECK(byte_size BETWEEN 1 AND 10485760),
 kind TEXT NOT NULL CHECK(kind IN ('learning_material','assignment_submission')),
 uploaded_by BIGINT NOT NULL REFERENCES users(id),
 student_id BIGINT REFERENCES students(id),
 assignment_id BIGINT REFERENCES assignments(id),
 grade TEXT,
 stream TEXT,
 subject TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE submissions ADD COLUMN IF NOT EXISTS uploaded_file_id UUID REFERENCES uploaded_files(id);
CREATE INDEX IF NOT EXISTS idx_upload_user ON uploaded_files(uploaded_by,created_at);
CREATE INDEX IF NOT EXISTS idx_upload_assignment ON uploaded_files(assignment_id,student_id);
