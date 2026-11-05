const admin = require("firebase-admin");

const projectId = process.env.FIREBASE_PROJECT_ID;
const email = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD || "";
if (!projectId || !email || !password) {
  console.error("Set FIREBASE_PROJECT_ID, ADMIN_EMAIL and ADMIN_PASSWORD in .env before running this script.");
  process.exit(1);
}
if (password.length < 8) {
  console.error("ADMIN_PASSWORD must contain at least 8 characters.");
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.applicationDefault(),
  projectId,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
});
const db = admin.firestore();

async function nextUserId() {
  const ref = db.collection("_counters").doc("users");
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const value = (snap.exists ? Number(snap.data().value || 0) : 0) + 1;
    tx.set(ref, { value }, { merge: true });
    return value;
  });
}

async function main() {
  let authUser;
  try {
    authUser = await admin.auth().getUserByEmail(email);
    authUser = await admin.auth().updateUser(authUser.uid, { disabled: false, password });
  } catch (error) {
    if (error.code !== "auth/user-not-found") throw error;
    authUser = await admin.auth().createUser({
      email,
      password,
      displayName: `${process.env.ADMIN_FIRST_NAME || "System"} ${process.env.ADMIN_LAST_NAME || "Administrator"}`,
    });
  }

  const existing = await db.collection("users").where("auth_uid", "==", authUser.uid).limit(1).get();
  if (!existing.empty) {
    const old = existing.docs[0].data();
    await existing.docs[0].ref.set({ ...old, role: "admin", is_active: true, updated_at: new Date().toISOString() }, { merge: true });
    console.log(`Existing account ${email} has been granted administrator role.`);
  } else {
    const id = await nextUserId();
    const stamp = new Date().toISOString();
    await db.collection("users").doc(String(id)).set({
      id,
      auth_uid: authUser.uid,
      username: process.env.ADMIN_USERNAME || email.split("@")[0],
      email,
      first_name: process.env.ADMIN_FIRST_NAME || "System",
      last_name: process.env.ADMIN_LAST_NAME || "Administrator",
      role: "admin",
      phone: "",
      is_active: true,
      date_joined: stamp,
      created_at: stamp,
      updated_at: stamp,
    });
    console.log(`Administrator account provisioned: ${email}`);
  }
  console.log("You can now sign in to Attachly with this email and password.");
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error);
  process.exit(1);
});
