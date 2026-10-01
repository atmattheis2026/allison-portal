-- A logo per person for the top-left of the side menu (Allison, 2026-10-01):
-- The Mattheis Team for her, The Surek Group for Rich, whatever Ryan makes
-- for him. Each person sees their own when they sign in. Uploaded in
-- Settings › Team (stored in the existing media bucket, like headshots).
-- Allison's and Rich's fall back to logos bundled with the app when empty.

alter table team_members add column if not exists brand_logo_url text;
