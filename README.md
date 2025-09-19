/*
README / .env.example (put these in a `.env` file in the project root)

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
1. Install dependencies (you already ran):
   pnpm i express passport passport-github2 express-session axios dotenv cors

2. Create .env with values above.
3. Run: node index.js
   (or use nodemon for development)
4. Visit http://localhost:3000 in browser.

NOTES
- This example includes a demo UI at `/` served from public/index.html.
- Tokens stored in session + demo cookie, insecure for production.
- Use Redis or DB-backed sessions in production.
*/# github-server
