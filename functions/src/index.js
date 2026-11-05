const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const PDFDocument = require("pdfkit");
const { onRequest } = require("firebase-functions/v2/https");

const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || process.env.STORAGE_BUCKET;
admin.initializeApp(storageBucket ? { storageBucket } : undefined);
const db = admin.firestore();
const auth = admin.auth();
const bucket = admin.storage().bucket();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "12mb" }));
app.use(express.urlencoded({ extended: true, limit: "12mb" }));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 3 },
});

const COLLECTIONS = {
  users: "users",
  "student-profiles": "student_profiles",
  "lecturer-profiles": "lecturer_profiles",
  departments: "departments",
  programmes: "programmes",
  "academic-years": "academic_years",
  "attachment-periods": "attachment_periods",
  placements: "placements",
  assignments: "assignments",
  assessments: "assessments",
  logbooks: "logbooks",
  "logbook-feedback": "logbook_feedback",
  "assessment-categories": "assessment_categories",
  "assessment-criteria": "assessment_criteria",
  "grading-scales": "grading_scales",
  "assessment-marks": "assessment_marks",
  "final-results": "final_results",
  notifications: "notifications",
  documents: "documents",
  "audit-logs": "audit_logs",
};
const now = () => new Date().toISOString();
const numeric = (v) => v === "" || v === null || v === undefined ? v : Number(v);
const bool = (v) => v === true || v === "true" || v === 1 || v === "1";
const clean = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([,v]) => v !== undefined));
class HttpError extends Error {
  constructor(status, message, field) { super(message); this.status = status; this.field = field; }
}
const fail = (status, message, field) => { throw new HttpError(status, message, field); };
const isAdmin = (u) => u?.role === "admin";
const isLecturer = (u) => u?.role === "lecturer";
const isStudent = (u) => u?.role === "student";
const fullName = (u) => [u?.first_name, u?.last_name].filter(Boolean).join(" ").trim() || u?.username || u?.email || "User";

async function docs(collection) {
  const snap = await db.collection(collection).get();
  return snap.docs.map(d => d.data());
}
async function getById(collection, id) {
  if (id === undefined || id === null || id === "") return null;
  const snap = await db.collection(collection).doc(String(id)).get();
  return snap.exists ? snap.data() : null;
}
async function save(collection, id, data, merge = false) {
  await db.collection(collection).doc(String(id)).set(data, { merge });
  return getById(collection, id);
}
async function nextId(collection) {
  const ref = db.collection("_counters").doc(collection);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const id = (snap.exists ? Number(snap.data().value || 0) : 0) + 1;
    tx.set(ref, { value: id }, { merge: true });
    return id;
  });
}
async function createRecord(collection, input) {
  const id = await nextId(collection);
  const stamp = now();
  const data = { ...input, id, created_at: stamp, updated_at: stamp };
  await save(collection, id, data);
  return data;
}
async function userForUid(uid) {
  const snap = await db.collection("users").where("auth_uid", "==", uid).limit(1).get();
  return snap.empty ? null : snap.docs[0].data();
}
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    if (!token) return res.status(401).json({ detail: "Sign in to continue." });
    const decoded = await auth.verifyIdToken(token);
    const user = await userForUid(decoded.uid);
    if (!user || user.is_active === false) return res.status(403).json({ detail: "This account is inactive or has not been provisioned by an administrator." });
    req.user = user;
    req.authUid = decoded.uid;
    next();
  } catch (e) {
    return res.status(401).json({ detail: "Your session is invalid or has expired. Please sign in again." });
  }
}
app.use(requireAuth);
app.use(upload.any());

