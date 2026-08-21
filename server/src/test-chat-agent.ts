import { chatAgent } from "./agents/chatAgent";

async function runManualTest() {
  console.log("============================================================");
  console.log("  WILLUP Chat Agent Manual Verification Test");
  console.log("============================================================\n");

  // Test 1: Hindi message translation & language detection
  console.log("--- TEST 1: Hindi Message Intake ---");
  const hindiMessage = "हॉस्टल के कमरा नंबर 204 में पंखा खराब है और बहुत आवाज कर रहा है, कृपया इसे ठीक करें।";
  console.log(`Input message: "${hindiMessage}"`);
  
  const result1 = await chatAgent({
    message: hindiMessage,
  });
  console.log("Result 1 Output:");
  console.log(JSON.stringify(result1, null, 2));
  console.log("\n------------------------------------------------------------\n");

  // Test 2: Spanish message with Category AI UNCLEAR clarification request
  console.log("--- TEST 2: Spanish Message with Category AI 'UNCLEAR' Flag ---");
  const spanishMessage = "Tengo un problema urgente con un documento.";
  console.log(`Input message: "${spanishMessage}"`);

  const result2 = await chatAgent({
    message: spanishMessage,
    isCategoryUnclear: true,
    unclearReason: "The student did not specify which certificate/document type or registration number is needed.",
  });
  console.log("Result 2 Output:");
  console.log(JSON.stringify(result2, null, 2));
  console.log("\n------------------------------------------------------------\n");

  // Test 3: Follow-up message in English with existing conversation history
  console.log("--- TEST 3: Follow-up Message with Conversation History ---");
  const followUpMessage = "Here is my registration number: REG-98421 for the Bonafide Certificate.";
  console.log(`Input message: "${followUpMessage}"`);

  const result3 = await chatAgent({
    message: followUpMessage,
    history: [
      { role: "user", content: "I need my certificate urgently." },
      { role: "assistant", content: "Which certificate do you require and what is your registration number?" },
    ],
  });
  console.log("Result 3 Output:");
  console.log(JSON.stringify(result3, null, 2));
  console.log("\n============================================================");
  console.log("  Chat Agent Verification Complete");
  console.log("============================================================");
}

runManualTest().catch((err) => {
  console.error("Test execution failed:", err);
});
