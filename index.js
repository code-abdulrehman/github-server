require("dotenv").config();
const express = require("express");
const passport = require("passport");
const GitHubStrategy = require("passport-github2").Strategy;
const axios = require("axios");
const cors = require("cors");
const crypto = require("crypto");
const path = require("path");
const cookieParser = require("cookie-parser");

const {
  GITHUB_Client_ID,
  GITHUB_Client_SECRET,
  CALL_BACK_URL,
  HOME_PAGE,
  PORT = 3001,
  ALLOWED_USERS = "",
} = process.env;

const allowedUsers = ALLOWED_USERS.split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// CORS
app.use(cors({ origin: HOME_PAGE || true, credentials: true }));

// --- PASSPORT ---
passport.use(
  new GitHubStrategy(
    {
      clientID: GITHUB_Client_ID,
      clientSecret: GITHUB_Client_SECRET,
      callbackURL: CALL_BACK_URL,
    },
    function (accessToken, refreshToken, profile, done) {
      profile.token = accessToken;

      if (allowedUsers.length > 0) {
        const username =
          (profile.username || profile.login || profile.displayName || "").toLowerCase();
        const isAllowed = allowedUsers.some((u) => u.toLowerCase() === username);
        if (!isAllowed) return done(null, false, { message: "User not allowed" });
      }
      return done(null, profile);
    }
  )
);

app.use(passport.initialize());

// --- helpers ---
function ensureAuthenticated(req, res, next) {
  const token = req.cookies?.gh_token;
  if (!token) {
    return res
      .status(401)
      .json({ error: "Unauthorized. Please log in via /auth/github" });
  }
  req.user = { token };
  return next();
}

async function githubRequest(token, method, path, data = {}, params = {}) {
  const url = `https://api.github.com${path}`;
  const headers = {
    Authorization: `token ${token}`,
    "User-Agent": process.env.APP_NAME || "github-server",
    Accept: "application/vnd.github.v3+json",
  };
  const opts = { method, url, headers, data, params };
  const resp = await axios(opts);
  return resp.data;
}

// --- ROUTES ---
app.use(express.static(path.join(__dirname, "public")));

// GitHub login
app.get("/auth/github", (req, res, next) => {
  passport.authenticate("github", { scope: ["repo", "user"] })(req, res, next);
});

// GitHub callback
app.get("/auth/github/callback", (req, res, next) => {
  passport.authenticate("github", (err, user) => {
    if (err) return next(err);
    if (!user) return res.redirect("/unauthorized.html");

    // set cookie only
    res.cookie("gh_token", user.token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.redirect("/");
  })(req, res, next);
});

// Logout
app.post("/logout", (req, res) => {
  res.clearCookie("gh_token");
  res.status(200).json({ message: "Logged out" });
});

// Me
app.get("/api/me", ensureAuthenticated, async (req, res) => {
  try {
    const me = await githubRequest(req.user.token, "GET", "/user");
    const { id, login, name, avatar_url } = me;
    res.json({
      id,
      username: login,
      displayName: name,
      photos: [{ value: avatar_url }],
    });
  } catch (err) {
    res
      .status(err.response?.status || 500)
      .json({ error: err.response?.data || err.message });
  }
});

// Repos (paginated)
app.get("/api/repos", ensureAuthenticated, async (req, res) => {
  try {
    let allRepos = [];
    let page = 1;
    const per_page = 100;
    let more = true;

    while (more) {
      const params = { ...req.query, per_page, page };
      const repos = await githubRequest(
        req.user.token,
        "GET",
        "/user/repos",
        {},
        params
      );
      allRepos = allRepos.concat(repos);
      if (repos.length < per_page) {
        more = false;
      } else {
        page++;
      }
    }

    res.json(allRepos);
  } catch (err) {
    res
      .status(err.response?.status || 500)
      .json({ error: err.response?.data || err.message });
  }
});

// Branches
app.get("/api/repos/:owner/:repo/branches", ensureAuthenticated, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const data = await githubRequest(
      req.user.token,
      "GET",
      `/repos/${owner}/${repo}/branches`,
      {},
      req.query
    );
    res.json(data);
  } catch (err) {
    res
      .status(err.response?.status || 500)
      .json({ error: err.response?.data || err.message });
  }
});

