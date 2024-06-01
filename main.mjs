import OpenAI from 'openai';
import dotenv from 'dotenv';
import fs from 'fs';

// Load environment variables from a .env file
dotenv.config();

// Set up OpenAI configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * A message from one agent to others.
 *
 * Agents always see their own messages presented as "assistant" messages, but
 * messages from other agents can appear either as "user" or "system" messages.
 *
 * Users always see messages they've sent, but they will only see messages from
 * other agents if those messages are intended for them. This is specifically
 * design to allow private system messages.
 *
 * @typedef {Object} Message
 * @property {string} [from] If not specified, the message is not attributed to any agent
 * @property {string[]} [to] If not specified, the message is visible to all agents
 * @property {'user' | 'system'} [as] If not specified, the message is sent as a user message
 * @property {string} content
 */

/**
 * @typedef {Object} Scenario
 * @property {AgentProfile[]} agents Agents who automatically participate in the conversation
 * @property {Message[]} conversation
 * @property {number | undefined} temperature
 * @property {number | undefined} maxTokens
 */

/**
 * @typedef {Object} AgentProfile
 * @property {string} name The name of the agent
 * @property {'system'|'user'} role The role of the agent
 * @property {string} systemPrompt System prompt shown at the beginning of the conversation
 * @property {string} trailingSystemPrompt System prompt shown at the end of the conversation, normally for reminders to the agent about things that get forgotten from the main system prompt over long conversations.
 */

// Get the scenario filename from the command line arguments
const inputFilename = process.argv[2];

if (!inputFilename) {
  console.error('Usage: npm start <scenario.json> [<next speaker>]');
  process.exit(1);
}

/** @type {Scenario} */
const scenario = JSON.parse(fs.readFileSync(inputFilename, 'utf8'));

/** @type {AgentProfile | undefined} */
let whoseTurn;

// If the user provided the next person to speak, then use that person
if (process.argv[3]) {
  whoseTurn = scenario.agents.find(a => a.name.toLowerCase() === process.argv[3].toLowerCase());
  if (!whoseTurn) {
    console.error(`No active agent with the name "${process.argv[3]}".`);
    process.exit(1);
  }
  console.log(`It is ${whoseTurn.name}'s turn to speak (specified on CLI).`);
}

if (!whoseTurn) {
  // The next person to speak is the agent who last spoke longest ago.

  // How long ago each agent last spoke
  const lastSpokeTimes = scenario.agents
    .map(a => scenario.conversation.slice().reverse().findIndex(m => m.from === a.name))
    .map(i => i === -1 ? Infinity : i);
  whoseTurn = scenario.agents[lastSpokeTimes.indexOf(Math.max(...lastSpokeTimes))];

  console.log(`It is ${whoseTurn.name}'s turn to speak (it's been the longest since they spoke).`);
}

// Generate a response from the AI agent
const response = await generateResponse(
  scenario.conversation,
  whoseTurn,
  scenario.maxTokens,
  scenario.temperature
);

scenario.conversation.push({
  from: whoseTurn.name,
  as: whoseTurn.role === 'system' ? 'system' : undefined,
  content: response
});

// Derive output filename from input filename
// const outputFilename = inputFilename.replace('.json', '.out.json');
const outputFilename = inputFilename; // Overwrite the input file with the updated conversation

fs.writeFileSync(outputFilename, JSON.stringify(scenario, null, 2));

// A text rendering for convenience
const textOutputFile = inputFilename.replace('.json', '.md');
fs.writeFileSync(textOutputFile, scenario.conversation
  .map(m => `# ${m.from ?? '<anonymous>'}${
    !m.to ? '' : ` to ${[m.to].flat().join(', ')}`
  }${
    m.as === 'system' ? ' as "system" role' : ''
  }:\n${m.content}`).join('\n\n'));

/**
 * Function to generate a response from an AI agent
 *
 * @param {Message[]} conversation The conversation so far
 * @param {AgentProfile} whoseTurn The agent whose turn it is to speak
 * @param {number | undefined} maxTokens The maximum number of tokens to generate
 * @param {number | undefined} temperature The temperature to use for generation
 */
async function generateResponse(conversation, whoseTurn, maxTokens, temperature) {

  /** @type {{ role: 'system' | 'assistant' | 'user', content: string }[]} */
  const messages = [];

  if (whoseTurn.systemPrompt) {
    messages.push({ role: 'system', content: whoseTurn.systemPrompt });
  }

  for (const { from, to, as, content } of conversation) {
    const isVisible = whoseTurn.name === from || !to || to.includes(whoseTurn.name);
    if (isVisible) {
      // If the message is from this agent then they see it as an assistant
      // message. Otherwise, they see it as a user or system message depending
      // on the message's `as` property.
      const role = whoseTurn.name === from ? 'assistant' : (as ?? 'user');
      messages.push({ role, content });
    }
  }

  if (whoseTurn.trailingSystemPrompt) {
    messages.push({ role: 'system', content: whoseTurn.trailingSystemPrompt });
  }

  fs.writeFileSync('messages-dbg.json', JSON.stringify(messages, null, 2));

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages,
    max_tokens: maxTokens ?? 1500,
    temperature: temperature ?? 0.5,
  });
  const content = response.choices[0].message.content ?? '';

  return content.trim();
}
