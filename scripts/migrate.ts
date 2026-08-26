import { prisma } from "../src/lib/db";

async function main() {
  console.log("Running DDL migration...");
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "LectureRecording" ADD COLUMN IF NOT EXISTS "audioBase64" TEXT;
  `);
  console.log("Migration executed successfully!");

  // Update teacher name to Sir Amir
  const updated = await prisma.user.updateMany({
    where: { username: "teacher" },
    data: { displayName: "Sir Amir" },
  });
  console.log("Updated teacher displayName to Sir Amir:", updated);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
