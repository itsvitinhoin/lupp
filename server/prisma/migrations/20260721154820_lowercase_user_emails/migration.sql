-- Auth email lookups are case-insensitive; writes normalize to lowercase.
-- Bring legacy rows in line so the unique(email) constraint stays meaningful.
-- If two rows differ only in case this fails on the unique constraint on
-- purpose — resolve the duplicate manually instead of silently merging.
UPDATE users SET email = lower(email) WHERE email <> lower(email);
