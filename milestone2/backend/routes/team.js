// for adding team members

const express = require("express");

module.exports = function teamRoutes(db){
  const router = express.Router();

  function getTeamUsers(userId){
    return new Promise((resolve, reject)=>{
      db.all(
        `SELECT DISTINCT u.user_id, u.full_name, u.email
         FROM users u
         WHERE u.user_id = ?
            OR u.user_id IN (
              SELECT member_id FROM team_members WHERE owner_id = ?
              UNION
              SELECT owner_id FROM team_members WHERE member_id = ?
            )
         ORDER BY CASE WHEN u.user_id = ? THEN 0 ELSE 1 END, lower(u.full_name) ASC`,
        [userId, userId, userId, userId],
        (err, rows)=> err ? reject(err) : resolve(rows || [])
      );
    });
  }

  // GET
  router.get("/members", async (req, res)=>{
    const userId = req.session.user.user_id;
    try{
      const members = await getTeamUsers(userId);
      res.json({ members });
    }catch{
      res.status(500).json({ error: "Database error loading team members." });
    }
  });

  // POST
  router.post("/add", (req, res)=>{
    const userId = req.session.user.user_id;
    const email = (req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Email is required." });

    // Must exist as a registered user
    db.get("SELECT user_id FROM users WHERE lower(email)=lower(?)", [email], (err, u)=>{
      if (err) return res.status(500).json({ error: "Database error." });
      if (!u) return res.status(404).json({ error: "No user found with that email. Ask them to sign up first." });
      if (u.user_id === userId) return res.status(400).json({ error: "You cannot add yourself." });

      db.run(
        "INSERT OR IGNORE INTO team_members (owner_id, member_id) VALUES (?,?)",
        [userId, u.user_id],
        async ()=>{
          // Return the updated team list
          const members = await getTeamUsers(userId).catch(()=>[]);
          res.json({ ok: true, members });
        }
      );
    });
  });

  return router;
};
