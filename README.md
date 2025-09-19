<video src="video.webm" autoplay controls width="600">
</video>

README 
 .env.example

To get started, put these in a `.env` file in the project root:

GITHUB_Client_ID=your_github_oauth_app_client_id
GITHUB_Client_SECRET=your_github_oauth_app_client_secret
CALL_BACK_URL=http://localhost:3000/auth/github/callback
HOME_PAGE=http://localhost:3000
PORT=3000
APP_NAME=MyGithubApp
SESSION_SECRET=a_long_random_secret
ALLOWED_USERS=alice,bob,carol   # comma-separated GitHub usernames allowed to login
NODE_ENV=development

USAGE

1. Install dependencies (if you haven't already):
   pnpm i express passport passport-github2 express-session axios dotenv cors

2. Create a `.env` file with the values above.
3. Run: node index.js
   (or use nodemon for development)
4. Visit http://localhost:3000 in your browser.

NOTES
- This example includes a demo UI at `/` served from public/index.html.
- Tokens are stored in session and a demo cookie; this is insecure for production.
- Use Redis or DB-backed sessions in production.

---

## Frontend Demo

A demo UI is available at `/` (served from `public/index.html`).

To add a video demo to the front page, place a file named `video.webm` in the `public/` directory.  
The UI will auto play this video at the top of the page if it exists.

Example HTML snippet to add to your front page:
