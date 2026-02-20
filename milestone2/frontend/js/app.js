/* frontend - application
   conect to back end
   keeps pages as separate HTML files
   Auth is cookie-based
*/

const API = {
  register: "/api/auth/register",
  login: "/api/auth/login",
  logout: "/api/auth/logout",
  me: "/api/auth/me",
  tasks: "/api/tasks",
  teamMembers: "/api/team/members",
  teamAdd: "/api/team/add"
};

function qs(sel, root=document){ return root.querySelector(sel); }
function qsa(sel, root=document){ return [...root.querySelectorAll(sel)]; }

async function apiFetch(url, opts = {}) {
  // Ensure cookies/session are sent with every request
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    ...opts
  });
  let data = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) data = await res.json();
  else data = await res.text();

  if (!res.ok) {
    const msg = (data && data.error) ? data.error : (typeof data === "string" ? data : "Request failed");
    throw new Error(msg);
  }
  return data;
}

function setStatus(msg, type="info"){
  const el = qs("#statusMsg");
  if (!el) return;
  el.textContent = msg;
  el.className = "status status--" + type;
}

async function requireAuthOrRedirect(){
  try {
    const me = await apiFetch(API.me);
    return me;
  } catch {
    window.location.href = "login.html";
    return null;
  }
}

function formatDate(d){
  if (!d) return "";
  const [y,m,day] = d.split("-").map(x=>parseInt(x,10));
  const dt = new Date(y, (m||1)-1, day||1);
  return dt.toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" });
}

function priorityChipClass(p){
  if (p === "High") return "chip--prio-high";
  if (p === "Low") return "chip--prio-low";
  return "chip--prio-med";
}
function statusChipClass(s){
  if (s === "Completed") return "chip--status-done";
  if (s === "In Progress") return "chip--status-progress";
  return "chip--status-notstarted";
}

/*PAGE: SIGNUP  */
async function initSignup(){
  const form = qs("form");
  form?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    setStatus("Creating account...", "info");
    const payload = {
      full_name: qs("#name")?.value?.trim(),
      email: qs("#email")?.value?.trim(),
      password: qs("#password")?.value,
      date_of_birth: qs("#dob")?.value || null
    };
    try{
      await apiFetch(API.register, { method:"POST", body: JSON.stringify(payload) });
      setStatus("Account created. Redirecting to dashboard...", "success");
      window.location.href = "dashboard.html";
    }catch(err){
      setStatus(err.message, "error");
    }
  });
}

/*PAGE: LOGIN*/
async function initLogin(){
  const form = qs("form");
  form?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    setStatus("Logging in...", "info");
    const payload = {
      email: qs("#login-email")?.value?.trim(),
      password: qs("#login-password")?.value
    };
    try{
      await apiFetch(API.login, { method:"POST", body: JSON.stringify(payload) });
      setStatus("Logged in. Redirecting...", "success");
      window.location.href = "dashboard.html";
    }catch(err){
      setStatus(err.message, "error");
    }
  });
}

/* PAGE: DASHBOARD  */
function renderTasks(rows){
  const grid = qs(".grid");
  if (!grid) return;
  grid.innerHTML = "";

  rows.forEach(t=>{
    const row = document.createElement("div");
    row.className = "grid__row";
    row.setAttribute("role","row");
    row.innerHTML = `
      <div class="grid__cell"><a class="chip chip--task" href="task-view.html?id=${encodeURIComponent(t.task_id)}">${escapeHtml(t.title)}</a></div>
      <div class="grid__cell"><span class="chip ${priorityChipClass(t.priority)}">${escapeHtml(t.priority)}</span></div>
      <div class="grid__cell"><span class="chip ${statusChipClass(t.status)}">${escapeHtml(t.status)}</span></div>
      <div class="grid__cell"><span class="chip chip--date">${escapeHtml(formatDate(t.due_date))}</span></div>
      <div class="grid__cell"><span class="chip chip--assignee">${escapeHtml(t.assignees_display || "N/A")}</span></div>
    `;
    grid.appendChild(row);
  });

  if (rows.length === 0){
    const empty = document.createElement("p");
    empty.textContent = "No tasks found.";
    empty.style.marginTop = "10px";
    grid.appendChild(empty);
  }
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}

async function loadTasks(){
  const search = (qs("#search")?.value || "").trim();
  const url = new URL(API.tasks, window.location.origin);
  if (search) url.searchParams.set("q", search);
  const data = await apiFetch(url.pathname + url.search);

  // dashboard filter + sort client-side
  const state = JSON.parse(localStorage.getItem("dashState") || "{}") || {};
  const filtered = applyDashboardFilter(data.tasks, state.filter || {});
  const sorted = applyDashboardSort(filtered, state.sort || null);
  renderTasks(sorted);
}

function applyDashboardSort(tasks, sort){
  if (!sort || !sort.by) return tasks;
  const dir = (sort.dir === "desc") ? -1 : 1;
  const prioRank = { High: 3, Medium: 2, Low: 1 };
  const statusRank = { "Not Started": 1, "In Progress": 2, Completed: 3 };
  const parseDue = (d)=> d ? new Date(d + "T00:00:00") : null;

  return [...tasks].sort((a,b)=>{
    const av = a, bv = b;
    if (sort.by === "priority"){
      return ( (prioRank[av.priority]||0) - (prioRank[bv.priority]||0) ) * dir;
    }
    if (sort.by === "status"){
      return ( (statusRank[av.status]||0) - (statusRank[bv.status]||0) ) * dir;
    }
    if (sort.by === "assigned"){
      const an = (av.assignees_display || "").toLowerCase();
      const bn = (bv.assignees_display || "").toLowerCase();
      return an.localeCompare(bn) * dir;
    }
    // due date
    const ad = parseDue(av.due_date);
    const bd = parseDue(bv.due_date);
    if (!ad && !bd) return 0;
    if (!ad) return 1;
    if (!bd) return -1;
    return (ad - bd) * dir;
  });
}

function applyDashboardFilter(tasks, filter){
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0,0,0,0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return tasks.filter(t=>{
    if (filter.status && t.status !== filter.status) return false;
    if (filter.priority && t.priority !== filter.priority) return false;

    if (filter.assigned){
      const disp = (t.assignees_display || "N/A");
      if (filter.assigned === "N/A"){
        if (disp !== "N/A") return false;
      } else if (filter.assigned === "All"){
        if (disp !== "All") return false;
      } else {
        // display is either "Name" or "Name, Name" or "All"
        const names = disp.split(",").map(s=>s.trim());
        if (!names.includes(filter.assigned)) return false;
      }
    }

    if (filter.due){
      if (filter.due === "none") return !t.due_date;
      if (!t.due_date) return false;
      const d = new Date(t.due_date + "T00:00:00");
      if (filter.due === "overdue") return d < new Date(now.toDateString());
      if (filter.due === "week") return d >= startOfWeek && d < endOfWeek;
      if (filter.due === "month") return d >= startOfMonth && d < endOfMonth;
    }

    return true;
  });
}

