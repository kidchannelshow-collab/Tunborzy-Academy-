# Announcement Manager Debug Fixes

Fixed in `src/components/AnnouncementCenter.tsx`:

- Removed hard-coded/mock dashboard statistics (142, 45.2K, 78%, 3).
- Total Announcements and Scheduled now come from the loaded announcement data.
- Views/read-rate show `—` when the database does not provide those metrics instead of fake values.
- Search now filters the actual announcement list.
- Filter button now works for status and priority.
- Edit button now opens the existing announcement in the form and updates Supabase.
- Duplicate button now creates a real database copy.
- Pin button now updates `is_pinned` in Supabase.
- Delete button calls Supabase delete and only removes the row from the UI after success.
- Create/Edit modal resets correctly when closed.
- Added realtime refresh for `announcements` changes.
- Existing authentication, Supabase client, CBT, dashboards, and other application areas were not intentionally changed.

Note: a full TypeScript build could not be run in this environment because the project dependencies were not locally cached; no database schema/SQL migration was changed in this pass.
