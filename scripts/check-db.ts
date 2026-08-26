import { prisma } from "../src/lib/db";

async function main() {
  const users = await prisma.user.findMany();
  console.log("USERS:", users.map(u => ({ id: u.id, username: u.username, role: u.role, displayName: u.displayName })));

  const lectures = await prisma.lecture.findMany({
    include: {
      recordings: true,
      speakers: true,
      _count: { select: { transcriptSegments: true } }
    },
    orderBy: { createdAt: "desc" }
  });
  console.log("LECTURES COUNT:", lectures.length);
  console.log("LECTURES:", JSON.stringify(lectures, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