async function initDashboard(){
  const me = await requireAuthOrRedirect();
  if (!me) return;

  // Logout link in header
  const logoutLink = qsa('a[href="login.html"]').find(a=>a.textContent.toLowerCase().includes("logout"));
  logoutLink?.addEventListener("click", async (e)=>{
    e.preventDefault();
    await apiFetch(API.logout, { method:"POST" });
    window.location.href = "login.html";
  });

  qs("#search")?.addEventListener("input", ()=>{
    // debounce via timeout
    clearTimeout(window.__taskSearchT);
    window.__taskSearchT = setTimeout(()=>loadTasks().catch(err=>setStatus(err.message,"error")), 250);
  });

  // options for filter dropdown
  try{
    const tm = await apiFetch(API.teamMembers);
    const sel = qs("#filterAssigned");
    if (sel){
      // keep first "All" option
      const keep = sel.querySelector('option[value=""]');
      sel.innerHTML = "";
      sel.appendChild(keep);
      // Add N/A + names
      sel.insertAdjacentHTML("beforeend", '<option value="N/A">N/A</option>');
      (tm.members || []).forEach(u=>{
        sel.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(u.full_name)}">${escapeHtml(u.full_name)}</option>`);
      });
    }
    // also render current team list in share modal
    renderTeamList(tm.members || []);
  }catch{
    // ignore if team API not available; dashboard still works
  }

  // Share modal (add team member by email)
  const shareBtn = qs("#btnShare");
  const shareModal = qs("#shareModal");
  const teamForm = qs("#teamAddForm");
  const closeModal = ()=>{
    if (!shareModal) return;
    shareModal.setAttribute("aria-hidden", "true");
  };
  const openModal = ()=>{
    if (!shareModal) return;
    shareModal.setAttribute("aria-hidden", "false");
    qs("#teamEmail")?.focus();
  };
  shareBtn?.addEventListener("click", openModal);
  shareModal?.addEventListener("click", (e)=>{
    const t = e.target;
    if (t?.dataset?.close === "true") closeModal();
  });
  teamForm?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    const email = qs("#teamEmail")?.value?.trim();
    if (!email) return;
    try{
      setStatus("Adding team member...", "info");
      const out = await apiFetch(API.teamAdd, { method:"POST", body: JSON.stringify({ email }) });
      renderTeamList(out.members || []);
      setStatus("Team member added. Reloading tasks...", "success");
      qs("#teamEmail").value = "";
      await loadTasks();
    }catch(err){
      setStatus(err.message, "error");
    }
  });

  // Sort / Filter popovers
  const sortPanel = qs("#sortPanel");
  const filterPanel = qs("#filterPanel");
  const togglePop = (which)=>{
    const show = (el)=> el && el.setAttribute("aria-hidden","false");
    const hide = (el)=> el && el.setAttribute("aria-hidden","true");
    if (which === "sort"){
      hide(filterPanel);
      show(sortPanel);
    } else {
      hide(sortPanel);
      show(filterPanel);
    }
  };
  const hidePops = ()=>{
    sortPanel?.setAttribute("aria-hidden","true");
    filterPanel?.setAttribute("aria-hidden","true");
  };
  qs("#btnSort")?.addEventListener("click", ()=> togglePop("sort"));
  qs("#btnFilter")?.addEventListener("click", ()=> togglePop("filter"));
  document.addEventListener("click", (e)=>{
    const inPop = e.target.closest?.(".pop") || e.target.closest?.("#btnSort") || e.target.closest?.("#btnFilter");
    if (!inPop) hidePops();
  });

  // load the states
  const state = JSON.parse(localStorage.getItem("dashState") || "{}") || {};
  if (state.sort?.by) qs("#sortBy") && (qs("#sortBy").value = state.sort.by);
  if (state.sort?.dir) qs("#sortDir") && (qs("#sortDir").value = state.sort.dir);
  if (state.filter?.status) qs("#filterStatus") && (qs("#filterStatus").value = state.filter.status);
  if (state.filter?.priority) qs("#filterPriority") && (qs("#filterPriority").value = state.filter.priority);
  if (state.filter?.assigned) qs("#filterAssigned") && (qs("#filterAssigned").value = state.filter.assigned);
  if (state.filter?.due) qs("#filterDue") && (qs("#filterDue").value = state.filter.due);

  qs("#applySort")?.addEventListener("click", async ()=>{
    const st = JSON.parse(localStorage.getItem("dashState") || "{}") || {};
    st.sort = { by: qs("#sortBy")?.value, dir: qs("#sortDir")?.value };
    localStorage.setItem("dashState", JSON.stringify(st));
    hidePops();
    await loadTasks().catch(err=>setStatus(err.message,"error"));
  });
  qs("#clearSort")?.addEventListener("click", async ()=>{
    const st = JSON.parse(localStorage.getItem("dashState") || "{}") || {};
    st.sort = null;
    localStorage.setItem("dashState", JSON.stringify(st));
    hidePops();
    await loadTasks().catch(err=>setStatus(err.message,"error"));
  });

  qs("#applyFilter")?.addEventListener("click", async ()=>{
    const st = JSON.parse(localStorage.getItem("dashState") || "{}") || {};
    st.filter = {
      status: qs("#filterStatus")?.value || "",
      priority: qs("#filterPriority")?.value || "",
      assigned: qs("#filterAssigned")?.value || "",
      due: qs("#filterDue")?.value || ""
    };
    localStorage.setItem("dashState", JSON.stringify(st));
    hidePops();
    await loadTasks().catch(err=>setStatus(err.message,"error"));
  });
  qs("#clearFilter")?.addEventListener("click", async ()=>{
    const st = JSON.parse(localStorage.getItem("dashState") || "{}") || {};
    st.filter = {};
    localStorage.setItem("dashState", JSON.stringify(st));
    qs("#filterStatus") && (qs("#filterStatus").value = "");
    qs("#filterPriority") && (qs("#filterPriority").value = "");
    qs("#filterAssigned") && (qs("#filterAssigned").value = "");
    qs("#filterDue") && (qs("#filterDue").value = "");
    hidePops();
    await loadTasks().catch(err=>setStatus(err.message,"error"));
  });

  try{
    await loadTasks();
  }catch(err){
    setStatus(err.message, "error");
  }
}

