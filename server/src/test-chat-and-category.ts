import { chatAgent } from "./agents/chatAgent";
import { categoryAgent } from "./agents/categoryAgent";

interface TestCase {
  title: string;
  rawMessage: string;
  expectedDomain: string;
}

const testCases: TestCase[] = [
  {
    title: "1. Hostel Maintenance (Hindi input)",
    rawMessage: "हॉस्टल के ब्लॉक B कमरा 304 में पानी का नल टूट गया है और लगातार पानी बह रहा है।",
    expectedDomain: "HOSTEL_MAINTENANCE",
  },
  {
    title: "2. Certificate Request (Spanish input)",
    rawMessage: "Necesito un certificado de estudios y una constancia de conducta para mi solicitud de pasantía.",
    expectedDomain: "CERTIFICATE",
  },
  {
    title: "3. Laboratory Issue (English input)",
    rawMessage: "The digital oscilloscope at workstation 4 in the Digital Electronics Lab is not powering on.",
    expectedDomain: "LABORATORY",
  },
  {
    title: "4. Student Grievance (English input)",
    rawMessage: "A teaching assistant has been unfairly penalizing internal assessment marks with discriminatory remarks.",
    expectedDomain: "GRIEVANCE",
  },
  {
    title: "5. Vague / Ambiguous Request (Legitimately UNCLEAR)",
    rawMessage: "सर मेरा काम जल्दी कर दीजिए बहुत परेशानी हो रही है, प्लीज़ मदद करें।",
    expectedDomain: "UNCLEAR",
  },
];

async function runSequentialPipelineTest() {
  console.log("================================================================================");
  console.log("  WILLUP Pipeline Test: Chat Agent (Intake/Translation) → Category Agent");
  console.log("================================================================================\n");

  for (let i = 0; i < testCases.length; i++) {
    const { title, rawMessage, expectedDomain } = testCases[i];
    console.log(`[TEST CASE ${title}]`);
    console.log(`• Raw Student Message: "${rawMessage}"`);

    // Step 1: Pass raw message through Chat AI (Language detection & Translation)
    const chatResult = await chatAgent({ message: rawMessage });
    console.log(`  → Detected Language: ${chatResult.detectedLanguage}`);
    console.log(`  → Translated Text:   "${chatResult.translatedText}"`);

    // Step 2: Pass translated text to Category AI (Domain classification)
    const categoryResult = await categoryAgent({ translatedText: chatResult.translatedText });
    console.log(`  → Classified Domain: ${categoryResult.domain} (Expected: ${expectedDomain})`);
    console.log(`  → Confidence Score:  ${categoryResult.confidence}`);
    if (categoryResult.reasoning) {
      console.log(`  → Rationale:         ${categoryResult.reasoning}`);
    }

    const isMatch = categoryResult.domain === expectedDomain;
    console.log(`  → Status:            ${isMatch ? "✔ MATCHED" : "✘ MISMATCH"}\n`);
    console.log("--------------------------------------------------------------------------------\n");
  }

  console.log("================================================================================");
  console.log("  Sequential Pipeline Test Complete");
  console.log("================================================================================");
}

runSequentialPipelineTest().catch((err) => {
  console.error("Pipeline test error:", err);
});
