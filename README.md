# email-agent

A server to monitor an email mailbox and relay conversations with ChatGPT. Includes an admin command interface and a SQLite backed database for user metrics and configuration. 

To install dependencies:

```bash
bun install
```

Set environment variables in a .env file:
```bash
EMAIL_AGENT_USER=<email for client to use>
EMAIL_AGENT_PW=<password for mailbox>
EMAIL_AGENT_ADMIN_PW=<admin password to use>
OPENAI_API_KEY=<API key for ChatGPT>
```

To run:

```bash
bun start
```

To test:

```bash
bun start test
```
