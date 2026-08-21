import { chatAgent } from "./agents/chatAgent";

async function main() {
  console.log("Testing Chat Agent with Gemini...");
  try {
    const result = await chatAgent({
      message: "Mi habitación tiene una gotera de agua muy grande. Necesito ayuda.",
      history: []
    });
    console.log("Chat Agent Result:");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error("Test failed:", error);
  }
}

main();
