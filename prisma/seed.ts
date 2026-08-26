import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const teacherPassword = process.env.SEED_TEACHER_PASSWORD ?? "ChangeMe123!";
  const studentPassword = process.env.SEED_STUDENT_PASSWORD ?? "ChangeMe123!";

  console.log("Seeding database...");

  // 1. Users
  const teacher = await prisma.user.upsert({
    where: { username: "teacher" },
    update: { displayName: "Amer Naseem" },
    create: {
      username: "teacher",
      displayName: "Amer Naseem",
      email: "teacher@citycollegesambrial.edu.pk",
      role: "TEACHER",
      passwordHash: await bcrypt.hash(teacherPassword, 12),
    },
  });

  const student1 = await prisma.user.upsert({
    where: { username: "student1" },
    update: {},
    create: {
      username: "student1",
      displayName: "Zainab Khan",
      email: "student1@example.com",
      role: "STUDENT",
      passwordHash: await bcrypt.hash(studentPassword, 12),
    },
  });

  const student2 = await prisma.user.upsert({
    where: { username: "student2" },
    update: {},
    create: {
      username: "student2",
      displayName: "Bilal Tariq",
      email: "student2@example.com",
      role: "STUDENT",
      passwordHash: await bcrypt.hash(studentPassword, 12),
    },
  });

  // 2. Topics
  const topicNarcissism = await prisma.topic.upsert({
    where: { slug: "narcissism" },
    update: {},
    create: {
      name: "Narcissism & Pathological Grandiosity",
      slug: "narcissism",
      overview:
        "Narcissism in clinical psychology involves patterns of grandiosity, need for admiration, and lack of empathy, often concealing profound vulnerability and fragile self-esteem.",
    },
  });

  const topicDefense = await prisma.topic.upsert({
    where: { slug: "defense-mechanisms" },
    update: {},
    create: {
      name: "Ego Defense Mechanisms",
      slug: "defense-mechanisms",
      overview:
        "Unconscious psychological strategies brought into play by various entities to manipulate, deny, or distort reality in order to defend against anxiety and unacceptable impulses.",
    },
  });

  const topicMemory = await prisma.topic.upsert({
    where: { slug: "working-memory" },
    update: {},
    create: {
      name: "Working Memory & Cognitive Load",
      slug: "working-memory",
      overview:
        "The cognitive system with a limited capacity that can hold information temporarily for processing and manipulation during complex cognitive tasks.",
    },
  });

  // Topic Relations
  await prisma.topicRelation.upsert({
    where: {
      fromTopicId_toTopicId: { fromTopicId: topicNarcissism.id, toTopicId: topicDefense.id },
    },
    update: {},
    create: {
      fromTopicId: topicNarcissism.id,
      toTopicId: topicDefense.id,
      relationType: "prerequisite",
    },
  });

  // 3. Lectures
  const lecture1 = await prisma.lecture.upsert({
    where: { id: "seed-lecture-memory" },
    update: {},
    create: {
      id: "seed-lecture-memory",
      title: "Cognitive Psychology: Working Memory & Retrieval Architectures",
      description: "Exploration of the Baddeley-Hitch multicomponent working memory model, phonological loop, and central executive.",
      category: "Cognitive Psychology",
      primaryLanguage: "MIXED_URDU_ENGLISH",
      status: "PUBLISHED",
      createdById: teacher.id,
      lectureDate: new Date("2026-02-10T10:00:00Z"),
      actualDuration: 240,
    },
  });

  const lecture2 = await prisma.lecture.upsert({
    where: { id: "seed-lecture-narcissism" },
    update: {},
    create: {
      id: "seed-lecture-narcissism",
      title: "Personality Disorders: Narcissism, Splitting & Defense Mechanisms",
      description: "Clinical case presentations examining pathological narcissism, narcissistic rage, and splitting in therapeutic settings.",
      category: "Clinical Psychology",
      primaryLanguage: "MIXED_URDU_ENGLISH",
      status: "PUBLISHED",
      createdById: teacher.id,
      lectureDate: new Date("2026-02-18T14:00:00Z"),
      actualDuration: 360,
    },
  });

  const lecture3Draft = await prisma.lecture.upsert({
    where: { id: "seed-lecture-transference-draft" },
    update: {},
    create: {
      id: "seed-lecture-transference-draft",
      title: "Transference and Countertransference Dynamics (Draft)",
      description: "Unpublished internal review draft on psychoanalytic therapy dynamics.",
      category: "Psychoanalysis",
      primaryLanguage: "ENGLISH",
      status: "DRAFT",
      createdById: teacher.id,
      lectureDate: new Date("2026-02-24T09:00:00Z"),
    },
  });

  // 4. Speakers
  const spkTeacher = await prisma.speaker.upsert({
    where: { lectureId_rawLabel: { lectureId: lecture2.id, rawLabel: "SPEAKER_00" } },
    update: {},
    create: {
      lectureId: lecture2.id,
      rawLabel: "SPEAKER_00",
      displayName: "Dr. Ahmed (Teacher)",
      role: "TEACHER",
    },
  });

  const spkStudent = await prisma.speaker.upsert({
    where: { lectureId_rawLabel: { lectureId: lecture2.id, rawLabel: "SPEAKER_01" } },
    update: {},
    create: {
      lectureId: lecture2.id,
      rawLabel: "SPEAKER_01",
      displayName: "Student Questioner",
      role: "STUDENT",
    },
  });

  // 5. Transcript Segments for Lecture 2
  const seg1 = await prisma.transcriptSegment.create({
    data: {
      lectureId: lecture2.id,
      speakerId: spkTeacher.id,
      speakerRole: "TEACHER",
      startTimeSec: 0,
      endTimeSec: 25,
      text: "Assalam-o-Alaikum class. Aaj hum baat karenge narcissistic personality organization par, aur dekhain gay ke narcissistic vulnerability kaise defense mechanisms generate karti hai.",
      translatedText: "Peace be upon you class. Today we will discuss narcissistic personality organization, and examine how narcissistic vulnerability generates defense mechanisms.",
      language: "MIXED_URDU_ENGLISH",
      confidence: 0.98,
      segmentType: "TEACHER_EXPLANATION",
    },
  });

  const seg2 = await prisma.transcriptSegment.create({
    data: {
      lectureId: lecture2.id,
      speakerId: spkStudent.id,
      speakerRole: "STUDENT",
      startTimeSec: 26,
      endTimeSec: 45,
      text: "Sir, is there a clear difference between overt grandiose narcissism and covert vulnerable narcissism in clinical diagnostic interviews?",
      language: "ENGLISH",
      confidence: 0.96,
      segmentType: "STUDENT_QUESTION",
    },
  });

  const seg3 = await prisma.transcriptSegment.create({
    data: {
      lectureId: lecture2.id,
      speakerId: spkTeacher.id,
      speakerRole: "TEACHER",
      startTimeSec: 46,
      endTimeSec: 90,
      text: "Beshak. Overt narcissist exhibits direct entitlement and exhibitionism, jabke covert narcissist exhibits hypersensitivity and deep feelings of victimization. Both share the same underlying fragile ego.",
      translatedText: "Certainly. The overt narcissist exhibits direct entitlement and exhibitionism, whereas the covert narcissist exhibits hypersensitivity and deep feelings of victimization. Both share the same underlying fragile ego.",
      language: "MIXED_URDU_ENGLISH",
      confidence: 0.97,
      segmentType: "TEACHER_ANSWER",
    },
  });

  // 6. Topic Occurrences
  await prisma.topicOccurrence.create({
    data: {
      topicId: topicNarcissism.id,
      lectureId: lecture2.id,
      transcriptSegmentId: seg1.id,
      timestampSec: 0,
      label: "Introduction to narcissistic personality organization and fragile ego structures",
      source: "teacher",
      approved: true,
    },
  });

  await prisma.topicOccurrence.create({
    data: {
      topicId: topicNarcissism.id,
      lectureId: lecture2.id,
      transcriptSegmentId: seg3.id,
      timestampSec: 46,
      label: "Comparison: Overt grandiosity vs Covert vulnerable narcissism",
      source: "teacher",
      approved: true,
    },
  });

  await prisma.topicOccurrence.create({
    data: {
      topicId: topicDefense.id,
      lectureId: lecture2.id,
      transcriptSegmentId: seg1.id,
      timestampSec: 15,
      label: "Splitting and projective identification as narcissistic defenses",
      source: "teacher",
      approved: true,
    },
  });

  // Lecture Topic Associations
  await prisma.lectureTopic.upsert({
    where: { lectureId_topicId: { lectureId: lecture2.id, topicId: topicNarcissism.id } },
    update: {},
    create: { lectureId: lecture2.id, topicId: topicNarcissism.id, approved: true, source: "teacher" },
  });
  await prisma.lectureTopic.upsert({
    where: { lectureId_topicId: { lectureId: lecture2.id, topicId: topicDefense.id } },
    update: {},
    create: { lectureId: lecture2.id, topicId: topicDefense.id, approved: true, source: "teacher" },
  });

  // 7. AI Analyses (Approved for Lecture 2)
  await prisma.aiAnalysis.create({
    data: {
      lectureId: lecture2.id,
      type: "SUMMARY_DETAILED",
      content: {
        summary:
          "This lecture examines narcissistic personality structures through psychodynamic and cognitive frameworks. Dr. Ahmed distinguishes between overt grandiose presentations and covert hypersensitive phenotypes, highlighting that both serve as defensive maneuvers against core feelings of inadequacy.",
      },
      modelUsed: "ollama_local",
      approvedByTeacher: true,
      reviewedById: teacher.id,
    },
  });

  await prisma.aiAnalysis.create({
    data: {
      lectureId: lecture2.id,
      type: "KEY_CONCEPTS",
      content: {
        concepts: [
          {
            term: "Overt Narcissism",
            definition: "Externalized grandiosity, exhibitionism, and explicit demands for admiration.",
          },
          {
            term: "Covert Narcissism",
            definition: "Internalized grandiosity masked by social withdrawal, hypersensitivity to criticism, and resentment.",
          },
          {
            term: "Splitting",
            definition: "Defense mechanism of viewing the self and others as entirely all-good or all-bad without nuance.",
          },
        ],
      },
      modelUsed: "ollama_local",
      approvedByTeacher: true,
      reviewedById: teacher.id,
    },
  });

  await prisma.aiAnalysis.create({
    data: {
      lectureId: lecture2.id,
      type: "FLASHCARDS",
      content: {
        cards: [
          {
            front: "What is the core psychological vulnerability in narcissism?",
            back: "A deeply fragile self-esteem and profound intolerance of perceived defects.",
          },
          {
            front: "How do overt and covert narcissists differ in behavior?",
            back: "Overt displays direct entitlement; covert displays hypersensitivity and internalized victimization.",
          },
        ],
      },
      modelUsed: "ollama_local",
      approvedByTeacher: true,
      reviewedById: teacher.id,
    },
  });

  // Official Summary
  await prisma.lectureSummary.create({
    data: {
      lectureId: lecture2.id,
      kind: "detailed",
      content:
        "Comprehensive clinical discussion on narcissistic defenses, distinguishing overt from covert presentations in therapeutic practice.",
      isApproved: true,
    },
  });

  // 8. Student 1 Private Notes & Questions
  const note1 = await prisma.studentNote.create({
    data: {
      studentId: student1.id,
      lectureId: lecture2.id,
      transcriptSegmentId: seg3.id,
      timestampSec: 46,
      text: "Review difference between covert narcissism and borderline personality disorder for exam.",
    },
  });

  const question1 = await prisma.studentQuestion.create({
    data: {
      studentId: student1.id,
      lectureId: lecture2.id,
      transcriptSegmentId: seg3.id,
      timestampSec: 46,
      text: "Can a patient transition from overt to covert narcissism over their lifespan?",
      submittedToTeacher: true,
      submittedAt: new Date(),
    },
  });

  await prisma.teacherAnswer.create({
    data: {
      studentQuestionId: question1.id,
      teacherId: teacher.id,
      text: "Yes, particularly as physical vigor or social standing wanes in middle age, overt grandiosity often shifts into bitter covert resentment.",
    },
  });

  // 9. Student 2 Private Notes (Must NEVER be visible to Student 1)
  await prisma.studentNote.create({
    data: {
      studentId: student2.id,
      lectureId: lecture2.id,
      timestampSec: 10,
      text: "Confidential Student 2 Note: Notice how splitting was mentioned in my family case history.",
    },
  });

  console.log("Database successfully seeded with realistic psychology lectures, transcripts, topics, and multi-student data.");
  console.log("Accounts created:");
  console.log(`  Teacher:   username=teacher   password=${teacherPassword}`);
  console.log(`  Student 1: username=student1  password=${studentPassword}`);
  console.log(`  Student 2: username=student2  password=${studentPassword}`);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