// Root directory contents
app.get("/api/repos/:owner/:repo/contents", ensureAuthenticated, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const data = await githubRequest(
      req.user.token,
      "GET",
      `/repos/${owner}/${repo}/contents`,
      {},
      req.query
    );
    res.json(data);
  } catch (err) {
    res
      .status(err.response?.status || 500)
      .json({ error: err.response?.data || err.message });
  }
});

// File/folder contents
app.get("/api/repos/:owner/:repo/contents/:path(.*)", ensureAuthenticated, async (req, res) => {
  try {
    const { owner, repo, path } = req.params;
    const data = await githubRequest(
      req.user.token,
      "GET",
      `/repos/${owner}/${repo}/contents/${path}`,
      {},
      req.query
    );
    res.json(data);
  } catch (err) {
    res
      .status(err.response?.status || 500)
      .json({ error: err.response?.data || err.message });
  }
});

// Commits
app.get("/api/repos/:owner/:repo/commits", ensureAuthenticated, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const data = await githubRequest(
      req.user.token,
      "GET",
      `/repos/${owner}/${repo}/commits`,
      {},
      req.query
    );
    res.json(data);
  } catch (err) {
    res
      .status(err.response?.status || 500)
      .json({ error: err.response?.data || err.message });
  }
});

// Git tree
app.get("/api/repos/:owner/:repo/git/trees/:sha", ensureAuthenticated, async (req, res) => {
  try {
    const { owner, repo, sha } = req.params;
    const data = await githubRequest(
      req.user.token,
      "GET",
      `/repos/${owner}/${repo}/git/trees/${sha}`,
      {},
      req.query
    );
    res.json(data);
  } catch (err) {
    res
      .status(err.response?.status || 500)
      .json({ error: err.response?.data || err.message });
  }
});

// Update spec file
app.post("/api/repos/:owner/:repo/spec/update", ensureAuthenticated, async (req, res) => {
  try {
    const { owner, repo } = req.params;
    const { path = "spec.yaml", content, message = "Update spec via API", branch } = req.body;
    if (!content) return res.status(400).json({ error: "content is required" });

    let existingSha = null;
    try {
      const existing = await githubRequest(
        req.user.token,
        "GET",
        `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
        {},
        { ref: branch }
      );
      existingSha = existing.sha;
    } catch (e) {}

    const payload = {
      message,
      content: Buffer.from(content, "utf8").toString("base64"),
    };
    if (branch) payload.branch = branch;
    if (existingSha) payload.sha = existingSha;

    const data = await githubRequest(
      req.user.token,
      "PUT",
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}`,
      payload
    );
    res.json(data);
  } catch (err) {
    res
      .status(err.response?.status || 500)
      .json({ error: err.response?.data || err.message });
  }
});

// Admin allowed users
app.get("/admin/allowed-users", (req, res) => {
  res.json({ allowedUsers });
});

// Update/create file
app.put("/api/repos/:owner/:repo/contents/:path(.*)", ensureAuthenticated, async (req, res) => {
  try {
    const { owner, repo, path } = req.params;
    const { message = "Update via API", content = "", branch, sha, committer, push = false } =
      req.body;

    const payload = {
      message,
      content: content, // Already base64 from frontend
    };
    if (branch) payload.branch = branch;
    if (sha) payload.sha = sha;
    if (committer) payload.committer = committer;

    const data = await githubRequest(
      req.user.token,
      "PUT",
      `/repos/${owner}/${repo}/contents/${path}`,
      payload
    );

    if (push) {
      data.push = { success: true, message: "Commit created and available on remote" };
    }

    res.json(data);
  } catch (err) {
    res
      .status(err.response?.status || 500)
      .json({ error: err.response?.data || err.message });
  }
});

// Start server
app.listen(PORT, () =>
  console.log(`${process.env.APP_NAME || "github-server"} running on http://localhost:${PORT}`)
);
