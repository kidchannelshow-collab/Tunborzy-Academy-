# Announcement fixes applied

1. Fixed the Admin Announcement Manager Delete button. It now calls Supabase delete, checks the returned error, updates the UI only after successful deletion, and shows a success/error toast.
2. Added an Announcement Manager bell to the Admin dashboard header. Tapping it routes to the app's existing `announcements` view.
3. Added an Announcement Manager item to the Admin sidebar.
4. Kept the existing floating bell routing to the Announcement Center and added a real-time unread notification count/red badge.
5. Added the same unread notification badge to the Admin header bell.
6. Made the Admin Announcement Manager load all announcements for admins instead of filtering them by the admin's role.
7. Wired the Admin announcement create form fields (title/category/target/content) to state and added proper Supabase error handling.
8. Fixed the Admin create flow's `Everyone` target to use `All` and refresh the announcement list after a successful insert.

Important: the Delete button's original problem was frontend-side: the Admin Announcement Center rendered the Trash button but had no `onClick` handler at all. The database delete could therefore never be called from that button.
