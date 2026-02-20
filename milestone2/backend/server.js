// server

const express = require("express");
const path = require("path");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);

const { openDb, initDb, DB_FILE } = require("./db/db");
const requireAuth = require("./middleware/requireAuth");

const makeAuthRoutes = require("./routes/auth");
const makeTaskRoutes = require("./routes/tasks");
const makeTeamRoutes = require("./routes/team");

async function main(){
  const app = express();

  // Body parsing
  app.use(express.json());

  // Database
  const db = openDb();
  await initDb(db);

  // Session
  app.use(session({
    store: new SQLiteStore({ db: "sessions.db", dir: path.join(__dirname, "db") }),
    secret: process.env.SESSION_SECRET || "dev_secret_change_me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax"
    }
  }));

  // Routes
  app.use("/api/auth", makeAuthRoutes(db));
  app.use("/api/tasks", requireAuth, makeTaskRoutes(db));
  app.use("/api/team", requireAuth, makeTeamRoutes(db));

  // Serve frontend
  const frontendDir = path.join(__dirname, "..", "frontend");
  app.use(express.static(frontendDir));

  // Default route to login
  app.get("/", (req, res)=> res.redirect("/login.html"));

  const port = process.env.PORT || 3000;
  app.listen(port, ()=> console.log(`Server running: http://localhost:${port}`));
}

main().catch(err=>{
  console.error(err);
  process.exit(1);
});
