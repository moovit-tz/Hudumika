-- Migration 075: remove the Contracts feature (table had zero rows — never used
-- in production; feature was removed at the user's request).
DROP TABLE IF EXISTS contracts;
