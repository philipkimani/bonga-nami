/**
 * SYSTEM PROMPT BUILDER — Dynamic Prompt Generation
 * 
 * Generates system prompts for ElevenLabs agents based on:
 * - Industry configuration
 * - Available tools
 * - Custom instructions
 * 
 * @since v3.2.0
 */

import type { ToolDefinition } from "./tools.js";

// ============================================================================
// PROMPT TEMPLATES BY INDUSTRY
// ============================================================================

export interface IndustryPromptConfig {
  /** Industry name */
  name: string;
  /** Base persona description */
  persona: string;
  /** Greeting style */
  greetingStyle: string;
  /** Key capabilities to emphasize */
  capabilities: string[];
  /** Tone guidelines */
  tone: string;
  /** Example phrases */
  examplePhrases?: string[];
}

const INDUSTRY_PROMPTS: Record<string, IndustryPromptConfig> = {
  ecommerce: {
    name: "E-commerce",
    persona: "You are a helpful shopping assistant who makes product discovery easy and enjoyable.",
    greetingStyle: "Welcome shoppers warmly and offer to help find products.",
    capabilities: [
      "Search for products by name, category, or description",
      "Add items to the shopping cart",
      "Check cart contents and totals",
      "Process checkout with multiple payment options",
      "Provide product recommendations",
    ],
    tone: "Friendly, helpful, and efficient. Use conversational language. Be enthusiastic about products without being pushy.",
    examplePhrases: [
      "I found some great options for you!",
      "Would you like me to add that to your cart?",
      "Your total comes to...",
    ],
  },
  
  hospitality: {
    name: "Hospitality",
    persona: "You are a professional hotel concierge who provides exceptional guest service.",
    greetingStyle: "Greet guests warmly and inquire how you can enhance their stay.",
    capabilities: [
      "Check room availability and rates",
      "Make and modify reservations",
      "Provide information about hotel amenities",
      "Recommend local attractions and restaurants",
      "Handle special requests and accommodations",
    ],
    tone: "Professional, warm, and attentive. Use polite language. Anticipate guest needs.",
    examplePhrases: [
      "I'd be delighted to assist you with that.",
      "We have excellent availability for your dates.",
      "Is there anything else I can arrange for you?",
    ],
  },
  
  healthcare: {
    name: "Healthcare",
    persona: "You are a helpful healthcare assistant who helps patients navigate their care.",
    greetingStyle: "Greet patients with empathy and ask how you can help today.",
    capabilities: [
      "Schedule and manage appointments",
      "Provide general health information",
      "Check prescription status",
      "Answer insurance questions",
      "Connect patients with appropriate care",
    ],
    tone: "Empathetic, calm, and professional. Use clear, simple language. Be patient and understanding.",
    examplePhrases: [
      "I understand your concern. Let me help.",
      "Your appointment is confirmed for...",
      "For urgent matters, please call...",
    ],
  },
  
  banking: {
    name: "Banking",
    persona: "You are a trusted banking assistant who helps customers manage their finances.",
    greetingStyle: "Greet customers professionally and ask how you can assist with their banking needs.",
    capabilities: [
      "Check account balances and transactions",
      "Transfer funds between accounts",
      "Pay bills and set up payments",
      "Answer questions about products and services",
      "Help with account security",
    ],
    tone: "Professional, trustworthy, and clear. Use precise language. Prioritize security.",
    examplePhrases: [
      "I can help you with that securely.",
      "Your current balance is...",
      "For your security, I'll need to verify...",
    ],
  },
  
  restaurant: {
    name: "Restaurant",
    persona: "You are a friendly restaurant host who helps guests with reservations and menu inquiries.",
    greetingStyle: "Welcome guests warmly and offer to help with reservations or menu questions.",
    capabilities: [
      "Make and modify reservations",
      "Describe menu items and specials",
      "Handle dietary restrictions and allergies",
      "Provide restaurant information",
      "Take orders for delivery or pickup",
    ],
    tone: "Warm, enthusiastic, and knowledgeable about food. Use appetizing descriptions.",
    examplePhrases: [
      "We'd love to have you dine with us!",
      "Our chef's special today is...",
      "I can absolutely accommodate that dietary need.",
    ],
  },
};

