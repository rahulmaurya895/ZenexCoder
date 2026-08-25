const { app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
app.setPath('userData', path.join(process.env.APPDATA, 'zezenexcoderr'));
app.whenReady().then(() => {
  const source = path.join(app.getPath('userData'), 'database', 'zezenexcoderr.sqlite');
  const copy = path.join(app.getPath('temp'), `zezenexcoderr-db-diagnose-${Date.now()}.sqlite`);
  fs.copyFileSync(source, copy);
  const db = new Database(copy);
  const tables = db.prepare("SELECT name, type FROM sqlite_master WHERE name IN ('messages','chat_sessions','messages_fts','incidents','automations') ORDER BY name").all();
  let result = { tables, deleteMessages: null, wipe: null };
  db.exec("DROP TRIGGER IF EXISTS messages_ad; CREATE TRIGGER messages_ad AFTER DELETE ON messages BEGIN DELETE FROM messages_fts WHERE rowid = old.rowid; END;");
  try {
    db.exec('BEGIN; INSERT INTO chat_sessions (id,title,created_at,updated_at) VALUES (\'diagnose\',\'diagnose\',1,1); INSERT INTO messages (id,session_id,role,content,created_at) VALUES (\'diagnose-msg\',\'diagnose\',\'user\',\'diagnose\',1); DELETE FROM messages WHERE session_id=\'diagnose\'; DELETE FROM chat_sessions WHERE id=\'diagnose\'; ROLLBACK;');
    result.deleteMessages = 'pass';
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} result.deleteMessages = error.message; }
  try {
    db.exec('BEGIN; DELETE FROM messages; DELETE FROM chat_sessions; DELETE FROM change_records; DELETE FROM approvals_log; DELETE FROM automations; DELETE FROM incidents; DELETE FROM snippet_history; DELETE FROM projects; DELETE FROM messages_fts; ROLLBACK;');
    result.wipe = 'pass';
  } catch (error) { try { db.exec('ROLLBACK'); } catch {} result.wipe = error.message; }
  console.log(JSON.stringify(result)); db.close(); try { fs.unlinkSync(copy); } catch {} app.quit();
}).catch((error) => { console.error(error.message); app.exit(1); });