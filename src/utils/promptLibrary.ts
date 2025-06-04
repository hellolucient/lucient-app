// Placeholder for static prompt templates

export const Prompts = {
  summarization: {
    general: "Summarize the following text: {{text}}",
    bullets: "Summarize the following text into bullet points: {{text}}",
  },
  qa: {
    general: "Based on the following context, answer the question. Context: {{context}} Question: {{question}}",
    closed: "Answer the following question strictly based on the provided text. If the answer is not in the text, say so. Context: {{context}} Question: {{question}}",
  },
  classification: {
    sentiment: "Classify the sentiment of the following text (positive, negative, neutral): {{text}}",
    topic: "What is the main topic of the following text? {{text}}",
  },
  creative: {
    story_idea: "Generate a short story idea based on the following keywords: {{keywords}}",
    tagline: "Create a catchy tagline for a product that is {{product_description}}",
  },
  code: {
    explain: "Explain this code snippet: {{code_snippet}}",
    generate_function: "Write a JavaScript function that {{function_description}}",
  }
  // Add more categories and specific prompts as needed
};

// Example of how to use a prompt (you would replace placeholders with actual content)
// import { Prompts } from './promptLibrary';
// const myText = "Some long article content...";
// const summaryPrompt = Prompts.summarization.general.replace("{{text}}", myText);
// console.log(summaryPrompt);

export default Prompts; 