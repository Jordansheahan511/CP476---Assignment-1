// authentification stuff
const express = require("express");
const bcrypt = require("bcryptjs");

module.exports = function authRoutes(db){
  const router = express.Router();

  // Register + auto-login
  router.post("/register", async (req, res)=>{
    const { full_name, email, password, date_of_birth } = req.body || {};
    if (!full_name || !email || !password){
      return res.status(400).json({ error: "full_name, email, and password are required." });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const stmt = db.prepare(
      "INSERT INTO users (full_name, email, password_hash, date_of_birth) VALUES (?,?,?,?)"
    );
    stmt.run(full_name.trim(), email.trim().toLowerCase(), password_hash, date_of_birth || null, function(err){
      if (err){
        if (String(err).includes("UNIQUE")) return res.status(409).json({ error: "Email already registered." });
        return res.status(500).json({ error: "Database error creating user." });
      }

      const user = { user_id: this.lastID, full_name, email: email.trim().toLowerCase() };
      req.session.user = user; // "cookie-based" session
      return res.status(201).json(user);
    });
  });

  router.post("/login", (req, res)=>{
    const { email, password } = req.body || {};
    if (!email || !password){
      return res.status(400).json({ error: "email and password are required." });
    }

    db.get("SELECT * FROM users WHERE email = ?", [email.trim().toLowerCase()], async (err, row)=>{
      if (err) return res.status(500).json({ error: "Database error." });
      if (!row) return res.status(401).json({ error: "Invalid credentials." });

      const ok = await bcrypt.compare(password, row.password_hash);
      if (!ok) return res.status(401).json({ error: "Invalid credentials." });

      req.session.user = { user_id: row.user_id, full_name: row.full_name, email: row.email };
      return res.json({ user_id: row.user_id, full_name: row.full_name, email: row.email });
    });
  });

  router.post("/logout", (req, res)=>{
    req.session.destroy(()=>{
      res.clearCookie("connect.sid");
      res.json({ ok: true });
    });
  });

  router.get("/me", (req, res)=>{
    if (!req.session || !req.session.user) return res.status(401).json({ error: "Not authenticated." });
    res.json(req.session.user);
  });

  return router;
};