function renderTeamList(members){
  const ul = qs("#teamList");
  if (!ul) return;
  ul.innerHTML = "";
  if (!members || !members.length){
    ul.innerHTML = "<li>(No team members yet)</li>";
    return;
  }
  members.forEach(m=>{
    ul.insertAdjacentHTML("beforeend", `<li>${escapeHtml(m.full_name)} <span style="color:#666">(${escapeHtml(m.email)})</span></li>`);
  });
}

/* PAGE: CREATE TASK */
async function initCreateTask(){
  const me = await requireAuthOrRedirect();
  if (!me) return;

  // Assigned-to dropdown from current team members
  try{
    const tm = await apiFetch(API.teamMembers);
    const sel = qs("#task-assigned");
    if (sel){
      sel.innerHTML = "";
      sel.insertAdjacentHTML("beforeend", '<option value="N/A">N/A</option>');
      (tm.members || []).forEach(u=>{
        sel.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(u.full_name)}">${escapeHtml(u.full_name)}</option>`);
      });
      sel.insertAdjacentHTML("beforeend", '<option value="All">All</option>');
      sel.value = "N/A";
    }
  }catch{}

  // Hook logout
  const logoutLink = qsa('a[href="login.html"]').find(a=>a.textContent.toLowerCase().includes("logout"));
  logoutLink?.addEventListener("click", async (e)=>{
    e.preventDefault();
    await apiFetch(API.logout, { method:"POST" });
    window.location.href = "login.html";
  });

  const form = qs("form.task-form");
  form?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    setStatus("Creating task...", "info");

    const payload = {
      title: qs("#task-title")?.value?.trim(),
      description: qs("#task-desc")?.value || "",
      status: qs("#task-status")?.value,
      priority: qs("#task-priority")?.value,
      due_date: qs("#task-due")?.value || null,
      assigned_to: qs("#task-assigned")?.value // UI supports "All"/names will backend map to users if found
    };

    try{
      const created = await apiFetch(API.tasks, { method:"POST", body: JSON.stringify(payload) });
      setStatus("Task created. Opening task view...", "success");
      window.location.href = `task-view.html?id=${encodeURIComponent(created.task_id)}`;
    }catch(err){
      setStatus(err.message, "error");
    }
  });
}

/* PAGE: TASK VIEW */
async function initTaskView(){
  const me = await requireAuthOrRedirect();
  if (!me) return;

  const logoutLink = qsa('a[href="login.html"]').find(a=>a.textContent.toLowerCase().includes("logout"));
  logoutLink?.addEventListener("click", async (e)=>{
    e.preventDefault();
    await apiFetch(API.logout, { method:"POST" });
    window.location.href = "login.html";
  });

  const id = new URLSearchParams(window.location.search).get("id");
  if (!id){
    setStatus("Missing task id in URL.", "error");
    return;
  }

  try{
    const t = await apiFetch(`${API.tasks}/${encodeURIComponent(id)}`);

    const titleValue = qs(".task-view-top__left .value-inline");
    const statusBadge = qs(".task-view-top__right .value-badge");
    const notesBox = qs(".box__content");
    const metaRows = qsa(".meta-row");

    if (titleValue) titleValue.textContent = t.title;
    if (statusBadge){
      statusBadge.textContent = t.status;
      statusBadge.classList.remove("badge--status-done","badge--status-progress","badge--status-notstarted");
      statusBadge.classList.add(
        t.status === "Completed" ? "badge--status-done" :
        t.status === "In Progress" ? "badge--status-progress" :
        "badge--status-notstarted"
      );
    }
    if (notesBox) notesBox.textContent = (t.description || "").trim() || "(No notes)";

    // Assigned, Priority, Due Date
    if (metaRows[0]) metaRows[0].lastElementChild.textContent = t.assignees_display || "N/A";
    if (metaRows[1]){
      const el = metaRows[1].lastElementChild;
      el.textContent = t.priority;
      el.classList.remove("meta--prio-high","meta--prio-med","meta--prio-low");
      el.classList.add(
        t.priority === "High" ? "meta--prio-high" :
        t.priority === "Low" ? "meta--prio-low" :
        "meta--prio-med"
      );
    }
    if (metaRows[2]) metaRows[2].lastElementChild.textContent = formatDate(t.due_date) || "N/A";

    //  Edit link to include id
    const editLink = qs('a[href="task-edit.html"]');
    if (editLink) editLink.href = `task-edit.html?id=${encodeURIComponent(id)}`;

  }catch(err){
    setStatus(err.message, "error");
  }
}

