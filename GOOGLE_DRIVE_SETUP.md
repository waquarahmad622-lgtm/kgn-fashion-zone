# K.G.N. Fashion Zone — customer Google Drive backup

## Implemented

Customer controls are under More → My details and backup after retailer login, in Hindi, English and Urdu. Optional Google authorization uses the GIS popup code flow and only `https://www.googleapis.com/auth/drive.appdata`. It stores a separate backup file for each retailer account. Google refresh tokens stay encrypted in the private database; client secrets and refresh tokens never go into the website, local customer backup, or receipt.

After connecting, delivery details are remembered on this phone and changes are debounced for five seconds. Automatic backup is opt-in per phone and only runs while the app is open and online. Pending changes persist on the phone; transient errors retry with backoff up to five minutes and on reopening / reconnection. A new phone does not silently overwrite a remote backup on login. Customers can restore explicitly, pause automatic backup, back up now, disconnect, and see the last successful backup time.

Only name, mobile, address, city, PIN code and up to 100 saved receipt copies are included. Receipts are saved when their order/tracking data is viewed; this is not a server-wide database backup. The private app-data folder is not shown among ordinary Drive files. Restore through this app. Disconnecting removes the server's authorization and attempts Google revocation; it does not delete existing Drive copies.

## Owner activation still required

No customer Drive connection exists as of the implementation check. Google Cloud Console was inaccessible from the cloud browser. Do not claim a successful real Google backup until the following is configured and tested.

1. Use the owner's Google Cloud project for K.G.N. Fashion Zone. Enable **Google Drive API**.
2. Configure **Google Auth Platform** branding/audience. Use the business support email. Provide these existing public pages:
   - Home: `https://waquarahmad622-lgtm.github.io/kgn-fashion-zone/index.html`
   - Privacy: `https://waquarahmad622-lgtm.github.io/kgn-fashion-zone/privacy-policy.html`
   - Account deletion: `https://waquarahmad622-lgtm.github.io/kgn-fashion-zone/account-deletion.html`
3. Audience: **External**. In Testing, explicitly add the owner's test Google account. Request only the non-sensitive `drive.appdata` scope. Do not request full Drive access. Follow any Google domain/branding verification prompts; do not publish using an unverified or unrelated domain. Move to production before general customers use the feature. Google's External/Testing refresh tokens normally expire after seven days for this scope.
4. Create an OAuth client of type **Web application** (the current Android app hosts the website as a TWA).
   - Authorized JavaScript origin: `https://waquarahmad622-lgtm.github.io`
   - This is a GIS popup flow; token exchange uses that exact origin as `redirect_uri`.
   - Do not put `/kgn-fashion-zone`, a trailing slash, or the Supabase project URL into the JavaScript origin field.
5. In Supabase project **Kgn Fashion Zone** (`vmvyubzpuncasirgjptn`) → Edge Functions → Secrets, save:
   - `KGN_GOOGLE_CLIENT_ID`: Web application client ID.
   - `KGN_GOOGLE_CLIENT_SECRET`: matching client secret; server only.
   - `KGN_BACKUP_ENCRYPTION_KEY`: a securely generated random 32-byte key encoded as base64. An administrator can generate one locally using `openssl rand -base64 32`. Save through the private Secrets form, never in the repository or customer JS. Do not change an existing key after customers connect; doing so makes existing encrypted connections unreadable.
   - `KGN_SITE_ORIGIN`: `https://waquarahmad622-lgtm.github.io` (this is also the code's default).
6. The `kgn-backup` Edge Function and private connection table already exist. Keep custom JWT validation, exact Origin, X-Requested-With and retailer ownership checks. Never make the connection table public. Google credentials are unrelated to Razorpay secrets; leave those intact.

## Activation test on an Android phone

1. Log into an approved customer account. Open More → My details and backup → Check Drive status again.
2. Connect Google Drive. If Google is initially loading, tap Connect once it says ready. The customer selects their Google account and consents. Declining must leave normal shopping working.
3. Edit a saved delivery detail, keep the app open and online, and confirm the successful backup time changes.
4. Change another detail while offline, then reconnect with the app open. Confirm retry succeeds.
5. Pause automatic backup and verify further edits do not upload. Use Back up now explicitly if desired.
6. On another phone, log into the same retailer account, choose Restore from Drive and confirm. Review the restored address before ordering. Restore must reject another retailer's backup.
7. Disconnect and verify automatic backup stops. Reconnect through Google if permission expired or was revoked.
8. Update Play Console Data safety to reflect optional sharing of contact/address and purchase history with Google for customer-owned backup. This feature's real Google authorization and backup/restore round-trip have not yet been verified.

## Official references

- https://developers.google.com/identity/oauth2/web/guides/use-code-model
- https://developers.google.com/workspace/drive/api/guides/appdata
- https://developers.google.com/identity/protocols/oauth2
- https://supabase.com/docs/guides/functions/secrets