async function profileFor(user, kind) {
  const key = kind === "student" ? "student_profile_id" : "lecturer_profile_id";
  const collection = kind === "student" ? "student_profiles" : "lecturer_profiles";
  if (user?.[key]) return getById(collection, user[key]);
  const rows = await docs(collection);
  return rows.find(p => Number(p.user) === Number(user?.id)) || null;
}
async function assignmentsForLecturer(user) {
  const lp = await profileFor(user, "lecturer");
  if (!lp) return [];
  return (await docs("assignments")).filter(a => Number(a.lecturer) === Number(lp.id) && a.is_active !== false);
}
async function allowedPlacementIds(user) {
  if (isAdmin(user)) return null;
  if (isStudent(user)) {
    const sp = await profileFor(user, "student");
    return sp ? (await docs("placements")).filter(p => Number(p.student) === Number(sp.id)).map(p => Number(p.id)) : [];
  }
  const assignments = await assignmentsForLecturer(user);
  const studentIds = new Set(assignments.map(a => Number(a.student)));
  return (await docs("placements")).filter(p => studentIds.has(Number(p.student))).map(p => Number(p.id));
}
async function scopedRows(collection, user) {
  let rows = await docs(collection);
  if (isAdmin(user)) return rows;
  const student = await profileFor(user, "student");
  const lecturer = await profileFor(user, "lecturer");
  const placementIds = await allowedPlacementIds(user);
  const placementSet = placementIds === null ? null : new Set(placementIds);
  switch (collection) {
    case "users": return [];
    case "student_profiles":
      if (isStudent(user)) return student ? rows.filter(x => Number(x.id) === Number(student.id)) : [];
      if (isLecturer(user)) {
        const ids = new Set((await assignmentsForLecturer(user)).map(x => Number(x.student)));
        return rows.filter(x => ids.has(Number(x.id)));
      }
      return [];
    case "lecturer_profiles":
      if (isLecturer(user)) return lecturer ? rows.filter(x => Number(x.id) === Number(lecturer.id)) : [];
      if (isStudent(user)) {
        const as = (await docs("assignments")).filter(x => Number(x.student) === Number(student?.id) && x.is_active !== false);
        const ids = new Set(as.map(x => Number(x.lecturer)));
        return rows.filter(x => ids.has(Number(x.id)));
      }
      return [];
    case "placements":
      return placementSet ? rows.filter(x => placementSet.has(Number(x.id))) : [];
    case "assignments":
      if (isLecturer(user)) return rows.filter(x => Number(x.lecturer) === Number(lecturer?.id));
      if (isStudent(user)) return rows.filter(x => Number(x.student) === Number(student?.id));
      return [];
    case "assessments":
      if (isLecturer(user)) return rows.filter(x => Number(x.lecturer) === Number(lecturer?.id));
      return rows.filter(x => placementSet?.has(Number(x.placement)));
    case "logbooks":
      return rows.filter(x => placementSet?.has(Number(x.placement)));
    case "logbook_feedback": {
      const entryIds = new Set((await scopedRows("logbooks", user)).map(x => Number(x.id)));
      if (isLecturer(user)) return rows.filter(x => Number(x.lecturer) === Number(lecturer?.id));
      return rows.filter(x => entryIds.has(Number(x.entry)));
    }
    case "assessment_marks": {
      if (isLecturer(user)) {
        const ids = new Set((await scopedRows("assessments", user)).map(x => Number(x.id)));
        return rows.filter(x => ids.has(Number(x.assessment)));
      }
      const results = await docs("final_results");
      const published = new Set(results.filter(r => r.status === "published").map(r => Number(r.placement)));
      const assessments = await docs("assessments");
      const ids = new Set(assessments.filter(a => placementSet?.has(Number(a.placement)) && published.has(Number(a.placement))).map(a => Number(a.id)));
      return rows.filter(x => ids.has(Number(x.assessment)));
    }
    case "final_results":
      if (isLecturer(user)) return rows.filter(x => placementSet?.has(Number(x.placement)));
      return rows.filter(x => placementSet?.has(Number(x.placement)) && x.status === "published");
    case "notifications": return rows.filter(x => Number(x.recipient) === Number(user.id));
    case "documents": return rows.filter(x => placementSet?.has(Number(x.placement)));
    case "audit_logs": return [];
    default: return rows;
  }
}
function assertRole(user, roles, message = "You do not have permission to perform this action.") {
  if (!roles.includes(user.role)) fail(403, message);
}
async function getRel(collection, id) { return getById(collection, id); }
async function userSummary(id) {
  const user = await getRel("users", id);
  if (!user) return null;
  return { id: user.id, username: user.username, email: user.email, first_name: user.first_name, last_name: user.last_name, full_name: fullName(user), role: user.role, phone: user.phone || "", avatar: user.avatar || "", is_active: user.is_active !== false };
}
async function studentDetails(id) {
  const p = await getRel("student_profiles", id);
  if (!p) return null;
  const [u,d,pr,y] = await Promise.all([userSummary(p.user), getRel("departments",p.department),getRel("programmes",p.programme),getRel("academic_years",p.academic_year)]);
  return { ...p, user_details:u, department_name:d?.name || "", programme_name:pr?.name || "", academic_year_label:y?.label || "" };
}
async function lecturerDetails(id) {
  const p = await getRel("lecturer_profiles",id);
  if (!p) return null;
  const [u,d] = await Promise.all([userSummary(p.user),getRel("departments",p.department)]);
  return { ...p, user_details:u, department_name:d?.name || "" };
}
async function enrich(collection, row) {
  if (!row) return row;
  const x = { ...row }; delete x._docId;
  switch (collection) {
    case "users": { const safe={...x}; delete safe.auth_uid; return { ...safe, full_name:fullName(x), date_joined:x.date_joined || x.created_at }; }
    case "programmes": return { ...x, department_name:(await getRel("departments",x.department))?.name || "" };
    case "attachment_periods": return { ...x, academic_year_label:(await getRel("academic_years",x.academic_year))?.label || "" };
    case "student_profiles": return { ...x, user_details:await userSummary(x.user), department_name:(await getRel("departments",x.department))?.name || "", programme_name:(await getRel("programmes",x.programme))?.name || "", academic_year_label:(await getRel("academic_years",x.academic_year))?.label || "" };
    case "lecturer_profiles": return { ...x, user_details:await userSummary(x.user), department_name:(await getRel("departments",x.department))?.name || "" };
    case "placements": {
      const student = await studentDetails(x.student);
      return { ...x, student_details:student, company:x.company_name, period_name:(await getRel("attachment_periods",x.attachment_period))?.name || "", reviewed_by_name:fullName(await getRel("users",x.reviewed_by)) };
    }
    case "assignments": return { ...x, student_details:await studentDetails(x.student), lecturer_details:await lecturerDetails(x.lecturer), period_name:(await getRel("attachment_periods",x.attachment_period))?.name || "" };
    case "assessments": {
      const p = await getRel("placements",x.placement), lp = await getRel("lecturer_profiles",x.lecturer);
      const sd = p ? await studentDetails(p.student) : null;
      const lu = lp ? await userSummary(lp.user) : null;
      const [endH,endM] = String(x.start_time || "00:00").split(":").map(Number);
      const end = new Date(2000,0,1,endH || 0,endM || 0+(Number(x.duration_minutes)||60));
      end.setMinutes((endH||0)*60+(endM||0)+(Number(x.duration_minutes)||60));
      return { ...x, student_name:sd?.user_details?.full_name || "", registration_number:sd?.registration_number || "", company_name:p?.company_name || "", lecturer_name:lu?.full_name || "", end_time:`${String(end.getHours()).padStart(2,"0")}:${String(end.getMinutes()).padStart(2,"0")}` };
    }
    case "logbooks": {
      const p = await getRel("placements",x.placement), sd = p ? await studentDetails(p.student) : null;
      const feedback = (await docs("logbook_feedback")).filter(f => Number(f.entry)===Number(x.id));
      return { ...x, student_name:sd?.user_details?.full_name || "", registration_number:sd?.registration_number || "", feedback_items:await Promise.all(feedback.map(f=>enrich("logbook_feedback",f))) };
    }
    case "logbook_feedback": {
      const entry = await getRel("logbooks",x.entry), p = entry ? await getRel("placements",entry.placement) : null;
      const sd = p ? await studentDetails(p.student) : null, lp = await getRel("lecturer_profiles",x.lecturer);
      const lu = lp ? await userSummary(lp.user) : null;
      return { ...x, lecturer_name:lu?.full_name || "", week_number:entry?.week_number || null, student_name:sd?.user_details?.full_name || "" };
    }
    case "assessment_categories": return { ...x, criteria_count:(await docs("assessment_criteria")).filter(c=>Number(c.category)===Number(x.id)).length };
    case "assessment_criteria": return { ...x, category_name:(await getRel("assessment_categories",x.category))?.name || "" };
    case "assessment_marks": {
      const c = await getRel("assessment_criteria",x.criterion), a = await getRel("assessments",x.assessment), p = a ? await getRel("placements",a.placement) : null, sd=p?await studentDetails(p.student):null;
      return { ...x, criterion_name:c?.name || "", max_marks:c?.max_marks || "0", weighting:c?.weighting || "0", student_name:sd?.user_details?.full_name || "" };
    }
    case "final_results": {
      const p = await getRel("placements",x.placement), sd = p ? await studentDetails(p.student) : null;
      const assessments = (await docs("assessments")).filter(a=>Number(a.placement)===Number(x.placement));
      const marks = await docs("assessment_marks");
      const components = [];
      for (const m of marks.filter(m=>m.is_final && assessments.some(a=>Number(a.id)===Number(m.assessment)))) {
        const a=assessments.find(a=>Number(a.id)===Number(m.assessment)), c=await getRel("assessment_criteria",m.criterion), cat=c?await getRel("assessment_categories",c.category):null;
        components.push({assessment_id:a.id,assessment_type:a.assessment_type,criterion:c?.name||"",category:cat?.name||"",mark_awarded:String(m.mark_awarded),max_marks:String(c?.max_marks||0),weighting:String(c?.weighting||0),comments:m.comments||""});
      }
      return { ...x, student_name:sd?.user_details?.full_name || "", registration_number:sd?.registration_number || "", company_name:p?.company_name || "", components };
    }
    case "notifications": return { ...x, is_read:!!x.read_at };
    case "documents": return { ...x, uploaded_by_name:fullName(await getRel("users",x.uploaded_by)) };
    case "audit_logs": return { ...x, actor_name:fullName(await getRel("users",x.actor)) || "System" };
    default: return x;
  }
}
async function notify(userId, title, message, kind="info", link="") {
  if (!userId) return;
  await createRecord("notifications",{recipient:Number(userId),title,message,kind,link,read_at:null});
}
async function notifyAdmins(title,message,kind="info",link="") {
  const admins=(await docs("users")).filter(u=>u.role==="admin" && u.is_active!==false);
  for(const u of admins) await notify(u.id,title,message,kind,link);
}
async function audit(user, action, entityType, entityId, details={}) {
  await createRecord("audit_logs",{actor:user?.id || null,action,entity_type:entityType,entity_id:String(entityId ?? ""),details});
}
function parseInput(req) {
  const body = { ...(req.body || {}) };
  for (const key of ["is_active","is_current","is_required","is_final","requests_revision"]) {
    if (body[key] !== undefined) body[key]=bool(body[key]);
  }
  for (const [key,value] of Object.entries(body)) {
    if (typeof value === "string" && ["student","lecturer","attachment_period","academic_year","department","programme","placement","assessment","criterion","category","entry","recipient","user","uploaded_by","week_number","year_of_study","duration_minutes","year_of_study","max_marks","weighting","mark_awarded","hours_worked","minimum_score","maximum_score","order","revision_number"].includes(key)) {
      const n=Number(value); if(Number.isFinite(n)) body[key]=n;
    }
  }
  return body;
}
async function saveUploads(req, collection, id, data) {
  const files=req.files || [];
  for(const file of files) {
    const field=file.fieldname;
    const safeName=(file.originalname||"upload").replace(/[^a-zA-Z0-9._-]/g,"_");
    const path=`private/${collection}/${id}/${Date.now()}-${safeName}`;
    await bucket.file(path).save(file.buffer,{metadata:{contentType:file.mimetype,metadata:{owner_uid:req.authUid,owner_user_id:String(req.user.id),original_name:file.originalname}}});
    data[field]=path;
    await db.collection("file_access").doc(Buffer.from(path).toString("base64url")).set({path,collection,record_id:Number(id),owner_user_id:Number(req.user.id),owner_uid:req.authUid,created_at:now()});
  }
  return data;
}
async function canAccessPlacement(user, placementId) {
  if(isAdmin(user)) return true;
  const ids=await allowedPlacementIds(user);
  return (ids||[]).includes(Number(placementId));
}
function matchSearch(row, q) {
  if(!q) return true;
  return JSON.stringify(row).toLowerCase().includes(String(q).toLowerCase());
}
function filterRows(rows, query) {
  const params=query || {};
  return rows.filter(row=>{
    for(const [key,value] of Object.entries(params)) {
      if(key==="search" || key==="page" || key==="page_size" || value==="") continue;
      let v=value;
      if(["true","false"].includes(String(v))) v=String(v)==="true";
      if(key.endsWith("__in")) {
        const actualKey=key.slice(0,-4), vals=String(v).split(",");
        if(!vals.includes(String(row[actualKey]))) return false;
      } else if(String(row[key])!==String(v) && row[key]!==v) return false;
    }
    return true;
  });
}
async function createOrUpdate(collection, body, user, id=null, req=null) {
  if(collection==="users") return fail(405,"Use the account management workflow.");
  const existing=id ? await getById(collection,id) : null;
  if(id && !existing) fail(404,"Record not found.");
  const adminOnly=["student_profiles","lecturer_profiles","departments","programmes","academic_years","attachment_periods","assessment_categories","assessment_criteria","grading_scales","assignments"];
  if(adminOnly.includes(collection)) assertRole(user,["admin"]);
  if(["notifications","logbook_feedback","audit_logs"].includes(collection)) fail(403,"This record type is written only by approved system workflows.");
  if(collection==="assessments") assertRole(user,["admin","lecturer"]);
  if(collection==="assessment_marks") assertRole(user,["admin","lecturer"]);
  if(collection==="final_results") assertRole(user,["admin","lecturer"]);
  const data={...(existing||{}),...body};
  if(collection==="documents") {
    const requestedPlacement=body.placement ?? existing?.placement;
    if(!requestedPlacement || !(await canAccessPlacement(user,requestedPlacement))) fail(403,"You cannot upload documents to this placement.");
    data.uploaded_by=user.id;
  }
  delete data.id; delete data.created_at; delete data.updated_at;
  if(collection==="placements") {
    delete data.status; delete data.review_feedback; delete data.reviewed_by; delete data.reviewed_at;
    if(isStudent(user)) {
      const sp=await profileFor(user,"student"); if(!sp) fail(400,"Your account does not have a student profile.");
      data.student=sp.id;
      if(existing && !["draft","rejected"].includes(existing.status)) fail(403,"Only draft or rejected placements can be edited.");
      if(!existing) data.status="draft";
    } else if(!isAdmin(user)) fail(403,"Lecturers cannot create placements on behalf of students.");
    if(!existing) data.status="draft";
    if(data.start_date && data.end_date && data.end_date<data.start_date) fail(400,"End date must be on or after the start date.");
    const conflicts=(await docs("placements")).filter(p=>Number(p.student)===Number(data.student)&&Number(p.attachment_period)===Number(data.attachment_period)&&!["rejected","completed"].includes(p.status)&&Number(p.id)!==Number(id));
    if(conflicts.length) fail(400,"An active placement already exists for this student and attachment period.");
  }
  if(collection==="logbooks") {
    delete data.status; delete data.revision_number; delete data.submitted_at; delete data.submitted_by;
    if(!isStudent(user)&&!isAdmin(user)) fail(403,"Only students can create logbook entries.");
    const placement=await getById("placements",data.placement);
    if(!placement) fail(400,"Select a valid placement.");
    if(isStudent(user)) {
      const sp=await profileFor(user,"student");
      if(Number(placement.student)!==Number(sp?.id)) fail(403,"You can only submit logbooks for your own placement.");
      if(!["approved","in_progress"].includes(placement.status)) fail(400,"Logbooks are available after a placement is approved.");
    }
    if(existing && existing.status!=="draft" && !isAdmin(user)) fail(403,"Create a new revision to preserve the submitted logbook history.");
    if(data.period_start && data.period_end && data.period_end<data.period_start) fail(400,"Period end must be on or after period start.");
    if(!existing) {data.revision_number=1;data.status="draft";}
    const duplicate=(await docs("logbooks")).find(x=>Number(x.placement)===Number(data.placement)&&Number(x.week_number)===Number(data.week_number)&&Number(x.revision_number||1)===Number(data.revision_number||1)&&Number(x.id)!==Number(id));
    if(duplicate) fail(400,"A logbook entry already exists for this placement, week and revision.");
  }
  if(collection==="assessments") {
    assertRole(user,["admin","lecturer"]);
    delete data.completed_at; delete data.reschedule_requested; delete data.reschedule_reason; delete data.reschedule_requested_at;
    if(!existing) { data.status=data.status||"scheduled"; data.mode=data.mode||"onsite"; data.duration_minutes=Number(data.duration_minutes||60); }
    if(Number(data.duration_minutes||60)<15 || Number(data.duration_minutes||60)>480) fail(400,"Assessment duration must be between 15 and 480 minutes.");
    const lp=await profileFor(user,"lecturer");
    if(isLecturer(user)) {
      if(!lp) fail(400,"Your lecturer profile is not configured.");
      data.lecturer=lp.id;
    }
    const placement=await getById("placements",data.placement);
    const lecturer=await getById("lecturer_profiles",data.lecturer);
    if(!placement||!lecturer) fail(400,"Choose a valid placement and lecturer.");
    if(isLecturer(user)) {
      const assignments=await assignmentsForLecturer(user);
      if(!assignments.some(a=>Number(a.student)===Number(placement.student)&&Number(a.attachment_period)===Number(placement.attachment_period))) fail(403,"You can only schedule assessments for students assigned to you.");
    } else {
      const assigned=(await docs("assignments")).some(a=>a.is_active!==false&&Number(a.student)===Number(placement.student)&&Number(a.lecturer)===Number(data.lecturer)&&Number(a.attachment_period)===Number(placement.attachment_period));
      if(!assigned) fail(400,"The lecturer must be assigned to this student and attachment period.");
    }
    const date=data.assessment_date, start=data.start_time, mins=Number(data.duration_minutes||60);
    const startM=Number(start?.slice(0,2))*60+Number(start?.slice(3,5));
    const endM=startM+mins;
    const conflict=(await docs("assessments")).find(a=>Number(a.lecturer)===Number(data.lecturer)&&a.assessment_date===date&&a.status!=="cancelled"&&Number(a.id)!==Number(id)&&(()=>{const s=Number(a.start_time?.slice(0,2))*60+Number(a.start_time?.slice(3,5));const e=s+Number(a.duration_minutes||60);return startM<e&&s<endM;})());
    if(conflict) fail(400,`This lecturer already has an assessment from ${conflict.start_time} on this date.`);
  }
  if(collection==="assessment_marks") {
    assertRole(user,["admin","lecturer"]);
    const assessment=await getById("assessments",data.assessment), criterion=await getById("assessment_criteria",data.criterion);
    if(!assessment||!criterion) fail(400,"Choose a valid assessment and criterion.");
    if(Number(data.mark_awarded)>Number(criterion.max_marks) || Number(data.mark_awarded)<0) fail(400,`Mark must be between 0 and ${criterion.max_marks}.`);
    const duplicate=(await docs("assessment_marks")).find(m=>Number(m.assessment)===Number(data.assessment)&&Number(m.criterion)===Number(data.criterion)&&Number(m.id)!==Number(id));
    if(duplicate) fail(400,"A mark already exists for this assessment criterion. Edit the existing mark instead.");
    if(isLecturer(user)) {
      const lp=await profileFor(user,"lecturer");
      if(Number(assessment.lecturer)!==Number(lp?.id)) fail(403,"You can only mark your own assessments.");
    }
    const placement=await getById("placements",assessment.placement);
    const result=(await docs("final_results")).find(r=>Number(r.placement)===Number(placement?.id));
    if(result && ["finalized","published"].includes(result.status) && !isAdmin(user)) fail(403,"Finalized results are locked. Ask an administrator to authorize a change.");
    data.entered_by=user.id;
  }
  if(collection==="assignments") {
    assertRole(user,["admin"]);
    if(!existing) data.is_active=data.is_active!==false;
    data.assigned_by=user.id;
    if(!await getById("student_profiles",data.student) || !await getById("lecturer_profiles",data.lecturer) || !await getById("attachment_periods",data.attachment_period)) fail(400,"Select a valid student, lecturer and attachment period.");
    const existingActive=(await docs("assignments")).find(a=>a.is_active!==false&&Number(a.student)===Number(data.student)&&Number(a.attachment_period)===Number(data.attachment_period)&&Number(a.id)!==Number(id));
    if(existingActive) fail(400,"This student already has an active lecturer assignment for this attachment period.");
  }
  if(collection==="student_profiles") {
    assertRole(user,["admin"]);
    const u=await getById("users",data.user); if(!u||u.role!=="student") fail(400,"The selected user must have the student role.");
    const duplicate=(await docs("student_profiles")).find(p=>Number(p.user)===Number(data.user)&&Number(p.id)!==Number(id));
    if(duplicate) fail(400,"This user already has a student profile.");
    if((await docs("student_profiles")).some(p=>p.registration_number===data.registration_number&&Number(p.id)!==Number(id))) fail(400,"This registration number is already in use.");
  }
  if(collection==="lecturer_profiles") {
    assertRole(user,["admin"]);
    const u=await getById("users",data.user); if(!u||u.role!=="lecturer") fail(400,"The selected user must have the lecturer role.");
    const duplicate=(await docs("lecturer_profiles")).find(p=>Number(p.user)===Number(data.user)&&Number(p.id)!==Number(id));
    if(duplicate) fail(400,"This user already has a lecturer profile.");
    if((await docs("lecturer_profiles")).some(p=>p.staff_number===data.staff_number&&Number(p.id)!==Number(id))) fail(400,"This staff number is already in use.");
  }
  if(collection==="final_results") {
    assertRole(user,["admin","lecturer"]);
    if(existing && ["finalized","published"].includes(existing.status) && !isAdmin(user)) fail(403,"Only an administrator can change a finalized result.");
    delete data.final_score; delete data.grade; delete data.status; delete data.finalized_by; delete data.finalized_at; delete data.published_at;
    if(existing && existing.placement!==undefined && Number(data.placement)!==Number(existing.placement)) fail(400,"A result record cannot be moved to another placement.");
    if(!existing) {
      if((await docs("final_results")).some(r=>Number(r.placement)===Number(data.placement))) fail(400,"A result record already exists for this placement.");
      data.status="draft"; data.final_score=null; data.grade="";
    }
    if(isLecturer(user) && !(await allowedPlacementIds(user)||[]).includes(Number(data.placement))) fail(403,"You are not assigned to this placement.");
  }
  const docId=id || await nextId(collection);
  const stamp=now();
  const finalData={...(existing||{}),...data,id:Number(docId),created_at:existing?.created_at||stamp,updated_at:stamp};
  if(collection==="assessments" && existing && existing.reschedule_requested &&
     ((data.assessment_date && data.assessment_date!==existing.assessment_date) ||
      (data.start_time && data.start_time!==existing.start_time))) {
    finalData.reschedule_requested=false;
    finalData.reschedule_reason="";
    finalData.reschedule_requested_at=null;
  }
  if(collection==="assessments" && finalData.status==="completed" && !finalData.completed_at) finalData.completed_at=stamp;
  if(req) await saveUploads(req,collection,docId,finalData);
  await save(collection,docId,finalData);
  if(collection==="student_profiles") {
    const u=await getById("users",finalData.user); if(u) await save("users",u.id,{...u,student_profile_id:Number(docId),updated_at:stamp});
  }
  if(collection==="lecturer_profiles") {
    const u=await getById("users",finalData.user); if(u) await save("users",u.id,{...u,lecturer_profile_id:Number(docId),updated_at:stamp});
  }
  if(collection==="assessment_marks") {
    const a=await getById("assessments",finalData.assessment), p=a?await getById("placements",a.placement):null;
    if(isAdmin(user)&&p) {
      const result=(await docs("final_results")).find(r=>Number(r.placement)===Number(p.id));
      if(result&&["finalized","published"].includes(result.status)) {
        await save("final_results",result.id,{...result,final_score:null,grade:"",status:"draft",finalized_by:null,finalized_at:null,published_at:null,updated_at:stamp});
        await notify(p.student,"Attachment result reopened for review","An authorized mark change was made. Your official result will be available again after recalculation and publication.","warning","/results");
      }
    }
  }
  if(collection==="assignments"&&!existing) {
    const sp=await getById("student_profiles",finalData.student), lp=await getById("lecturer_profiles",finalData.lecturer);
    await notify(sp?.user,"Lecturer assigned",`${fullName(await getById("users",lp?.user))} has been assigned as your academic supervisor.`,"success","/placement");
  }
  await audit(user,`${collection.replaceAll("_","-")}_${existing?"updated":"created"}`,collection,docId);
  return finalData;
}
async function updateUser(id, body, actor, req) {
  assertRole(actor,["admin"]);
  const user=await getById("users",id); if(!user) fail(404,"Account not found.");
  const allowed={...body}; delete allowed.password; delete allowed.id; delete allowed.auth_uid;
  const patch={...user,...allowed,updated_at:now()};
  if(allowed.email && allowed.email!==user.email) await auth.updateUser(user.auth_uid,{email:allowed.email});
  if(allowed.is_active!==undefined) await auth.updateUser(user.auth_uid,{disabled:allowed.is_active===false});
  if(body.password) await auth.updateUser(user.auth_uid,{password:body.password});
  await save("users",id,patch);
  await audit(actor,"user_updated","users",id,{role:patch.role});
  return patch;
}
async function createUser(body, actor) {
  assertRole(actor,["admin"]);
  const email=String(body.email||"").trim().toLowerCase();
  const password=String(body.password||"");
  if(!email || !password) fail(400,"Email and a temporary password are required.");
  if(password.length<8) fail(400,"Password must contain at least 8 characters.");
  const emailUser=(await docs("users")).find(u=>u.email?.toLowerCase()===email);
  if(emailUser) fail(400,"This email address is already in use.");
  let created;
  try {
    created=await auth.createUser({email,password,displayName:[body.first_name,body.last_name].filter(Boolean).join(" "),disabled:body.is_active===false});
    const id=await nextId("users"), stamp=now();
    const user={id,auth_uid:created.uid,username:String(body.username||email.split("@")[0]),email,first_name:body.first_name||"",last_name:body.last_name||"",role:body.role||"student",phone:body.phone||"",is_active:body.is_active!==false,date_joined:stamp,created_at:stamp,updated_at:stamp};
    if(!["student","lecturer","admin"].includes(user.role)) fail(400,"Choose a valid account role.");
    await save("users",id,user);
    await audit(actor,"user_created","users",id,{role:user.role});
    return user;
  } catch(e) {
    if(created?.uid) await auth.deleteUser(created.uid).catch(()=>{});
    if(e instanceof HttpError) throw e;
    if(e.code==="auth/email-already-exists") fail(400,"This email address is already in use.");
    throw e;
  }
}
async function deleteRecord(collection,id,user) {
  const row=await getById(collection,id); if(!row) fail(404,"Record not found.");
  if(collection==="users") {
    assertRole(user,["admin"]);
    if(row.auth_uid) await auth.deleteUser(row.auth_uid).catch(()=>{});
  } else if(collection==="placements") {
    if(!isAdmin(user)) {
      const sp=await profileFor(user,"student");
      if(!isStudent(user)||Number(row.student)!==Number(sp?.id)||row.status!=="draft") fail(403,"You cannot delete this placement.");
    }
  } else if(collection==="logbooks") {
    const sp=await profileFor(user,"student");
    if(!isAdmin(user)&&(!isStudent(user)||Number((await getById("placements",row.placement))?.student)!==Number(sp?.id)||row.status!=="draft")) fail(403,"Only draft logbooks can be deleted by a student.");
  } else if(["departments","programmes","academic_years","attachment_periods","assessment_categories","assessment_criteria","grading_scales","assignments"].includes(collection)) assertRole(user,["admin"]);
  else if(collection==="assessments") assertRole(user,["admin","lecturer"]);
  else fail(403,"You do not have permission to delete this record.");
  await audit(user,`${collection}_deleted`,collection,id);
  await db.collection(collection).doc(String(id)).delete();
  return {deleted:true};
}
async function action(collection,id,actionName,body,user) {
  const row=await getById(collection,id); if(!row) fail(404,"Record not found.");
  if(collection==="placements") {
    const sp=await profileFor(user,"student");
    if(actionName==="submit") {
      if(!isStudent(user)||Number(row.student)!==Number(sp?.id)) fail(403,"Only the owner can submit this placement.");
      if(!["draft","rejected"].includes(row.status)) fail(400,"This placement cannot be submitted in its current state.");
      row.status="submitted"; await save(collection,id,{...row,updated_at:now()});
      await notifyAdmins("Placement submitted",`${fullName(await getById("users",sp.user))} submitted a placement at ${row.company_name}.`,"info","/placements");
      await audit(user,"placement_submitted",collection,id);
    } else if(actionName==="review") {
      assertRole(user,["admin"]);
      const decision=body.decision, feedback=String(body.feedback||"").trim();
      if(!["approved","rejected"].includes(decision)) fail(400,"Choose approved or rejected.");
      if(decision==="rejected"&&!feedback) fail(400,"Feedback is required when rejecting a placement.");
      row={...row,status:decision,review_feedback:feedback,reviewed_by:user.id,reviewed_at:now(),updated_at:now()};
      await save(collection,id,row);
      await notify((await getById("student_profiles",row.student))?.user,`Placement ${decision}`,feedback||`Your placement at ${row.company_name} has been approved.`,decision==="approved"?"success":"warning","/placement");
      await audit(user,`placement_${decision}`,collection,id,{feedback});
    } else if(actionName==="transition") {
      assertRole(user,["admin"]);
      const status=body.status;
      if(!["under_review","in_progress","completed"].includes(status)) fail(400,"Choose under_review, in_progress or completed.");
      row={...row,status,updated_at:now()}; await save(collection,id,row);
      await notify((await getById("student_profiles",row.student))?.user,"Placement status updated",`Your placement status is now ${status.replaceAll("_"," ")}.`,"info","/placement");
      await audit(user,"placement_status_changed",collection,id,{status});
    } else fail(404,"Action not found.");
  } else if(collection==="assessments" && actionName==="request-reschedule") {
    const sp=await profileFor(user,"student"), placement=await getById("placements",row.placement);
    if(!isStudent(user)||Number(placement?.student)!==Number(sp?.id)) fail(403,"Only the student assigned to this assessment can request a reschedule.");
    if(!["scheduled","rescheduled"].includes(row.status)) fail(400,"Only upcoming scheduled assessments can be rescheduled.");
    if(row.reschedule_requested) fail(400,"A reschedule request is already awaiting a decision.");
    const reason=String(body.reason||"").trim(); if(reason.length<8) fail(400,"Please provide a short reason (at least 8 characters).");
    row={...row,reschedule_requested:true,reschedule_reason:reason,reschedule_requested_at:now(),updated_at:now()}; await save(collection,id,row);
    const lp=await getById("lecturer_profiles",row.lecturer);
    await notify(lp?.user,"Assessment reschedule requested",`${fullName(user)} requested a new time for ${row.assessment_type} on ${row.assessment_date}. Reason: ${reason}`,"warning","/assessments");
    await notifyAdmins("Assessment reschedule request",`${fullName(user)} requested a new time for ${row.assessment_type} on ${row.assessment_date}.`,"warning","/assessments");
    await audit(user,"assessment_reschedule_requested",collection,id,{reason});
  } else if(collection==="logbooks" && actionName==="submit") {
    const sp=await profileFor(user,"student"), placement=await getById("placements",row.placement);
    if(!isStudent(user)||Number(placement?.student)!==Number(sp?.id)) fail(403,"Only the student can submit this logbook.");
    if(!["draft","requires_revision"].includes(row.status)) fail(400,"This entry cannot be submitted in its current state.");
    const latest=(await docs("logbooks")).filter(x=>Number(x.placement)===Number(row.placement)&&Number(x.week_number)===Number(row.week_number)&&Number(x.id)!==Number(id)).sort((a,b)=>Number(b.revision_number)-Number(a.revision_number))[0];
    if(latest && Number(row.revision_number)<=Number(latest.revision_number)) fail(400,"Create a new revision to preserve the previous submission.");
    row={...row,status:"submitted",submitted_at:now(),submitted_by:user.id,updated_at:now()}; await save(collection,id,row);
    const assignment=(await docs("assignments")).find(a=>Number(a.student)===Number(placement.student)&&Number(a.attachment_period)===Number(placement.attachment_period)&&a.is_active!==false);
    if(assignment) await notify((await getById("lecturer_profiles",assignment.lecturer))?.user,"Logbook submitted",`${fullName(user)} submitted week ${row.week_number} for review.`,"feedback","/logbooks");
    await audit(user,"logbook_submitted",collection,id);
  } else if(collection==="logbooks" && actionName==="revise") {
    const sp=await profileFor(user,"student"), placement=await getById("placements",row.placement);
    if(!isStudent(user)||Number(placement?.student)!==Number(sp?.id)) fail(403,"Only the owner can create a revision.");
    if(row.status!=="requires_revision") fail(400,"A new revision can only be created when corrections have been requested.");
    const latest=Math.max(...(await docs("logbooks")).filter(x=>Number(x.placement)===Number(row.placement)&&Number(x.week_number)===Number(row.week_number)).map(x=>Number(x.revision_number||1)),Number(row.revision_number||1));
    const revision=await createRecord("logbooks",{placement:row.placement,week_number:row.week_number,revision_number:latest+1,period_start:row.period_start,period_end:row.period_end,activities:row.activities,skills_acquired:row.skills_acquired, challenges:row.challenges,lessons_learned:row.lessons_learned,hours_worked:row.hours_worked,student_comments:row.student_comments,attachment:row.attachment||"",status:"draft"});
    await audit(user,"logbook_revision_created",collection,revision.id,{previous_revision:row.revision_number});
    return enrich("logbooks",revision);
  } else if(collection==="logbooks" && actionName==="feedback") {
    assertRole(user,["admin","lecturer"]);
    const profile=await profileFor(user,"lecturer"), placement=await getById("placements",row.placement);
    if(!isAdmin(user)) {
      const as=await assignmentsForLecturer(user);
      if(!as.some(a=>Number(a.student)===Number(placement?.student)&&Number(a.attachment_period)===Number(placement?.attachment_period))) fail(403,"You are not assigned to this student.");
    }
    const comments=String(body.comments||"").trim(), revision=bool(body.requests_revision);
    if(!comments) fail(400,"Feedback comments are required.");
    if(!profile) fail(400,"An active lecturer profile is required to provide feedback.");
    const fb=await createRecord("logbook_feedback",{entry:Number(id),lecturer:profile.id,comments,requests_revision:revision});
    row={...row,status:revision?"requires_revision":"approved",updated_at:now()}; await save(collection,id,row);
    await notify((await getById("student_profiles",placement.student))?.user,"Logbook feedback received",comments,revision?"warning":"success","/logbooks");
    await audit(user,"logbook_feedback_added",collection,id,{requests_revision:revision});
    return enrich("logbook_feedback",fb);
  } else if(collection==="final_results" && actionName==="finalize") {
    assertRole(user,["admin"]);
    const criteria=(await docs("assessment_criteria")).filter(c=>c.is_active!==false);
    const total=criteria.reduce((sum,c)=>sum+Number(c.weighting||0),0);
    if(!criteria.length) fail(400,"Configure assessment criteria before finalizing results.");
    if(Math.abs(total-100)>0.0001) fail(400,`Active criterion weightings must total 100. Current total: ${total}.`);
    const assessments=(await docs("assessments")).filter(a=>Number(a.placement)===Number(row.placement));
    const marks=(await docs("assessment_marks")).filter(m=>m.is_final&&assessments.some(a=>Number(a.id)===Number(m.assessment)));
    const missing=criteria.filter(c=>c.is_required && !marks.some(m=>Number(m.criterion)===Number(c.id)));
    if(missing.length) fail(400,`Required criteria are missing final marks: ${missing.map(c=>c.name).join(", ")}`);
    let score=0;
    for(const c of criteria) {
      const matched=marks.filter(m=>Number(m.criterion)===Number(c.id));
      if(!matched.length) continue;
      const ratios=matched.map(m=>Number(m.mark_awarded)/Number(c.max_marks));
      score+=(ratios.reduce((a,b)=>a+b,0)/ratios.length)*Number(c.weighting);
    }
    score=Math.round((score+Number.EPSILON)*100)/100;
    const grade=(await docs("grading_scales")).filter(g=>g.is_active!==false&&score>=Number(g.minimum_score)&&score<=Number(g.maximum_score)).sort((a,b)=>Number(b.minimum_score)-Number(a.minimum_score))[0];
    row={...row,final_score:score,grade:grade?.label||"",status:"finalized",finalized_by:user.id,finalized_at:now(),updated_at:now()};
    await save(collection,id,row); await audit(user,"result_finalized",collection,id,{score:String(score),grade:row.grade});
  } else if(collection==="final_results" && actionName==="publish") {
    assertRole(user,["admin"]);
    if(row.status!=="finalized") fail(400,"Finalize the result before publishing it.");
    row={...row,status:"published",published_at:now(),updated_at:now()}; await save(collection,id,row);
    const p=await getById("placements",row.placement);
    await notify((await getById("student_profiles",p?.student))?.user,"Final attachment result published",`Your final attachment score is ${row.final_score}. Open Results to view the breakdown.`,"result","/results");
    await audit(user,"result_published",collection,id);
  } else if(collection==="notifications" && (actionName==="mark_read" || actionName==="mark-read")) {
    if(Number(row.recipient)!==Number(user.id)) fail(403,"You cannot update this notification.");
    if(!row.read_at) { row={...row,read_at:now(),updated_at:now()}; await save(collection,id,row); }
  } else fail(404,"Action not found.");
  return enrich(collection,await getById(collection,id));
}

