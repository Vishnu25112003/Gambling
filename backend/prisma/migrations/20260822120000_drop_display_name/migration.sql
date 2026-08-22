-- `username` is now the single name field shown everywhere; `displayName` is
-- superseded by it (see doc 11 update: one editable name, unique, URL-safe).
ALTER TABLE "users" DROP COLUMN "displayName";
