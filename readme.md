# Multi-way AI Conversation

CLI app to run multiple AI agents to chat with each other or with you.

## Install

- Clone repo
- `npm install`
- Make a `.env` file with `OPENAI_API_KEY=...` with your OpenAI API key.


## Usage

```
npm start {scenario.json} [{next speaker}]
```

This will let `{next speaker}` take a turn to speak, and append the new message back to the conversation in the scenario.json file.

If no {next speaker} is specified, the next speaker will be the agent who spoke longest ago, so they will take turns.

The scenario file contains both the setup and conversation. Look at [example-scenario.json](example-scenario.json) for an example of a scenario. If your scenario file references [scenario-schema.json](scenario-schema.json) as the schema, your editor may give you auto-completion and explanation of the fields.

The script only runs a single turn, with the expectation that the user may want to intervene by modifying the conversation themselves before the next turn. You might do this if you want to interact with the agents (add your own messages), shape the conversation by modifying the agent's responses, etc.

There's a rendered `md` file as output as well, but please not that this is not the source of truth. It's just a pretty rendering of the JSON file. If you want to manipulate the conversation, you need to do it in the json file.


## Conversation Model

This uses OpenAI's chat API (currently GPT4o). Conversations submitted to the chat API have messages with 3 roles: 'system', 'user', and 'assistant'. System messages are low-level instructions to the agent. User messages are the messages that the agent is responding to. Assistant messages are the messages that the agent itself believes it generated.

In a scenario file, there is a single conversation that all agents see, but they see it through different lenses:

- Each agent sees themselves as "assistant" in the conversation.
- They see messages from others normally as "user" in the conversation, unless the `as: 'system'` property is added to the message.
- Agents typically produce messages to others as "user", unless the agent's `role` is set to `system`, in which case their messages will show up to others as `system` messages.

Messages that don't have a `from` property will never be seen by any agent as an "assistant" message. I.e. they will never attribute the message to themselves. This can be used if you want to add your own messages to the conversation and not have any of the agents think that they generated it. Like other messages, you can set the `as` property to `system` if you want the message to be seen as a system message by the agents.

If you want to privately message only some agents, you can set the `to` property to an array of agent names. The message will then only be seen by those agents. This can be used, for example, to give system feedback to an agent without the other agents seeing it. An example is a message saying "Sorry, your last action is illegal, please try again" if an agent breaks the rules, which you may want to direct only at a single agent.

Agents must each also be configured with a `systemPrompt`. This appears to them as the first message in the conversation and is generally used to tell the agent who they are and what they're doing.

Agents can optionally be configured by a `trailingSystemPrompt` which is like the system prompt but is always seen to the agent as the *last* message in the conversation. This can be used to give the agent a hint about what to do next, or to give them a reminder of who they are or of the rules, etc. For example `"You are Bob. It's your turn next."`. I found this was required because in long conversations, the agents can forget who they are.