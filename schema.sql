CREATE TABLE user_credentials (
  access_email TEXT PRIMARY KEY,
  legacy_username TEXT NOT NULL,
  legacy_password TEXT NOT NULL
);
