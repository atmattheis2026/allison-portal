-- Lets a personal-details line carry an actual date (birthdays,
-- anniversaries) alongside its text, picked from a calendar input rather
-- than typed. Optional — plenty of personal-detail lines have no date at all.
alter table lead_personal_notes add column if not exists date_value date;
