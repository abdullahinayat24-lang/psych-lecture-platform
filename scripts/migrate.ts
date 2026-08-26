import { prisma } from "../src/lib/db";

async function main() {
  // Update teacher name to Amer Naseem
  const updatedUser = await prisma.user.updateMany({
    where: { username: "teacher" },
    data: { displayName: "Amer Naseem" },
  });
  console.log("Updated teacher displayName to Amer Naseem:", updatedUser);

  const updatedSpeaker = await prisma.speaker.updateMany({
    where: { role: "TEACHER" },
    data: { displayName: "Amer Naseem" },
  });
  console.log("Updated speakers to Amer Naseem:", updatedSpeaker);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
