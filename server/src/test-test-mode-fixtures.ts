import { chatAgent } from "./agents/chatAgent";
import { categoryAgent } from "./agents/categoryAgent";
import { processLaboratoryRequest } from "./agents/laboratoryAgent";
import { processCertificateRequest } from "./agents/certificateAgent";
import { processHostelMaintenanceRequest } from "./agents/hostelAgent";
import { processGrievanceRequest } from "./agents/grievanceAgent";

async function verifyTestModeFixtures() {
  process.env.TEST_MODE = "true";
  console.log("================================================================================");
  console.log("  VERIFYING DETERMINISTIC FIXTURE TEST MODE (TEST_MODE=true)");
  console.log("================================================================================\n");

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, msg: string) {
    total++;
    if (condition) {
      console.log(`  [PASS] ${msg}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${msg}`);
      throw new Error(`Assertion failed: ${msg}`);
    }
  }

  // ---------------------------------------------------------------------------
  // 1. chatAgent Verification
  // ---------------------------------------------------------------------------
  console.log("1. Testing chatAgent fixtures...");
  const chat1 = await chatAgent({
    message: "हॉस्टल के कमरा नंबर 204 में पंखा खराब है और बहुत आवाज कर रहा है, कृपया इसे ठीक करें।",
  });
  assert(chat1.detectedLanguage === "Hindi", "chatAgent detects Hindi");
  assert(chat1.intent === "REPORT", "chatAgent detects REPORT intent");
  assert(chat1.isFollowUp === false, "chatAgent isFollowUp false for new issue");
  assert(typeof chat1.translatedText === "string" && chat1.translatedText.length > 0, "chatAgent translatedText populated");

  const chat2 = await chatAgent({
    message: "Tengo un problema urgente con un documento.",
    isCategoryUnclear: true,
  });
  assert(chat2.detectedLanguage === "Spanish", "chatAgent detects Spanish");
  assert(typeof chat2.clarifyingQuestion === "string" && chat2.clarifyingQuestion.length > 0, "chatAgent returns clarifyingQuestion when isCategoryUnclear=true");

  const chat3 = await chatAgent({
    message: "Here is my registration number: REG-98421 for the Bonafide Certificate.",
    history: [{ role: "user", content: "Need certificate" }],
  });
  assert(chat3.isFollowUp === true, "chatAgent handles follow-up message with history");

  const chat4 = await chatAgent({
    message: "What is the policy for certificate issuance?",
  });
  assert(chat4.intent === "QUESTION", "chatAgent detects QUESTION intent");

  // Verify chatAgent throws on unmapped input
  let chatErrorThrown = false;
  try {
    await chatAgent({ message: "completely unmapped nonexistent input string XYZ 12345" });
  } catch (err: any) {
    chatErrorThrown = true;
    assert(err.message.includes("[chatAgent] No fixture match found"), "chatAgent throws descriptive error for unmatched input");
  }
  assert(chatErrorThrown, "chatAgent strictly requires valid fixture in TEST_MODE");

  // ---------------------------------------------------------------------------
  // 2. categoryAgent Verification
  // ---------------------------------------------------------------------------
  console.log("\n2. Testing categoryAgent fixtures...");
  const catLab = await categoryAgent({ translatedText: "The digital oscilloscope at workstation 4 in the Digital Electronics Lab is not powering on." });
  assert(catLab.domain === "LABORATORY", "categoryAgent classifies LABORATORY");
  assert(catLab.confidence >= 0.85, "categoryAgent confidence >= 0.85 for LABORATORY");

  const catCert = await categoryAgent({ translatedText: "I want to apply for a Bonafide Certificate." });
  assert(catCert.domain === "CERTIFICATE", "categoryAgent classifies CERTIFICATE");

  const catHostel = await categoryAgent({ translatedText: "The water tap in hostel Block B room 304 is broken and water is continuously leaking." });
  assert(catHostel.domain === "HOSTEL_MAINTENANCE", "categoryAgent classifies HOSTEL_MAINTENANCE");

  const catGrievance = await categoryAgent({ translatedText: "I am being subjected to continuous harassment by a senior student in the cafeteria." });
  assert(catGrievance.domain === "GRIEVANCE", "categoryAgent classifies GRIEVANCE");

  const catUnclear = await categoryAgent({ translatedText: "Sir please complete my work quickly, I am facing a lot of trouble, please help." });
  assert(catUnclear.domain === "UNCLEAR", "categoryAgent classifies UNCLEAR for vague input");

  // Verify categoryAgent throws on unmapped input
  let catErrorThrown = false;
  try {
    await categoryAgent({ translatedText: "Random unknown text completely unrelated to fixtures 98765" });
  } catch (err: any) {
    catErrorThrown = true;
    assert(err.message.includes("[categoryAgent] No fixture match found"), "categoryAgent throws descriptive error for unmatched input");
  }
  assert(catErrorThrown, "categoryAgent strictly requires valid fixture in TEST_MODE");

  // ---------------------------------------------------------------------------
  // 3. laboratoryAgent Verification
  // ---------------------------------------------------------------------------
  console.log("\n3. Testing laboratoryAgent fixtures...");
  const labNormal = await processLaboratoryRequest("student-1", "I need to book the Physics Lab 101 on 2026-10-15 for the 10:00 AM - 12:00 PM slot for my final year project.");
  assert(labNormal.extractedData.labId === "Physics Lab 101", "laboratoryAgent extracts labId");
  assert(labNormal.severity === "NA", "laboratoryAgent severity is NA");
  assert(!labNormal.policyConflict, "laboratoryAgent normal case has no policyConflict");

  const labConflict = await processLaboratoryRequest("student-1", "Book Physics Lab 101 on 2026-10-15 for the 10:00 AM - 12:00 PM slot please.");
  assert(typeof labConflict.policyConflict === "string" && labConflict.policyConflict.includes("Conflict"), "laboratoryAgent returns policyConflict for double booking");

  // Verify laboratoryAgent throws on unmapped input
  let labErrorThrown = false;
  try {
    await processLaboratoryRequest("student-1", "unmapped lab request XYZ");
  } catch (err: any) {
    labErrorThrown = true;
    assert(err.message.includes("[laboratoryAgent] No fixture match found"), "laboratoryAgent throws descriptive error for unmatched input");
  }
  assert(labErrorThrown, "laboratoryAgent strictly requires valid fixture in TEST_MODE");

  // ---------------------------------------------------------------------------
  // 4. certificateAgent Verification
  // ---------------------------------------------------------------------------
  console.log("\n4. Testing certificateAgent fixtures...");
  const certNormal = await processCertificateRequest("student-1", "I want to apply for a Bonafide Certificate.");
  assert(certNormal.extractedData.certType === "Bonafide Certificate", "certificateAgent extracts certType");
  assert(Array.isArray(certNormal.extractedData.requiredDocs), "certificateAgent extracts requiredDocs array");
  assert(!certNormal.policyConflict, "certificateAgent normal case has no policyConflict");

  const certConflict = await processCertificateRequest("student-1", "I need a Super Secret Alien Passport.");
  assert(typeof certConflict.policyConflict === "string", "certificateAgent returns policyConflict for unrecognized certificate");

  // Verify certificateAgent throws on unmapped input
  let certErrorThrown = false;
  try {
    await processCertificateRequest("student-1", "unmapped cert request XYZ");
  } catch (err: any) {
    certErrorThrown = true;
    assert(err.message.includes("[certificateAgent] No fixture match found"), "certificateAgent throws descriptive error for unmatched input");
  }
  assert(certErrorThrown, "certificateAgent strictly requires valid fixture in TEST_MODE");

  // ---------------------------------------------------------------------------
  // 5. hostelAgent Verification
  // ---------------------------------------------------------------------------
  console.log("\n5. Testing hostelAgent fixtures...");
  const hostelMed = await processHostelMaintenanceRequest("student-1", "My laptop charger is sparking and causing a short circuit in room 402, Block B.");
  assert(hostelMed.severity === "MEDIUM", "hostelAgent assigns MEDIUM severity for electrical spark");
  assert(hostelMed.scope === "PERSONAL", "hostelAgent assigns PERSONAL scope for personal charger");

  const hostelCrit = await processHostelMaintenanceRequest("student-1", "The main hallway on the 3rd floor of Block A has exposed live wires hanging from the ceiling. It is a major health-safety hazard.");
  assert(hostelCrit.severity === "CRITICAL", "hostelAgent assigns CRITICAL severity for exposed live wires");
  assert(hostelCrit.scope === "PERSONAL", "hostelAgent critical bypass routes directly as PERSONAL scope");

  const hostelConflict = await processHostelMaintenanceRequest("student-1", "Please repair my 2000W electric space heater and cooking induction stove in room 108 Block C.");
  assert(typeof hostelConflict.policyConflict === "string" && hostelConflict.policyConflict.includes("Conflict"), "hostelAgent returns policyConflict for prohibited appliance");

  // Verify hostelAgent throws on unmapped input
  let hostelErrorThrown = false;
  try {
    await processHostelMaintenanceRequest("student-1", "unmapped hostel request XYZ");
  } catch (err: any) {
    hostelErrorThrown = true;
    assert(err.message.includes("[hostelAgent] No fixture match found"), "hostelAgent throws descriptive error for unmatched input");
  }
  assert(hostelErrorThrown, "hostelAgent strictly requires valid fixture in TEST_MODE");

  // ---------------------------------------------------------------------------
  // 6. grievanceAgent Verification
  // ---------------------------------------------------------------------------
  console.log("\n6. Testing grievanceAgent fixtures...");
  const grievCrit = await processGrievanceRequest("student-1", "I am being subjected to continuous harassment by a senior student in the cafeteria.");
  assert(grievCrit.severity === "CRITICAL", "grievanceAgent assigns CRITICAL severity for harassment");
  assert(grievCrit.extractedData.category === "harassment", "grievanceAgent extracts harassment category");

  const grievMed = await processGrievanceRequest("student-1", "A teaching assistant has been unfairly penalizing internal assessment marks with discriminatory remarks.");
  assert(grievMed.severity === "MEDIUM", "grievanceAgent assigns MEDIUM severity for grading dispute");

  const grievConflict = await processGrievanceRequest("student-1", "I demand the grievance board overturn the municipal court civil penalty regarding off-campus parking.");
  assert(typeof grievConflict.policyConflict === "string" && grievConflict.policyConflict.includes("Conflict"), "grievanceAgent returns policyConflict for jurisdictional invalidity");

  // Verify grievanceAgent throws on unmapped input
  let grievErrorThrown = false;
  try {
    await processGrievanceRequest("student-1", "unmapped grievance request XYZ");
  } catch (err: any) {
    grievErrorThrown = true;
    assert(err.message.includes("[grievanceAgent] No fixture match found"), "grievanceAgent throws descriptive error for unmatched input");
  }
  assert(grievErrorThrown, "grievanceAgent strictly requires valid fixture in TEST_MODE");

  console.log("\n================================================================================");
  console.log(`  ALL ${passed}/${total} TEST_MODE FIXTURE ASSERTIONS PASSED SUCCESSFULLY!`);
  console.log("================================================================================");
}

verifyTestModeFixtures().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
