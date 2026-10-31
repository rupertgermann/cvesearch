# 3. Consolidate alerts, watchlist and saved views into the dashboard; remove notifications

Date: 2026-10-31
Status: Accepted

## Context

The app had four top-level pages for one person's day-to-day tracking: Dashboard, Watchlist, Alerts and Notifications. The dashboard held two panels that were the same thing, saved views and alert rules: both stored a search, alert rules also counted unread matches. Notifications scheduled per-team digests to email, in-app, Slack or webhook destinations. Email and in-app were only recorded, never sent. The app is used by one person on their own machine, so team digests had no reader.

## Decision

- Saved views and alert rules become one concept, the saved search, stored as an alert rule. A saved search links back to its search and shows its unread matches.
- The alerts page and the watchlist page become sections of the dashboard. Their old URLs redirect there.
- Notifications are deleted outright: the page, the API, the store, digest building and the scheduler's digest step. No feature flag. Git history is the way back.

## Consequences

- On database open, rows in `user_saved_views` are copied into `user_alert_rules` and the table is dropped, in one transaction. This is a one-way step; the copied rows keep their ids, names, searches and creation dates.
- Workspace export no longer contains `savedViews`. Import still accepts older files that do and imports them as saved searches.
- The `user_notification_preferences` and `user_notification_deliveries` tables are no longer created, read or written. Databases that already have them keep them and their data.
- New repo findings still show on the Repos page. `user_repo_notifications.digested_at` is no longer set.
- The header shows one badge on Dashboard: unread saved-search matches first, then the investigating count, then the watchlist size.