/*PAGE: EDIT TASK */
async function initTaskEdit(){
  // Assigned-to dropdown from current team members
  try{
    const tm = await apiFetch(API.teamMembers);
    const sel = qs("#edit-assigned");
    if (sel){
      sel.innerHTML = "";
      sel.insertAdjacentHTML("beforeend", '<option value="N/A">N/A</option>');
      (tm.members || []).forEach(u=>{
        sel.insertAdjacentHTML("beforeend", `<option value="${escapeHtml(u.full_name)}">${escapeHtml(u.full_name)}</option>`);
      });
      sel.insertAdjacentHTML("beforeend", '<option value="All">All</option>');
    }
  }catch{}
  const me = await requireAuthOrRedirect();
  if (!me) return;

  const logoutLink = qsa('a[href="login.html"]').find(a=>a.textContent.toLowerCase().includes("logout"));
  logoutLink?.addEventListener("click", async (e)=>{
    e.preventDefault();
    await apiFetch(API.logout, { method:"POST" });
    window.location.href = "login.html";
  });

  const id = new URLSearchParams(window.location.search).get("id");
  if (!id){
    setStatus("Missing task id in URL.", "error");
    return;
  }

  // Preload values
  try{
    const t = await apiFetch(`${API.tasks}/${encodeURIComponent(id)}`);
    qs("#edit-title").value = t.title || "";
    qs("#edit-desc").value = t.description || "";
    qs("#edit-status").value = t.status || "Not Started";
    qs("#edit-priority").value = t.priority || "Medium";
    qs("#edit-due").value = t.due_date || "";
    // Assigned: if single, set it but otherwise default to "All" if multiple
    if (t.assignees && t.assignees.length > 1) qs("#edit-assigned").value = "All";
    else if (t.assignees && t.assignees.length === 1) qs("#edit-assigned").value = t.assignees[0].full_name;
    else qs("#edit-assigned").value = "N/A";
  }catch(err){
    setStatus(err.message, "error");
    return;
  }

  const form = qs("form.task-form");
  form?.addEventListener("submit", async (e)=>{
    e.preventDefault();
    setStatus("Saving changes...", "info");

    const payload = {
      title: qs("#edit-title")?.value?.trim(),
      description: qs("#edit-desc")?.value || "",
      status: qs("#edit-status")?.value,
      priority: qs("#edit-priority")?.value,
      due_date: qs("#edit-due")?.value || null,
      assigned_to: qs("#edit-assigned")?.value
    };

    try{
      await apiFetch(`${API.tasks}/${encodeURIComponent(id)}`, { method:"PUT", body: JSON.stringify(payload) });
      setStatus("Saved. Returning to task view...", "success");
      window.location.href = `task-view.html?id=${encodeURIComponent(id)}`;
    }catch(err){
      setStatus(err.message, "error");
    }
  });

  // Delete button
  const delBtn = qsa("button").find(b=>b.textContent.trim().toLowerCase().includes("delete"));
  delBtn?.addEventListener("click", async ()=>{
    if (!confirm("Delete this task?")) return;
    try{
      await apiFetch(`${API.tasks}/${encodeURIComponent(id)}`, { method:"DELETE" });
      window.location.href = "dashboard.html";
    }catch(err){
      setStatus(err.message, "error");
    }
  });
}

/* BOOTSTRAP*/
document.addEventListener("DOMContentLoaded", ()=>{
  // Each page sets data-page on <body>
  const page = document.body?.dataset?.page;

  // status message area, if present
  if (page === "signup") initSignup();
  else if (page === "login") initLogin();
  else if (page === "dashboard") initDashboard();
  else if (page === "create") initCreateTask();
  else if (page === "view") initTaskView();
  else if (page === "edit") initTaskEdit();
});