async function createOrPatchUserSelf(req) {
  const body=parseInput(req), user=req.user;
  const patch={};
  ["first_name","last_name","email","phone"].forEach(k=>{if(body[k]!==undefined)patch[k]=body[k]});
  if(patch.email && patch.email.toLowerCase()!==user.email?.toLowerCase()) await auth.updateUser(req.authUid,{email:patch.email.toLowerCase()});
  patch.email=(patch.email||user.email||"").toLowerCase();
  patch.updated_at=now();
  const updated={...user,...patch};
  if(req.files?.length) await saveUploads(req,"users",user.id,updated);
  await save("users",user.id,updated);
  return updated;
}
async function dashboard(user) {
  const today=new Date().toISOString().slice(0,10);
  const placements=await scopedRows("placements",user), assessments=await scopedRows("assessments",user), logbooks=await scopedRows("logbooks",user);
  const results=await scopedRows("final_results",user);
  const notifs=await scopedRows("notifications",user);
  if(isAdmin(user)) {
    const users=await docs("users"),studentProfiles=await docs("student_profiles"),lecturerProfiles=await docs("lecturer_profiles");
    const activePlacements=placements.filter(p=>["approved","in_progress"].includes(p.status));
    const cards=[
      {label:"Registered students",value:studentProfiles.length,icon:"users",tone:"blue"},
      {label:"Lecturers",value:lecturerProfiles.length,icon:"graduation-cap",tone:"violet"},
      {label:"Pending placements",value:placements.filter(p=>["submitted","under_review"].includes(p.status)).length,icon:"clipboard-check",tone:"amber"},
      {label:"Students on attachment",value:activePlacements.length,icon:"briefcase-business",tone:"green"},
      {label:"Scheduled assessments",value:assessments.filter(a=>["scheduled","rescheduled"].includes(a.status)).length,icon:"calendar-days",tone:"blue"},
      {label:"Logbooks to review",value:logbooks.filter(l=>["submitted","under_review"].includes(l.status)).length,icon:"book-open-check",tone:"rose"},
      {label:"Results to finalize",value:results.filter(r=>["draft","pending_review"].includes(r.status)).length,icon:"award",tone:"violet"},
    ];
    const departmentCounts=new Map();
    for(const sp of studentProfiles) {
      const department=await getById("departments",sp.department);
      const label=department?.name||"Unassigned";
      departmentCounts.set(label,(departmentCounts.get(label)||0)+1);
    }
    const placementCounts=new Map();
    for(const p of placements) {
      const label=String(p.status||"unknown").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
      placementCounts.set(label,(placementCounts.get(label)||0)+1);
    }
    const auditEntries=(await docs("audit_logs")).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,8);
    const recent_activity=await Promise.all(auditEntries.map(async a=>({
      id:a.id,title:String(a.action||"activity").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase()),
      description:`${a.entity_type} #${a.entity_id}`,time:a.created_at,
      actor:a.actor?fullName(await getById("users",a.actor)):"System"
    })));
    return {role:"admin",cards,charts:{
      departments:[...departmentCounts.entries()].map(([label,value])=>({label,value})).sort((a,b)=>a.label.localeCompare(b.label)),
      placements:[...placementCounts.entries()].map(([label,value])=>({label,value})).sort((a,b)=>a.label.localeCompare(b.label))
    },recent_activity};
  }
  if(isLecturer(user)) {
    const lp=await profileFor(user,"lecturer"), assigned=await assignmentsForLecturer(user);
    const cards=[
      {label:"Assigned students",value:new Set(assigned.map(a=>a.student)).size,icon:"users",tone:"blue"},
      {label:"Upcoming assessments",value:assessments.filter(a=>["scheduled","rescheduled"].includes(a.status)&&a.assessment_date>=today).length,icon:"calendar-days",tone:"violet"},
      {label:"Assessments completed",value:assessments.filter(a=>a.status==="completed").length,icon:"check-circle-2",tone:"green"},
      {label:"Logbooks to review",value:logbooks.filter(l=>["submitted","under_review"].includes(l.status)).length,icon:"book-open-check",tone:"amber"},
      {label:"Reschedule requests",value:assessments.filter(a=>a.reschedule_requested).length,icon:"calendar-clock",tone:"rose"},
      {label:"Results awaiting review",value:results.filter(r=>["draft","pending_review"].includes(r.status)).length,icon:"award",tone:"rose"},
    ];
    const studentIds=[...new Set(assigned.map(a=>Number(a.student)))].slice(0,12);
    const students=await Promise.all(studentIds.map(async id=>{const p=await studentDetails(id), active=placements.filter(x=>Number(x.student)===id).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0];return {id,name:p?.user_details?.full_name||"",registration_number:p?.registration_number||"",department:p?.department_name||"",programme:p?.programme_name||"",placement_status:active?.status||"not registered"};}));
    return {role:"lecturer",cards,students,upcoming_assessments:await Promise.all(assessments.filter(a=>["scheduled","rescheduled"].includes(a.status)&&a.assessment_date>=today).sort((a,b)=>`${a.assessment_date} ${a.start_time}`.localeCompare(`${b.assessment_date} ${b.start_time}`)).slice(0,6).map(a=>enrich("assessments",a)))};
  }
  const sp=await profileFor(user,"student");
  const own=placements.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at)))[0]||null;
  const result=results.find(r=>Number(r.placement)===Number(own?.id)&&r.status==="published")||null;
  const upcoming=assessments.filter(a=>["scheduled","rescheduled"].includes(a.status)&&a.assessment_date>=today);
  const steps=["Placement registration","Placement approval","Logbook submissions","Assessments","Final result"];
  let completed=0;
  if(own&&!["draft","submitted","under_review","rejected"].includes(own.status)) completed++;
  if(own&&["approved","in_progress","completed"].includes(own.status)) completed++;
  if(logbooks.some(l=>l.status==="approved")) completed++;
  if(assessments.some(a=>a.status==="completed")) completed++;
  if(result) completed++;
  const cards=[
    {label:"Placement status",value:own?String(own.status).replaceAll("_"," "):"Not registered",icon:"briefcase-business",tone:"blue"},
    {label:"Progress",value:`${Math.round(completed/steps.length*100)}%`,icon:"chart-no-axes-combined",tone:"green"},
    {label:"Logbook entries",value:logbooks.length,icon:"book-open",tone:"violet"},
    {label:"Awaiting review",value:logbooks.filter(l=>["submitted","under_review"].includes(l.status)).length,icon:"clock-3",tone:"amber"},
    {label:"Upcoming assessments",value:upcoming.length,icon:"calendar-days",tone:"rose"},
    {label:"Final score",value:result?.final_score!==undefined&&result?.final_score!==null?String(result.final_score):"Not published",icon:"award",tone:"blue"},
  ];
  return {role:"student",cards,progress:{completed,total:steps.length,steps},placement:own?await enrich("placements",own):null,upcoming_assessments:await Promise.all(upcoming.slice(0,6).map(a=>enrich("assessments",a))),recent_notifications:await Promise.all(notifs.sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,5).map(n=>enrich("notifications",n)))};
}
function csvCell(value) { const s=String(value ?? ""); return `"${s.replaceAll('"','""')}"`; }
async function report(req,res,type) {
  assertRole(req.user,["admin","lecturer","student"]);
  const allowed=["placements","assessments","logbooks","results","students"];
  if(!allowed.includes(type)) fail(404,"Unknown report.");
  const collection={placements:"placements",assessments:"assessments",logbooks:"logbooks",results:"final_results",students:"student_profiles"}[type];
  const rows=await scopedRows(collection,req.user);
  const enriched=await Promise.all(rows.map(x=>enrich(collection,x)));
  const fields=type==="placements"?["id","company_name","status","start_date","end_date","student"]:type==="assessments"?["id","assessment_type","assessment_date","start_time","status","placement"]:type==="logbooks"?["id","week_number","period_start","period_end","status","placement"]:type==="results"?["id","placement","final_score","grade","status"]:["id","registration_number","department_name","programme_name"];
  const output=[fields.join(","),...enriched.map(r=>fields.map(f=>csvCell(r[f])).join(","))].join("\n");
  if(req.query.format==="pdf") {
    res.setHeader("Content-Type","application/pdf"); res.setHeader("Content-Disposition",`attachment; filename=internship-${type}.pdf`);
    const pdf=new PDFDocument({margin:40}); pdf.pipe(res); pdf.fontSize(18).text(`Attachly — ${type} report`); pdf.moveDown();
    pdf.fontSize(8).text(output.replaceAll(",","   ").replaceAll('"',""),{width:520}); pdf.end(); return;
  }
  res.setHeader("Content-Type","text/csv; charset=utf-8"); res.setHeader("Content-Disposition",`attachment; filename=internship-${type}.csv`); res.send(output);
}
app.all("*",async(req,res)=>{
  try {
    const path=req.path.replace(/\/+$/,"") || "/";
    const method=req.method.toUpperCase();
    const body=parseInput(req);
    if(path==="/auth/me" && method==="GET") return res.json(await enrich("users",req.user));
    if(path==="/auth/me" && method==="PATCH") return res.json(await enrich("users",await createOrPatchUserSelf(req)));
    if(path==="/dashboard" && method==="GET") return res.json(await dashboard(req.user));
    const reportMatch=path.match(/^\/reports\/([a-z-]+)$/);
    if(reportMatch && method==="GET") return report(req,res,reportMatch[1]);
    if(path==="/notifications/mark_all_read" && method==="POST") {
      const list=(await docs("notifications")).filter(n=>Number(n.recipient)===Number(req.user.id)&&!n.read_at);
      await Promise.all(list.map(n=>save("notifications",n.id,{...n,read_at:now(),updated_at:now()})));
      return res.json({updated:list.length});
    }
    if(path==="/files/download" && method==="GET") {
      const filePath=String(req.query.path||"");
      const meta=(await docs("file_access")).find(x=>x.path===filePath);
      if(!meta) fail(404,"File not found.");
      let allowed=false;
      if(meta.collection==="users") allowed=Number(meta.owner_user_id)===Number(req.user.id)||isAdmin(req.user);
      else if(meta.collection==="placements") allowed=await canAccessPlacement(req.user,meta.record_id);
      else if(meta.collection==="logbooks") {const entry=await getById("logbooks",meta.record_id);allowed=entry?await canAccessPlacement(req.user,entry.placement):false;}
      else if(meta.collection==="documents") {const doc=await getById("documents",meta.record_id);allowed=doc?await canAccessPlacement(req.user,doc.placement):false;}
      if(!allowed) fail(403,"You are not allowed to download this file.");
      const [buffer]=await bucket.file(filePath).download();
      res.setHeader("Content-Type","application/octet-stream"); res.setHeader("Content-Disposition",`attachment; filename="${filePath.split("/").pop().replace(/"/g,"")}"`); return res.send(buffer);
    }
    const actionMatch=path.match(/^\/([a-z-]+)\/(\d+)\/([a-z_-]+)$/);
    if(actionMatch && method==="POST") {
      const [,slug,id,actionName]=actionMatch, collection=COLLECTIONS[slug];
      if(!collection) fail(404,"Unknown endpoint.");
      const result=await action(collection,Number(id),actionName,body,req.user);
      return res.json(result);
    }
    const match=path.match(/^\/([a-z-]+)(?:\/(\d+))?$/);
    if(!match) fail(404,"Endpoint not found.");
    const [,slug,id]=match, collection=COLLECTIONS[slug];
    if(!collection) fail(404,"Unknown endpoint.");
    if(method==="GET") {
      if(id) {
        const row=await getById(collection,id);
        if(!row) fail(404,"Record not found.");
        const scoped=(await scopedRows(collection,req.user)).some(x=>Number(x.id)===Number(id));
        if(!scoped) fail(403,"You cannot view this record.");
        return res.json(await enrich(collection,row));
      }
      if(slug==="users") assertRole(req.user,["admin"]);
      if(slug==="audit-logs") assertRole(req.user,["admin"]);
      if(["departments","programmes","academic-years","attachment-periods","assessment-categories","assessment-criteria","grading-scales"].includes(slug)) {
        // Academic configuration is readable to authenticated users.
      }
      let rows=await scopedRows(collection,req.user);
      if(isAdmin(req.user) && collection==="users") rows=await docs("users");
      rows=filterRows(rows,req.query);
      let enriched=await Promise.all(rows.map(r=>enrich(collection,r)));
      if(req.query.search) enriched=enriched.filter(row=>matchSearch(row,req.query.search));
      if(collection==="assessments") enriched.sort((a,b)=>`${a.assessment_date||""} ${a.start_time||""}`.localeCompare(`${b.assessment_date||""} ${b.start_time||""}`));
      else if(collection==="grading_scales") enriched.sort((a,b)=>Number(b.minimum_score||0)-Number(a.minimum_score||0));
      else if(collection==="attachment_periods") enriched.sort((a,b)=>String(b.starts_on||"").localeCompare(String(a.starts_on||"")));
      else if(collection==="programmes") enriched.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
      else if(collection==="logbooks") enriched.sort((a,b)=>String(b.period_start||"").localeCompare(String(a.period_start||""))||Number(b.revision_number||1)-Number(a.revision_number||1));
      else if(collection==="assignments") enriched.sort((a,b)=>String(a.student_details?.user_details?.last_name||"").localeCompare(String(b.student_details?.user_details?.last_name||"")));
      else enriched.sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||"")));
      return res.json(enriched);
    }
    if(method==="POST") {
      if(id) fail(405,"Unsupported action.");
      if(slug==="users") {
        const user=await createUser(body,req.user);
        return res.status(201).json(await enrich("users",user));
      }
      const created=await createOrUpdate(collection,body,req.user,null,req);
      if(collection==="assessments") {
        const placement=await getById("placements",created.placement);
        if(placement) await notify((await getById("student_profiles",placement.student))?.user,"Assessment scheduled",`${created.assessment_type} is scheduled for ${created.assessment_date} at ${created.start_time}.`,"assessment","/assessments");
      }
      return res.status(201).json(await enrich(collection,created));
    }
    if(method==="PATCH" || method==="PUT") {
      if(!id) fail(405,"Record ID required.");
      if(slug==="users") {
        const updated=await updateUser(Number(id),body,req.user,req);
        return res.json(await enrich("users",updated));
      }
      const scoped=(await scopedRows(collection,req.user)).some(x=>Number(x.id)===Number(id));
      if(!scoped) {
        // Students may edit their own draft placement or logbook, which are scoped already.
        fail(403,"You cannot update this record.");
      }
      const previous=collection==="assessments"?await getById(collection,id):null;
      const updated=await createOrUpdate(collection,body,req.user,Number(id),req);
      if(collection==="assessments") {
        const placement=await getById("placements",updated.placement);
        const scheduleChanged=previous && (previous.assessment_date!==updated.assessment_date || previous.start_time!==updated.start_time);
        if(placement) await notify((await getById("student_profiles",placement.student))?.user,"Assessment updated",`Your assessment has been updated to ${updated.assessment_date} at ${updated.start_time}.`,"assessment","/assessments");
        if(scheduleChanged && updated.reschedule_requested===false) {
          // The previous reschedule request was cleared because the scheduled time changed.
        }
      }
      return res.json(await enrich(collection,updated));
    }
    if(method==="DELETE") {
      if(!id) fail(405,"Record ID required.");
      return res.json(await deleteRecord(collection,Number(id),req.user));
    }
    fail(405,"Method not allowed.");
  } catch(error) {
    console.error("Attachly API error:",error);
    const status=error.status||500;
    const message=status>=500?"The server could not complete your request. Check the Firebase Function logs for details.":error.message;
    return res.status(status).json({detail:message,...(error.field?{[error.field]:message}:{})});
  }
});

exports.api = onRequest({ region:"us-central1", cors:true, maxInstances:10, memory:"512MiB", timeoutSeconds:60 }, app);
