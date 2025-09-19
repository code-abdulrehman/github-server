require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GitHubStrategy = require('passport-github2').Strategy;
const axios = require('axios');
const cors = require('cors');
const crypto = require('crypto');
const path = require('path');

const {
  GITHUB_Client_ID,
  GITHUB_Client_SECRET,
  CALL_BACK_URL,
  HOME_PAGE,
  PORT = 3000,
  SESSION_SECRET = crypto.randomBytes(32).toString('hex'),
  ALLOWED_USERS = ALLOWED_USERS || []
} = process.env;

const allowedUsers = ALLOWED_USERS
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// CORS
app.use(cors({ origin: HOME_PAGE || true, credentials: true }));

// SESSION
app.use(session({
  name: 'gh.sid',
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// PASSPORT
passport.serializeUser((user, done) => {
  const safe = {
    id: user.id,
    username: user.username || user.login || user.displayName,
    displayName: user.displayName,
    photos: user.photos,
    token: user.token
  };
  done(null, safe);
});
passport.deserializeUser((obj, done) => done(null, obj));

passport.use(new GitHubStrategy({
  clientID: GITHUB_Client_ID,
  clientSecret: GITHUB_Client_SECRET,
  callbackURL: CALL_BACK_URL
}, function(accessToken, refreshToken, profile, done) {
  profile.token = accessToken;
  if (allowedUsers.length > 0) {
    const username = (profile.username || profile.login || profile.displayName || '').toLowerCase();
    const isAllowed = allowedUsers.some(u => u.toLowerCase() === username);
    if (!isAllowed) return done(null, false, { message: 'User not allowed' });
  }
  return done(null, profile);
}));

app.use(passport.initialize());
app.use(passport.session());

// --- helpers ---
function ensureAuthenticated(req, res, next) {
  if (req.isAuthenticated() && req.user && req.user.token) return next();
  return res.status(401).json({ error: 'Unauthorized. Please log in via /auth/github' });
}

async function githubRequest(token, method, path, data = {}, params = {}) {
  const url = `https://api.github.com${path}`;
  const headers = {
    Authorization: `token ${token}`,
    'User-Agent': process.env.APP_NAME || 'github-server',
    Accept: 'application/vnd.github.v3+json'
  };
  const opts = { method, url, headers, data, params };
  const resp = await axios(opts);
  return resp.data;
}

// --- ROUTES ---
app.use(express.static(path.join(__dirname, 'public')));

app.get('/auth/github', (req, res, next) => {
  passport.authenticate('github', { scope: ['repo', 'user'] })(req, res, next);
});

app.get('/auth/github/callback', (req, res, next) => {
  passport.authenticate('github', (err, user) => {
    if (err) return next(err);
    if (!user) return res.redirect('/unauthorized.html');
    req.logIn(user, err => {
      if (err) return next(err);
      res.cookie('gh_token', user.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000
      });
      return res.redirect('/');
    });
  })(req, res, next);
});

app.post('/logout', (req, res) => {
  req.logout?.();
  req.session?.destroy?.(() => {});
  res.clearCookie('gh_token');
  res.json({ ok: true });
});

app.get('/api/me', ensureAuthenticated, (req, res) => {
  const { id, username, displayName, photos } = req.user;
  res.json({ id, username, displayName, photos });
});

app.get('/api/repos', ensureAuthenticated, async (req, res) => {
  try {
    const data = await githubRequest(req.user.token, 'GET', '/user/repos', {}, req.query);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.response?.data || err.message });
  }
});

app.get('/api/repos/:owner/:repo/branches', ensureAuthenticated, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const data = await githubRequest(req.user.token, 'GET', `/repos/${owner}/${repo}/branches`, {}, req.query);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.response?.data || err.message });
  }
});

// GET root directory contents (no path parameter)
app.get('/api/repos/:owner/:repo/contents', ensureAuthenticated, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const data = await githubRequest(
      req.user.token,
      'GET',
      `/repos/${owner}/${repo}/contents`,
      {},
      req.query
    );
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: err.response?.data || err.message
    });
  }
});

// GET file/folder contents with path
app.get('/api/repos/:owner/:repo/contents/:path(.*)', ensureAuthenticated, async (req, res) => {
  try {
    const { owner, repo, path } = req.params;
    const data = await githubRequest(
      req.user.token,
      'GET',
      `/repos/${owner}/${repo}/contents/${path}`,
      {},
      req.query
    );
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: err.response?.data || err.message
    });
  }
});

// PUT update/create file
app.put('/api/repos/:owner/:repo/contents/:path(.*)', ensureAuthenticated, async (req, res) => {
  try {
    const { owner, repo, path } = req.params;
    const { message = 'Update via API', content = '', branch, sha, committer } = req.body;

    const payload = {
      message,
      content: Buffer.from(content, 'utf8').toString('base64'),
    };
    if (branch) payload.branch = branch;
    if (sha) payload.sha = sha;
    if (committer) payload.committer = committer;

    const data = await githubRequest(
      req.user.token,
      'PUT',
      `/repos/${owner}/${repo}/contents/${path}`,
      payload
    );
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({
      error: err.response?.data || err.message
    });
  }
});



app.get('/api/repos/:owner/:repo/commits', ensureAuthenticated, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const data = await githubRequest(req.user.token, 'GET', `/repos/${owner}/${repo}/commits`, {}, req.query);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.response?.data || err.message });
  }
});

app.get('/api/repos/:owner/:repo/git/trees/:sha', ensureAuthenticated, async (req, res) => {
  try {
    const { owner, repo, sha } = req.params;
    const data = await githubRequest(req.user.token, 'GET', `/repos/${owner}/${repo}/git/trees/${sha}`, {}, req.query);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.response?.data || err.message });
  }
});


app.post('/api/repos/:owner/:repo/spec/update', ensureAuthenticated, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { path = 'spec.yaml', content, message = 'Update spec via API', branch } = req.body;
    if (!content) return res.status(400).json({ error: 'content is required' });
    let existingSha = null;
    try {
      const existing = await githubRequest(req.user.token, 'GET', `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, {}, { ref: branch });
      existingSha = existing.sha;
    } catch (e) {}

    const payload = {
      message,
      content: Buffer.from(content, 'utf8').toString('base64')
    };
    if (branch) payload.branch = branch;
    if (existingSha) payload.sha = existingSha;

    const data = await githubRequest(req.user.token, 'PUT', `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`, payload);
    res.json(data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.response?.data || err.message });
  }
});

app.get('/admin/allowed-users', (req, res) => {
  res.json({ allowedUsers });
});

app.listen(PORT, () => console.log(`${process.env.APP_NAME || 'github-server'} listening on port http://localhost:${PORT}`));
