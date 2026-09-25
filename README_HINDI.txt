K.G.N. Fashion Zone — V12.1 Inventory Login Fix

Why the old page failed:
cloud-config.js was defer-loaded, but the inline JavaScript read its global BEFORE it had run. Therefore the old page incorrectly displayed 'Setup required' even with a valid configuration.

Mobile deploy:
1. DO NOT change your working cloud-config.js, admin.html or customer index.html.
2. Upload the enclosed inventory.html into your existing GitHub repo root, replacing only inventory.html; commit changes.
3. Open your usual GitHub Pages inventory.html with ?v=12-1 appended, ideally in a new Incognito tab.
4. Sign in using the existing Supabase owner login. If the message says Supabase library unavailable, check internet/CDN; if it says Cloud settings format, inspect URL and publishable key without sharing passwords or secret keys.
5. Do not run inventory lockdown SQL until inventory update tests are successful.

Do not upload this README to the public website; only inventory.html is required.
Static code checks and mocked-browser loading checks are not a substitute for a live test on your Supabase project.
