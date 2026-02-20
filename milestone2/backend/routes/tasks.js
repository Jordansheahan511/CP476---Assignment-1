// for the tasks
const express = require("express");

function normalizeStatus(s){
  if (s === "Completed") return "Completed";
  if (s === "In Progress") return "In Progress";
  return "Not Started";
}
function normalizePriority(p){
  if (p === "High") return "High";
  if (p === "Low") return "Low";
  return "Medium";
}

module.exports = function taskRoutes(db){
  const router = express.Router();

  // Helper to fetch whoever is assigned
  function getAssignees(task_id){
    return new Promise((resolve, reject)=>{
      db.all(
        `SELECT u.user_id, u.full_name, u.email
         FROM task_assignments ta
         JOIN users u ON u.user_id = ta.user_id
         WHERE ta.task_id = ?
         ORDER BY u.full_name ASC`,
        [task_id],
        (err, rows)=> err ? reject(err) : resolve(rows || [])
      );
    });
  }

  // GET request
  router.get("/", (req, res)=>{
    const q = (req.query.q || "").trim();
    const userId = req.session.user.user_id;

    // Visible tasks:
    // tasks created by you
    // tasks created by the team members
    // tasks assigned to you
    // tasks shared with you
    const params = [userId, userId, userId, userId, userId];

    let where = `
      WHERE (
        t.created_by = ?
        OR t.created_by IN (
          SELECT member_id FROM team_members WHERE owner_id = ?
          UNION
          SELECT owner_id FROM team_members WHERE member_id = ?
        )
        OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.task_id AND ta.user_id = ?)
        OR EXISTS (SELECT 1 FROM task_shares ts WHERE ts.task_id = t.task_id AND ts.user_id = ?)
      )
    `;

    // Search - based on task name only
    if (q){
      where += " AND (t.title LIKE ?)";
      params.push(`%${q}%`);
    }

    db.all(
      `SELECT t.*
       FROM tasks t
       ${where}
       ORDER BY datetime(t.created_at) DESC`,
      params,
      async (err, rows)=>{
        if (err) return res.status(500).json({ error: "Database error loading tasks." });

        // Attach whoever was assigned
        const out = [];
        for (const r of (rows || [])){
          const a = await getAssignees(r.task_id).catch(()=>[]);
          const display = a.length ? (a.length > 2 ? "All" : a.map(x=>x.full_name).join(", ")) : "N/A";
          out.push({ ...r, assignees_display: display });
        }

        res.json({ tasks: out });
      }
    );
  });

  // POST
  router.post("/", (req, res)=>{
    const userId = req.session.user.user_id;
    const {
      title, description, due_date,
      priority, status,
      assigned_to
    } = req.body || {};

    if (!title || !title.trim()){
      return res.status(400).json({ error: "Task title is required." });
    }

    const pr = normalizePriority(priority);
    const st = normalizeStatus(status);

    const stmt = db.prepare(
      `INSERT INTO tasks (title, description, due_date, priority, status, created_by)
       VALUES (?,?,?,?,?,?)`
    );
    stmt.run(title.trim(), description || "", due_date || null, pr, st, userId, function(err){
      if (err) return res.status(500).json({ error: "Database error creating task." });

      const task_id = this.lastID;

      // Handle assignment mapping:
      // "N/A": no assignment
      // "All": assign to all users on the team
      // else - otherwise treat as full_name match, assign if found
      handleAssignments(task_id, assigned_to)
        .then(()=> res.status(201).json({ task_id }))
        .catch(()=> res.status(201).json({ task_id })); // don't block creation on assignment failure
    });

    function handleAssignments(task_id, assigned_to){
      return new Promise((resolve, reject)=>{
        if (!assigned_to || assigned_to === "N/A") return resolve();

        if (assigned_to === "All"){
          db.all(
            `SELECT DISTINCT u.user_id
             FROM users u
             WHERE u.user_id = ?
                OR u.user_id IN (
                  SELECT member_id FROM team_members WHERE owner_id = ?
                  UNION
                  SELECT owner_id FROM team_members WHERE member_id = ?
                )`,
            [userId, userId, userId],
            (err, users)=>{
              if (err) return resolve();
              const ins = db.prepare("INSERT OR IGNORE INTO task_assignments (task_id, user_id) VALUES (?,?)");
              users.forEach(u=>ins.run(task_id, u.user_id));
              ins.finalize(()=>resolve());
            }
          );
          return;
        }

        // assign to user by name
        db.get("SELECT user_id FROM users WHERE lower(full_name) = lower(?)", [assigned_to], (err, u)=>{
          if (err || !u) return resolve();
          db.run("INSERT OR IGNORE INTO task_assignments (task_id, user_id) VALUES (?,?)", [task_id, u.user_id], ()=>resolve());
        });
      });
    }
  });

  // GET
  router.get("/:id", async (req, res)=>{
    const id = req.params.id;
    const userId = req.session.user.user_id;

    db.get(
      `SELECT t.* FROM tasks t
       WHERE t.task_id = ?
         AND (
           t.created_by = ?
           OR t.created_by IN (
             SELECT member_id FROM team_members WHERE owner_id = ?
             UNION
             SELECT owner_id FROM team_members WHERE member_id = ?
           )
           OR EXISTS (SELECT 1 FROM task_assignments ta WHERE ta.task_id = t.task_id AND ta.user_id = ?)
           OR EXISTS (SELECT 1 FROM task_shares ts WHERE ts.task_id = t.task_id AND ts.user_id = ?)
         )`,
      [id, userId, userId, userId, userId, userId],
      async (err, row)=>{
        if (err) return res.status(500).json({ error: "Database error." });
        if (!row) return res.status(404).json({ error: "Task not found." });

        const assignees = await getAssignees(row.task_id).catch(()=>[]);
        const display = assignees.length ? (assignees.length > 2 ? "All" : assignees.map(x=>x.full_name).join(", ")) : "N/A";

        res.json({ ...row, assignees, assignees_display: display });
      }
    );
  });

  // PUT
  router.put("/:id", (req, res)=>{
    const id = req.params.id;
    const userId = req.session.user.user_id;
    const { title, description, due_date, priority, status, assigned_to } = req.body || {};

    // any user can edit a task
    db.get(
      `SELECT t.* FROM tasks t
       WHERE t.task_id = ?
         AND (
           t.created_by = ?
           OR t.created_by IN (
             SELECT member_id FROM team_members WHERE owner_id = ?
             UNION
             SELECT owner_id FROM team_members WHERE member_id = ?
           )
         )`,
      [id, userId, userId, userId],
      (err, row)=>{
      if (err) return res.status(500).json({ error: "Database error." });
      if (!row) return res.status(403).json({ error: "Not allowed (only team members can edit)." });

      const pr = normalizePriority(priority);
      const st = normalizeStatus(status);
      const t = (title && title.trim()) ? title.trim() : row.title;

      db.run(
        `UPDATE tasks
         SET title=?, description=?, due_date=?, priority=?, status=?, updated_at=datetime('now')
         WHERE task_id=?`,
        [t, description ?? row.description, due_date ?? row.due_date, pr, st, id],
        (err2)=>{
          if (err2) return res.status(500).json({ error: "Database error updating task." });

          // reset assignments then set based on assigned_to
          db.run("DELETE FROM task_assignments WHERE task_id = ?", [id], ()=>{
            handleAssignments(id, assigned_to).finally(()=>{
              res.json({ ok: true });
            });
          });
        }
      );
    });

    function handleAssignments(task_id, assigned_to){
      return new Promise((resolve, reject)=>{
        if (!assigned_to || assigned_to === "N/A") return resolve();

        if (assigned_to === "All"){
          db.all(
            `SELECT DISTINCT u.user_id
             FROM users u
             WHERE u.user_id = ?
                OR u.user_id IN (
                  SELECT member_id FROM team_members WHERE owner_id = ?
                  UNION
                  SELECT owner_id FROM team_members WHERE member_id = ?
                )`,
            [userId, userId, userId],
            (err, users)=>{
              if (err) return resolve();
              const ins = db.prepare("INSERT OR IGNORE INTO task_assignments (task_id, user_id) VALUES (?,?)");
              users.forEach(u=>ins.run(task_id, u.user_id));
              ins.finalize(()=>resolve());
            }
          );
          return;
        }

        db.get("SELECT user_id FROM users WHERE lower(full_name) = lower(?)", [assigned_to], (err, u)=>{
          if (err || !u) return resolve();
          db.run("INSERT OR IGNORE INTO task_assignments (task_id, user_id) VALUES (?,?)", [task_id, u.user_id], ()=>resolve());
        });
      });
    }
  });

  // DELETE
  router.delete("/:id", (req, res)=>{
    const id = req.params.id;
    const userId = req.session.user.user_id;

    db.run("DELETE FROM tasks WHERE task_id = ? AND created_by = ?", [id, userId], function(err){
      if (err) return res.status(500).json({ error: "Database error deleting task." });
      if (this.changes === 0) return res.status(403).json({ error: "Not allowed (only the creator can delete)." });
      res.json({ ok: true });
    });
  });

  return router;
};
