-- Username accounts. A user "claims" their anonymous cookie UUID: the users
-- row adopts that UUID as its id, so all existing experiences/wishlist/badge
-- rows attach with zero data migration. Logging in elsewhere just sets the
-- cookie to this id.
CREATE TABLE users (
  id            UUID PRIMARY KEY,
  username      TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_username_lower_idx ON users (lower(username));