// ============================================================================
// PROMPT BUILDER
// ============================================================================

export interface PromptBuilderConfig {
  /** Industry type */
  industry: string;
  /** Business name */
  businessName?: string;
  /** Agent's display name */
  agentName?: string;
  /** Available tools */
  tools?: ToolDefinition[];
  /** Custom instructions to append */
  customInstructions?: string;
  /** Language preference */
  language?: string;
  /** Whether to include tool instructions */
  includeToolInstructions?: boolean;
}

/**
 * Build a system prompt for an ElevenLabs agent
 */
export function buildSystemPrompt(config: PromptBuilderConfig): string {
  const industry = INDUSTRY_PROMPTS[config.industry] || INDUSTRY_PROMPTS.ecommerce;
  const agentName = config.agentName || "Assistant";
  const businessName = config.businessName || "our business";
  
  const sections: string[] = [];
  
  // Identity
  sections.push(`# Identity
You are ${agentName}, a voice assistant for ${businessName}.
${industry.persona}`);
  
  // Tone and Style
  sections.push(`# Tone and Style
${industry.tone}
${industry.greetingStyle}`);
  
  // Capabilities
  sections.push(`# Capabilities
You can help with:
${industry.capabilities.map(c => `- ${c}`).join('\n')}`);
  
  // Tool Instructions
  if (config.includeToolInstructions !== false && config.tools && config.tools.length > 0) {
    const toolInstructions = config.tools
      .map(t => `- **${t.name}**: ${t.description}`)
      .join('\n');
    
    sections.push(`# Available Tools
Use these tools to help the customer:
${toolInstructions}

When using tools:
1. Confirm the action before executing (e.g., "I'll search for laptops for you")
2. Summarize results conversationally
3. Offer next steps or related actions`);
  }
  
  // Language
  if (config.language) {
    sections.push(`# Language
Respond in ${config.language}. If the user speaks a different language, try to accommodate.`);
  }
  
  // Custom Instructions
  if (config.customInstructions) {
    sections.push(`# Additional Instructions
${config.customInstructions}`);
  }
  
  // Example Phrases
  if (industry.examplePhrases && industry.examplePhrases.length > 0) {
    sections.push(`# Example Phrases
${industry.examplePhrases.map(p => `- "${p}"`).join('\n')}`);
  }
  
  return sections.join('\n\n');
}

/**
 * Get available industry templates
 */
export function getIndustryTemplates(): string[] {
  return Object.keys(INDUSTRY_PROMPTS);
}

/**
 * Get industry prompt config
 */
export function getIndustryPromptConfig(industry: string): IndustryPromptConfig | undefined {
  return INDUSTRY_PROMPTS[industry];
}

/**
 * Build a simple greeting for an industry
 */
export function buildGreeting(industry: string, agentName?: string): string {
  const config = INDUSTRY_PROMPTS[industry];
  const name = agentName || "your assistant";
  
  if (!config) {
    return `Hello! I'm ${name}. How can I help you today?`;
  }
  
  switch (industry) {
    case "ecommerce":
      return `Hi there! I'm ${name}. Looking for something specific, or would you like me to show you what's popular today?`;
    case "hospitality":
      return `Welcome! I'm ${name}, your concierge. How may I assist you with your stay?`;
    case "healthcare":
      return `Hello, I'm ${name}. How can I help you with your healthcare needs today?`;
    case "banking":
      return `Welcome to secure banking. I'm ${name}. How may I assist you?`;
    case "restaurant":
      return `Welcome! I'm ${name}. Would you like to make a reservation or hear about today's specials?`;
    default:
      return `Hello! I'm ${name}. How can I help you today?`;
  }
}
