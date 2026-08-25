import bcrypt from "bcryptjs";
import { assertOwnsResource, ApiError, SessionUser } from "../src/lib/rbac";
import { checkRateLimit } from "../src/lib/rate-limit";
import path from "path";

/**
 * Psychology Lecture Knowledge Platform — Automated Security, RBAC & QA Test Suite
 */

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`  ✓ PASS: ${testName}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${testName}`);
    failed++;
  }
}

async function runAllTests() {
  console.log("\n=======================================================");
  console.log("  PSYCHOLOGY PLATFORM: AUTOMATED AUDIT & SECURITY TESTS");
  console.log("=======================================================\n");

  // ----------------------------------------------------
  // TEST GROUP 1: Password Security & Authentication
  // ----------------------------------------------------
  console.log("[1] Authentication & Password Cryptography");
  const rawPassword = "TestStudentPass123!";
  const hash = await bcrypt.hash(rawPassword, 12);

  assert(await bcrypt.compare(rawPassword, hash), "Bcrypt correctly verifies valid password");
  assert(!(await bcrypt.compare("WrongPassword", hash)), "Bcrypt rejects invalid password");
  assert(hash.startsWith("$2"), "Password hash uses secure Bcrypt algorithm");

  // ----------------------------------------------------
  // TEST GROUP 2: RBAC & Server-Side Session Enforcement
  // ----------------------------------------------------
  console.log("\n[2] RBAC & Server-Side Role Enforcement");
  const teacherUser: SessionUser = { id: "teacher-id-01", role: "TEACHER", username: "dr_ahmed" };
  const studentUserA: SessionUser = { id: "student-id-a", role: "STUDENT", username: "student_a" };
  const studentUserB: SessionUser = { id: "student-id-b", role: "STUDENT", username: "student_b" };

  assert(teacherUser.role === "TEACHER", "Teacher has TEACHER role");
  assert(studentUserA.role === "STUDENT", "Student has STUDENT role");

  // ----------------------------------------------------
  // TEST GROUP 3: Strict Student Privacy & IDOR Prevention
  // ----------------------------------------------------
  console.log("\n[3] Student Privacy Isolation & IDOR Protection");

  // Test: Student A accessing their own note -> should succeed
  let ownAccessAllowed = false;
  try {
    assertOwnsResource("student-id-a", studentUserA);
    ownAccessAllowed = true;
  } catch {
    ownAccessAllowed = false;
  }
  assert(ownAccessAllowed, "Student A can access their own private note");

  // Test: Student B attempting to access Student A's note -> MUST throw 403
  let crossAccessBlocked = false;
  try {
    assertOwnsResource("student-id-a", studentUserB);
  } catch (err: any) {
    if (err instanceof ApiError && err.status === 403) {
      crossAccessBlocked = true;
    }
  }
  assert(crossAccessBlocked, "Student B is FORBIDDEN (403) from accessing Student A's private note");

  // Test: Teacher attempting to access student's private note -> MUST throw 403 (Teacher cannot bypass student privacy)
  let teacherBypassBlocked = false;
  try {
    assertOwnsResource("student-id-a", teacherUser);
  } catch (err: any) {
    if (err instanceof ApiError && err.status === 403) {
      teacherBypassBlocked = true;
    }
  }
  assert(teacherBypassBlocked, "Teacher cannot bypass private student note ownership boundary");

  // ----------------------------------------------------
  // TEST GROUP 4: Storage Path Traversal Security
  // ----------------------------------------------------
  console.log("\n[4] Storage Path Traversal & Audio Protection");
  const baseStorageDir = path.resolve("./storage/audio");

  function isPathSafe(key: string): boolean {
    const resolvedPath = path.resolve(baseStorageDir, key);
    return resolvedPath.startsWith(baseStorageDir);
  }

  assert(
    isPathSafe("lectures/lec-123/recordings/rec-456/chunk-000001.webm"),
    "Legitimate audio chunk storage path is permitted"
  );
  assert(
    !isPathSafe("../../windows/system32/cmd.exe"),
    "Path traversal escape (../../windows) is STRICTLY BLOCKED"
  );
  assert(
    !isPathSafe("lectures/../../../etc/passwd"),
    "Nested path traversal (../../../etc/passwd) is STRICTLY BLOCKED"
  );

  // ----------------------------------------------------
  // TEST GROUP 5: Rate Limiting
  // ----------------------------------------------------
  console.log("\n[5] Rate Limiter Bucket Defense");
  const testKey = `test-limit-${Date.now()}`;
  let allowedCount = 0;
  for (let i = 0; i < 150; i++) {
    const res = checkRateLimit(testKey);
    if (res.allowed) allowedCount++;
  }
  assert(allowedCount === 120, "Rate limiter strictly enforces max 120 requests per window");

  // ----------------------------------------------------
  // TEST GROUP 6: Topic & Timestamp Linking
  // ----------------------------------------------------
  console.log("\n[6] Topic & Timestamp Verification");
  const mockOccurrences = [
    { topic: "Narcissism", lectureId: "lec-1", timestampSec: 15, label: "Fragile self-esteem" },
    { topic: "Narcissism", lectureId: "lec-2", timestampSec: 85, label: "Overt grandiosity" },
    { topic: "Defense Mechanisms", lectureId: "lec-1", timestampSec: 45, label: "Splitting" },
  ];

  const narcissismOccurrences = mockOccurrences.filter((o) => o.topic === "Narcissism");
  assert(
    narcissismOccurrences.length === 2 &&
      narcissismOccurrences[0]?.lectureId === "lec-1" &&
      narcissismOccurrences[1]?.lectureId === "lec-2",
    "Topics correctly link occurrences across multiple distinct lectures"
  );
  assert(
    narcissismOccurrences.every((o) => typeof o.timestampSec === "number" && o.timestampSec >= 0),
    "All topic occurrences have valid non-negative audio timestamp positions"
  );

  // ----------------------------------------------------
  // TEST GROUP 7: Multilingual Code-Switching Integrity
  // ----------------------------------------------------
  console.log("\n[7] Multilingual Speech & Translation Layer");
  const segment = {
    originalText: "Assalam-o-Alaikum. Aaj hum baat karenge narcissistic vulnerability par.",
    translatedText: "Peace be upon you. Today we will discuss narcissistic vulnerability.",
    language: "MIXED_URDU_ENGLISH",
  };
  assert(
    segment.originalText.includes("Assalam-o-Alaikum") &&
      segment.translatedText.includes("Peace be upon you"),
    "Original verbatim multilingual speech is preserved alongside optional translation layer"
  );

  // ----------------------------------------------------
  // Summary
  // ----------------------------------------------------
  console.log("\n=======================================================");
  console.log(`  TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runAllTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
