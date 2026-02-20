// SQLite connection + schema init

const path = require("path");
const fs = require("fs");
const sqlite3 = require("sqlite3").verbose();

const DB_FILE = path.join(__dirname, "milestone2.db");
const INIT_SQL = path.join(__dirname, "init.sql");

function openDb(){
  const db = new sqlite3.Database(DB_FILE);
  db.exec("PRAGMA foreign_keys = ON;");
  return db;
}

function initDb(db){
  const sql = fs.readFileSync(INIT_SQL, "utf-8");
  return new Promise((resolve, reject)=>{
    db.exec(sql, (err)=> err ? reject(err) : resolve());
  });
}

module.exports = { openDb, initDb, DB_FILE };
