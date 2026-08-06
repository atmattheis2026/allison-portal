-- One-time reset for Allison's live project.
--
-- Her database so far only has test data (one throwaway transaction, no real
-- clients) built from an earlier, incomplete version of the schema. Dixon's
-- work (seller checklists, disclaimers, real first-run setup) needs to be
-- added, plus a fix for a policy bug found while testing. Rather than hand-
-- reconcile three divergent migration histories against a live database, this
-- drops just the app's own tables and policies (nothing Supabase itself
-- manages) so the full, correct migration set can run against a clean slate.

drop policy if exists media_public_read on storage.objects;
drop policy if exists media_team_write on storage.objects;
drop policy if exists media_team_update on storage.objects;
drop policy if exists media_team_delete on storage.objects;

drop table if exists transaction_assignees cascade;
drop table if exists contacts cascade;
drop table if exists doc_lines cascade;
drop table if exists milestones cascade;
drop table if exists transactions cascade;
drop table if exists contact_templates cascade;
drop table if exists doc_line_templates cascade;
drop table if exists milestone_templates cascade;
drop table if exists saved_lenders cascade;
drop table if exists team_members cascade;
drop table if exists profiles cascade;
drop table if exists brands cascade;
drop table if exists teams cascade;

drop trigger if exists on_auth_user_created on auth.users;
